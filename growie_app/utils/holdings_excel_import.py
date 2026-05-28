# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt
"""
Parse Scope-style stocks Excel (Sample Stocks Template with Data) and create Growe Holding rows.

Active sheet layout (row with headers containing Ticker # and Currency):
- Purchase Dates, Investment, Ticker #, Broker, Shares Breakdown, Buying Price, Currency,
  Initial Investment Value, Goal

Sold block: first cell == "Sold Stocks", then header row, then sold rows.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from typing import Any
from urllib.parse import parse_qs, urlparse

import frappe
import requests
from frappe import _
from frappe.utils import getdate, now_datetime, today


def _norm_cell(val: Any) -> str:
	if val is None:
		return ""
	if isinstance(val, datetime):
		return val.strftime("%Y-%m-%d")
	if isinstance(val, date):
		return val.isoformat()
	return str(val).strip()


def _to_float(val: Any) -> float | None:
	"""Parse numbers from Excel/CSV cells (plain, comma-separated, or currency text)."""
	if val is None or val == "":
		return None
	if isinstance(val, bool):
		return None
	if isinstance(val, (int, float)):
		return float(val)
	s = str(val).strip()
	if not s:
		return None
	neg = s.startswith("(") and s.endswith(")")
	if neg:
		s = s[1:-1].strip()
	s = s.replace(",", "")
	s = re.sub(r"[^\d.\-eE]", "", s)
	if not s or s in (".", "-", "-."):
		return None
	try:
		n = float(s)
		return -n if neg else n
	except ValueError:
		return None


def _normalize_ticker(raw: str) -> tuple[str, str]:
	"""
	Return (clean_ticker, api_symbol).
	Strips NASDAQ:/NYSE:/AMEX: prefixes for the canonical ticker used in Growe Stock.
	"""
	s = (raw or "").strip().upper()
	if not s:
		return "", ""
	api_symbol = s
	for prefix in ("NASDAQ:", "NYSE:", "AMEX:", "OTC:", "ARCA:"):
		if s.startswith(prefix):
			s = s[len(prefix) :].strip()
			break
	s = re.sub(r"[^A-Z0-9.\-]", "", s) or api_symbol
	return s[:40], api_symbol[:140]


def _get_uploaded_file_path(file_url: str) -> str:
	if not file_url:
		frappe.throw(_("Attach a file first."))
	name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not name and "/" in (file_url or ""):
		tail = file_url.strip().split("/")[-1]
		if tail:
			name = frappe.db.get_value("File", {"file_name": tail}, "name")
	if not name:
		frappe.throw(_("Uploaded file not found. Try uploading again."))
	return frappe.get_doc("File", name).get_full_path()


def _parse_date_cell(val: Any) -> str:
	if isinstance(val, datetime):
		return val.date().isoformat()
	if isinstance(val, date):
		return val.isoformat()
	s = _norm_cell(val)
	if not s:
		return str(today())
	try:
		return str(getdate(s))
	except Exception:
		return str(today())


def _rows_from_excel_path(path: str) -> list[tuple]:
	try:
		import openpyxl
	except ImportError as e:
		frappe.throw(_("openpyxl is required for Excel import: {0}").format(e))
	wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
	try:
		ws = wb.active
		return [tuple(r) for r in ws.iter_rows(values_only=True)]
	finally:
		wb.close()


def _rows_from_csv_path(path: str) -> list[tuple]:
	rows: list[tuple] = []
	for encoding in ("utf-8-sig", "utf-8", "latin-1"):
		try:
			with open(path, newline="", encoding=encoding) as f:
				for row in csv.reader(f):
					rows.append(tuple(row))
			return rows
		except UnicodeDecodeError:
			continue
	if not rows:
		frappe.throw(_("Could not read the CSV file. Save it as UTF-8 and try again."))
	return rows


def _rows_from_csv_bytes(data: bytes) -> list[tuple]:
	text = None
	for encoding in ("utf-8-sig", "utf-8", "latin-1"):
		try:
			text = data.decode(encoding)
			break
		except UnicodeDecodeError:
			continue
	if not text:
		frappe.throw(_("Could not decode spreadsheet data as text."))
	reader = csv.reader(io.StringIO(text))
	return [tuple(row) for row in reader]


def _google_sheets_export_url(spreadsheet_url: str) -> str:
	"""
	Build a public CSV export URL from a Google Sheets view/edit link.
	Sheet must be shared (anyone with the link can view).
	"""
	raw = (spreadsheet_url or "").strip()
	if not raw:
		frappe.throw(_("Paste a Google Sheets link."))

	# Already an export URL
	if "export?format=csv" in raw or "output=csv" in raw:
		return raw

	parsed = urlparse(raw)
	if "docs.google.com" not in (parsed.netloc or ""):
		frappe.throw(_("Only Google Sheets links are supported. Paste a docs.google.com/spreadsheets/… URL."))

	m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", raw)
	if not m:
		frappe.throw(_("Could not find a spreadsheet ID in that link."))

	sheet_id = m.group(1)
	qs = parse_qs(parsed.query)
	gid = (qs.get("gid") or [None])[0]
	if not gid:
		gid_m = re.search(r"[#&]gid=(\d+)", raw)
		gid = gid_m.group(1) if gid_m else None

	url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
	if gid:
		url += f"&gid={gid}"
	return url


def _fetch_spreadsheet_rows(spreadsheet_url: str) -> list[tuple]:
	export_url = _google_sheets_export_url(spreadsheet_url)
	try:
		resp = requests.get(export_url, timeout=45, headers={"User-Agent": "Growe/1.0"})
	except requests.RequestException as e:
		frappe.throw(_("Could not download the spreadsheet: {0}").format(e))

	if resp.status_code == 403:
		frappe.throw(
			_(
				"The spreadsheet is not accessible. Share it so anyone with the link can view, then try again."
			)
		)
	if not resp.ok:
		frappe.throw(
			_("Spreadsheet download failed (HTTP {0}). Check the link and sharing settings.").format(
				resp.status_code
			)
		)
	content = resp.content or b""
	if not content or content[:15].lower().startswith(b"<!doctype") or content[:6].lower().startswith(b"<html"):
		frappe.throw(
			_(
				"The link did not return CSV data. Use a Google Sheets link and enable link sharing (view access)."
			)
		)
	return _rows_from_csv_bytes(content)


def _holding_meta_from_stock(stock_name: str) -> tuple[str, str]:
	"""Return (Growe Holding asset_class, currency) from the linked Growe Stock."""
	row = frappe.db.get_value(
		"Growe Stock",
		stock_name,
		["market", "currency"],
		as_dict=True,
	) or {}
	market = (row.get("market") or "Global").strip()
	currency = (row.get("currency") or "").strip().upper()
	asset_class = {
		"NSE": "NSE",
		"Global": "Global",
		"ETF": "ETF",
		"MMF": "MMF",
		"Real Estate": "Real Estate",
	}.get(market, "Global")
	if not currency:
		currency = "KES" if market == "NSE" else "USD"
	return asset_class, currency


def _normalize_header(text: Any) -> str:
	return re.sub(r"\s+", " ", str(text or "").strip().lower())


def _column_map_from_header(header_row: tuple) -> dict[str, int]:
	"""Map logical field names to column indices from a header row."""
	aliases: dict[str, tuple[str, ...]] = {
		"date": ("purchase dates", "purchase date", "purchase period"),
		"sell_date": ("sell date",),
		"investment": ("investment",),
		"ticker": ("ticker #", "ticker number", "ticker"),
		"broker": ("broker",),
		"shares": ("shares breakdown", "shares"),
		"buy_price": ("buying price",),
		"currency": ("currency",),
		"init_inv": ("initial investment value", "initial investment"),
		"cur_price": ("current price",),
		"cur_val": ("current value", "current investment value"),
		"delta": ("change in investment value", "delta"),
		"pct": ("percentage", "% change"),
		"owner": ("owner",),
		"goal": ("goal",),
	}
	col_map: dict[str, int] = {}
	for idx, cell in enumerate(header_row):
		h = _normalize_header(cell)
		if not h:
			continue
		for field, variants in aliases.items():
			if field in col_map:
				continue
			for v in variants:
				if h == v or v in h:
					col_map[field] = idx
					break
	return col_map


def _parse_currency_cell(val: Any) -> str:
	"""Normalize template currency cells (US$, KES, USD, …) to ISO codes."""
	s = _norm_cell(val).upper().replace("$", "").strip()
	if not s:
		return ""
	if s in ("US", "USD", "U.S.", "U.S.D", "US$"):
		return "USD"
	if s in ("KES", "KSH", "KSHS", "KSH."):
		return "KES"
	if s in ("EUR", "€"):
		return "EUR"
	if s in ("GBP", "£"):
		return "GBP"
	if len(s) == 3 and s.isalpha():
		return s
	return ""


def _row_val_by_map(row: tuple, col_map: dict[str, int], field: str) -> Any:
	idx = col_map.get(field)
	if idx is None:
		return None
	return _row_val(row, idx)


def _legacy_active_column_map() -> dict[str, int]:
	"""Older Scope template without a Currency column."""
	return {
		"date": 0,
		"investment": 1,
		"ticker": 2,
		"broker": 3,
		"shares": 4,
		"buy_price": 5,
		"cur_price": 6,
		"init_inv": 7,
		"cur_val": 8,
		"delta": 9,
		"pct": 10,
		"owner": 11,
		"goal": 12,
	}


def _legacy_sold_column_map() -> dict[str, int]:
	return {
		"date": 0,
		"sell_date": 1,
		"ticker": 2,
		"broker": 3,
		"shares": 4,
		"buy_price": 5,
		"cur_price": 6,
		"cur_val": 7,
		"goal": 8,
	}


def _find_header_row_and_map(rows: list[tuple], end: int) -> tuple[int | None, dict[str, int]]:
	for i in range(min(end, 8)):
		row = rows[i]
		if not row:
			continue
		col_map = _column_map_from_header(row)
		if "ticker" in col_map:
			return i, col_map
	return None, _legacy_active_column_map()


def _get_or_create_stock(raw_ticker: str, investment_hint: str, currency_hint: str = "") -> str:
	clean, api_raw = _normalize_ticker(raw_ticker)
	if not clean:
		frappe.throw(_("Missing ticker in row."))

	matches = frappe.get_all(
		"Growe Stock",
		filters={"ticker": clean},
		fields=["name", "market"],
		order_by="modified desc",
	)
	if len(matches) == 1:
		return matches[0].name
	if len(matches) > 1:
		for m in matches:
			if (m.market or "").strip() == "NSE":
				return m.name
		return matches[0].name

	company = (investment_hint or "").strip() or clean
	ccy = _parse_currency_cell(currency_hint) or "USD"
	market = "NSE" if ccy == "KES" else "Global"
	if ccy != "KES" and ccy != "USD":
		market = "Global"

	base = clean
	name = base
	n = 0
	while frappe.db.exists("Growe Stock", name):
		n += 1
		name = f"{base}-{n}"

	doc = frappe.get_doc(
		{
			"doctype": "Growe Stock",
			"ticker": clean,
			"company_name": company[:240],
			"market": market,
			"currency": ccy,
			"api_symbol": api_raw or clean,
			"is_active": 1,
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert(set_name=name)
	return doc.name


def _split_active_and_sold(rows: list[tuple]) -> tuple[list[tuple], list[tuple], dict[str, int], dict[str, int]]:
	"""Return active rows, sold rows, and column maps for each section."""
	sold_idx = None
	for i, row in enumerate(rows):
		if row and str(row[0] or "").strip().upper() == "SOLD STOCKS":
			sold_idx = i
			break

	active_end = sold_idx if sold_idx is not None else len(rows)
	header_idx, active_col_map = _find_header_row_and_map(rows, active_end)
	start = (header_idx + 1) if header_idx is not None else 2

	active_rows: list[tuple] = []
	for r in range(start, active_end):
		row = rows[r]
		if not row:
			continue
		if str(row[0] or "").strip().upper() == "SOLD STOCKS":
			break
		if row[0] is None and len(row) > 2 and row[2] is None:
			continue
		ticker_cell = _row_val_by_map(row, active_col_map, "ticker")
		if ticker_cell is None or str(ticker_cell).strip() == "":
			continue
		active_rows.append(row)

	sold_rows: list[tuple] = []
	sold_col_map = _legacy_sold_column_map()
	if sold_idx is not None:
		sold_hdr_idx = sold_idx + 1
		if sold_hdr_idx < len(rows):
			parsed = _column_map_from_header(rows[sold_hdr_idx])
			if "ticker" in parsed:
				sold_col_map = parsed
		for r in range(sold_hdr_idx + 1, len(rows)):
			row = rows[r]
			if not row:
				continue
			ticker_cell = _row_val_by_map(row, sold_col_map, "ticker")
			if ticker_cell is None or str(ticker_cell).strip() == "":
				continue
			sold_rows.append(row)

	return active_rows, sold_rows, active_col_map, sold_col_map


def _percent_from_excel(val: Any) -> float | None:
	f = _to_float(val)
	if f is None:
		return None
	# Template uses decimals (-0.18 = -18%)
	if abs(f) <= 1.0001:
		return round(f * 100.0, 4)
	return round(f, 4)


def _holding_amounts_as_uploaded(
	current_value: float | None,
	initial_investment: float | None,
) -> tuple[float, float]:
	"""
	Return (value_kes, cost_basis_kes) **numeric** amounts as they appear in the sheet.

	The template stores amounts in the row's ``Currency`` column (any supported code or symbol).
	We set ``currency`` on the holding and store the same numbers in ``value_kes`` /
	``cost_basis_kes`` without FX conversion (legacy field names; amounts follow ``currency``).
	"""
	return float(current_value or 0), float(initial_investment or 0)


def _row_val(row: tuple, index: int) -> Any:
	return row[index] if index < len(row) else None


def _insert_holding(
	investor: str,
	asset_name: str,
	ticker_symbol: str,
	row: tuple,
	*,
	col_map: dict[str, int],
	asset_class: str,
	currency: str,
	sold: bool,
	use_date: str,
	sold_date: str | None,
) -> None:
	broker = _norm_cell(_row_val_by_map(row, col_map, "broker"))
	shares = _to_float(_row_val_by_map(row, col_map, "shares"))
	buy_px = _to_float(_row_val_by_map(row, col_map, "buy_price"))
	cur_px = _to_float(_row_val_by_map(row, col_map, "cur_price"))
	init_inv = _to_float(_row_val_by_map(row, col_map, "init_inv"))
	cur_val = _to_float(_row_val_by_map(row, col_map, "cur_val"))
	delta_v = _to_float(_row_val_by_map(row, col_map, "delta"))
	pct = _percent_from_excel(_row_val_by_map(row, col_map, "pct"))
	owner = _norm_cell(_row_val_by_map(row, col_map, "owner"))
	goal = _norm_cell(_row_val_by_map(row, col_map, "goal"))

	sheet_currency = _parse_currency_cell(_row_val_by_map(row, col_map, "currency"))
	if sheet_currency:
		currency = sheet_currency

	qty = shares if shares is not None else 0.0
	if (buy_px is None or buy_px <= 0) and qty > 0 and init_inv:
		buy_px = init_inv / qty
	if (cur_px is None or cur_px <= 0) and qty > 0 and cur_val:
		cur_px = cur_val / qty

	value_kes, cost_kes = _holding_amounts_as_uploaded(cur_val, init_inv)
	if cost_kes <= 0 and buy_px and qty > 0:
		cost_kes = buy_px * qty
	if value_kes <= 0 and cur_px and qty > 0:
		value_kes = cur_px * qty
	elif value_kes <= 0 and init_inv:
		value_kes = init_inv

	notes_parts = []
	if owner:
		notes_parts.append(f"Owner: {owner}")
	if goal:
		notes_parts.append(f"Goal: {goal}")
	notes_parts.append("Imported from Excel")
	notes = " | ".join(notes_parts)

	doc_dict: dict = {
		"doctype": "Growe Holding",
		"investor": investor,
		"asset_class": asset_class,
		"asset_name": asset_name,
		"ticker": ticker_symbol,
		"currency": currency,
		"quantity": qty,
		"value_kes": value_kes,
		"cost_basis_kes": cost_kes,
		"date_added": getdate(use_date),
		"broker": broker[:140] if broker else "",
		"initial_investment_value": init_inv or 0,
		"share_breakdown": qty,
		"buying_price": buy_px or 0,
		"current_price": cur_px or 0,
		"delta": delta_v or 0,
		"goal": goal[:140] if goal else "",
		"notes": notes[:240],
		"sold": 1 if sold else 0,
		"last_updated": now_datetime(),
	}
	if pct is not None:
		doc_dict["percentage"] = pct
	if sold and sold_date:
		doc_dict["sold_date"] = getdate(sold_date)

	doc = frappe.get_doc(doc_dict)
	doc.flags.ignore_permissions = True
	doc.insert()


def _assert_can_import_for_investor(investor: str) -> None:
	"""Desk: System Manager / Administrator may import for any member. Portal: own member only."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in."), frappe.AuthenticationError)
	if not investor:
		frappe.throw(_("Investor (Growe Member) is required."))
	if not frappe.db.exists("Growe Member", investor):
		frappe.throw(_("Invalid Growe Member."))
	if frappe.session.user == "Administrator":
		return
	if "System Manager" in frappe.get_roles(frappe.session.user):
		return
	member = frappe.db.get_value("Growe Member", {"user": frappe.session.user}, "name")
	if member != investor:
		frappe.throw(
			_("You can only import holdings for your own Growe Member profile."),
			frappe.PermissionError,
		)


def _import_scope_template_rows(rows: list[tuple], investor: str, source_label: str) -> dict:
	"""Shared import for Excel, CSV, and Google Sheets (same Scope template columns)."""
	_assert_can_import_for_investor(investor)

	active_rows, sold_rows, active_col_map, sold_col_map = _split_active_and_sold(rows)
	created = 0
	errors: list[str] = []
	for i, row in enumerate(active_rows):
		try:
			investment = _norm_cell(_row_val_by_map(row, active_col_map, "investment")) or _norm_cell(
				_row_val_by_map(row, active_col_map, "ticker")
			)
			raw_tk = _norm_cell(_row_val_by_map(row, active_col_map, "ticker"))
			use_date = _parse_date_cell(_row_val_by_map(row, active_col_map, "date"))
			sheet_ccy = _parse_currency_cell(_row_val_by_map(row, active_col_map, "currency"))

			stock_doc = _get_or_create_stock(raw_tk, investment, sheet_ccy)
			ticker_sym = frappe.db.get_value("Growe Stock", stock_doc, "ticker") or raw_tk
			asset_class, currency = _holding_meta_from_stock(stock_doc)
			if sheet_ccy:
				currency = sheet_ccy

			_insert_holding(
				investor,
				stock_doc,
				ticker_sym,
				row,
				col_map=active_col_map,
				asset_class=asset_class,
				currency=currency,
				sold=False,
				use_date=use_date,
				sold_date=None,
			)
			created += 1
		except Exception as e:
			errors.append(f"Active row {i + 1}: {e!s}")
			frappe.log_error(
				title="Holding import active row",
				message=f"{source_label}\n{e!s}\n{row}",
			)

	for j, row in enumerate(sold_rows):
		try:
			raw_tk = _norm_cell(_row_val_by_map(row, sold_col_map, "ticker"))
			use_date = _parse_date_cell(_row_val_by_map(row, sold_col_map, "date"))
			sell_raw = _row_val_by_map(row, sold_col_map, "sell_date")
			if isinstance(sell_raw, datetime):
				sold_date = sell_raw.date().isoformat()
			elif isinstance(sell_raw, date):
				sold_date = sell_raw.isoformat()
			else:
				s = _norm_cell(sell_raw)
				sold_date = str(getdate(s)) if s else None

			stock_doc = _get_or_create_stock(raw_tk, "", "")
			ticker_sym = frappe.db.get_value("Growe Stock", stock_doc, "ticker") or raw_tk
			asset_class, currency = _holding_meta_from_stock(stock_doc)

			_insert_holding(
				investor,
				stock_doc,
				ticker_sym,
				row,
				col_map=sold_col_map,
				asset_class=asset_class,
				currency=currency,
				sold=True,
				use_date=use_date,
				sold_date=sold_date,
			)
			created += 1
		except Exception as e:
			errors.append(f"Sold row {j + 1}: {e!s}")
			frappe.log_error(
				title="Holding import sold row",
				message=f"{source_label}\n{e!s}\n{row}",
			)

	frappe.db.commit()
	return {
		"created": created,
		"skipped": 0,
		"active_rows": len(active_rows),
		"sold_rows": len(sold_rows),
		"errors": errors,
		"source": source_label,
	}


@frappe.whitelist()
def import_scope_template_excel(file_url: str, investor: str):
	"""
	Import Sample Stocks Template with Data (.xlsx) into Growe Holding.

	:param file_url: Uploaded File ``file_url`` (Desk attach or portal ``upload_file``).
	:param investor: Growe Member name (must match the signed-in member unless System Manager).
	"""
	path = _get_uploaded_file_path(file_url)
	rows = _rows_from_excel_path(path)
	return _import_scope_template_rows(rows, investor, "Excel")


@frappe.whitelist()
def import_scope_template_csv(file_url: str, investor: str):
	"""Import Scope template from an uploaded .csv file."""
	path = _get_uploaded_file_path(file_url)
	rows = _rows_from_csv_path(path)
	return _import_scope_template_rows(rows, investor, "CSV")


@frappe.whitelist()
def import_scope_template_spreadsheet(spreadsheet_url: str, investor: str):
	"""Import Scope template from a public Google Sheets link (exported as CSV)."""
	rows = _fetch_spreadsheet_rows(spreadsheet_url)
	return _import_scope_template_rows(rows, investor, "Google Sheets")
