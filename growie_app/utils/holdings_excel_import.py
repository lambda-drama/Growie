# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt
"""
Parse the Final Web Data Import Template (.xlsx/.csv) and create Growe Holding rows.

Current sheet layout (header row):
- Purchase Dates, Investment, Ticker Number, API Ticker Number, ISO MIC Exchange,
  Broker, Shares Breakdown, Buying Price, Goal

``API Ticker Number`` is the US ticker — stored on Growe Stock / Growe Holding as
``us_ticker_number`` (used when a price API has Use US ticker enabled).

Legacy columns (Exchange, Currency, Current Price/Value, Sold Stocks block) are still
accepted for backward compatibility.

The trailing ``Goal`` column names the member's goal (e.g. "Retirement"). On import we
create/refresh a matching Growe Goal for the member and seed its amounts from the value of
the holdings tagged with that goal (see ``_sync_goal_from_holdings``).
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
	Return (clean_ticker, stripped_hint).

	Strips ``EXCHANGE:TICKER`` prefixes (``AMS:ADYEN``, ``NASDAQ:AAPL``) for the
	canonical ticker used in Growe Stock. US ticker comes from the separate
	``API Ticker Number`` column → ``us_ticker_number``.
	"""
	s = (raw or "").strip().upper()
	if not s:
		return "", ""
	hint = s
	if ":" in s:
		left, right = s.split(":", 1)
		left, right = left.strip(), right.strip()
		# EXCHANGE:TICKER (MIC alias or venue code on the left)
		if left and right and 1 <= len(left) <= 12 and re.match(r"^[A-Z0-9]+$", left):
			s = right
			hint = right
	s = re.sub(r"[^A-Z0-9.\-]", "", s) or hint
	return s[:40], hint[:140]


def _us_ticker_from_sheet(api_ticker_number: str) -> str:
	"""
	Excel ``API Ticker Number`` is the US ticker number — store as-is (normalized).
	"""
	return (api_ticker_number or "").strip().upper()[:140]


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
	# Excel serial date (e.g. 45502) when openpyxl returns a bare number
	if isinstance(val, (int, float)) and not isinstance(val, bool):
		try:
			from openpyxl.utils.datetime import from_excel

			parsed = from_excel(val)
			if isinstance(parsed, datetime):
				return parsed.date().isoformat()
			if isinstance(parsed, date):
				return parsed.isoformat()
		except Exception:
			pass
	s = _norm_cell(val)
	if not s:
		return str(today())
	# Numeric string serials
	if re.fullmatch(r"\d+(\.\d+)?", s):
		try:
			from openpyxl.utils.datetime import from_excel

			parsed = from_excel(float(s))
			if isinstance(parsed, datetime):
				return parsed.date().isoformat()
			if isinstance(parsed, date):
				return parsed.isoformat()
		except Exception:
			pass
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


def _asset_category_from_stock_row(row: dict) -> str:
	"""Map Growe Stock fields to a Growe Asset Category name (holding.asset_class Link)."""
	instrument = (row.get("instrument_type") or "").strip()
	if instrument and frappe.db.exists("Growe Asset Category", instrument):
		return instrument
	market = (row.get("market") or "Global").strip()
	return {
		"ETF": "ETF",
		"MMF": "Money Market Fund",
		"Real Estate": "Private Company/Other",
	}.get(market, "Stock")


def _holding_meta_from_stock(stock_name: str) -> tuple[str, str]:
	"""Return (Growe Asset Category name, currency) from the linked Growe Stock."""
	row = frappe.db.get_value(
		"Growe Stock",
		stock_name,
		["market", "currency", "instrument_type"],
		as_dict=True,
	) or {}
	market = (row.get("market") or "Global").strip()
	currency = (row.get("currency") or "").strip().upper()
	asset_class = _asset_category_from_stock_row(row)
	if not currency:
		from growie_app.utils.market_labels import is_kenya_market

		currency = "KES" if is_kenya_market(market) else "USD"
	return asset_class, currency


def _normalize_header(text: Any) -> str:
	return re.sub(r"\s+", " ", str(text or "").strip().lower())


def _column_map_from_header(header_row: tuple) -> dict[str, int]:
	"""Map logical field names to column indices from a header row."""
	aliases: dict[str, tuple[str, ...]] = {
		"date": ("purchase dates", "purchase date", "purchase period"),
		"sell_date": ("sell date",),
		"exchange": (
			"iso mic exchange",
			"iso mic",
			"exchange platform",
			"exchange",
		),
		"investment": ("investment",),
		# Excel "API Ticker Number" == Growe Stock / Holding us_ticker_number
		"us_ticker": (
			"api ticker number",
			"api ticker",
			"us ticker number",
			"us ticker",
		),
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
	used_idxs: set[int] = set()

	def _assign(field: str, idx: int) -> None:
		if field in col_map or idx in used_idxs:
			return
		col_map[field] = idx
		used_idxs.add(idx)

	# Exact header match first (avoids "API Ticker Number" matching "Ticker Number").
	for idx, cell in enumerate(header_row):
		h = _normalize_header(cell)
		if not h:
			continue
		for field, variants in aliases.items():
			if h in variants:
				_assign(field, idx)
				break

	# Substring fallback for remaining headers.
	for idx, cell in enumerate(header_row):
		if idx in used_idxs:
			continue
		h = _normalize_header(cell)
		if not h:
			continue
		for field, variants in aliases.items():
			if field in col_map:
				continue
			for v in variants:
				if v not in h:
					continue
				if field == "ticker" and ("api" in h or h.startswith("us ")):
					continue
				_assign(field, idx)
				break
	return col_map


def _parse_currency_cell(val: Any) -> str:
	"""Normalize template currency cells (US$, Euro, KES, USD, £, …) to ISO codes."""
	s = _norm_cell(val).upper().replace("$", "").replace(".", "").strip()
	if not s:
		return ""
	compact = s.replace(" ", "")
	word_map = {
		"US": "USD",
		"USD": "USD",
		"USDOLLAR": "USD",
		"USDOLLARS": "USD",
		"DOLLAR": "USD",
		"DOLLARS": "USD",
		"EUR": "EUR",
		"EURO": "EUR",
		"EUROS": "EUR",
		"€": "EUR",
		"GBP": "GBP",
		"POUND": "GBP",
		"POUNDS": "GBP",
		"STERLING": "GBP",
		"£": "GBP",
		"KES": "KES",
		"KSH": "KES",
		"KSHS": "KES",
		"SHILLING": "KES",
		"SHILLINGS": "KES",
		"KENYASHILLING": "KES",
		"KENYASHILLINGS": "KES",
	}
	if compact in word_map:
		return word_map[compact]
	if len(compact) == 3 and compact.isalpha():
		return compact
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


def _resolve_exchange_platform(exchange_code: str) -> str | None:
	"""Return a Growe Exchange Platform name for an exchange code, creating it if missing."""
	code = (exchange_code or "").strip().upper()
	if not code:
		return None
	existing = frappe.db.get_value("Growe Exchange Platform", {"exchange_code": code}, "name")
	if existing:
		return existing
	try:
		doc = frappe.get_doc(
			{
				"doctype": "Growe Exchange Platform",
				"platform_name": code,
				"exchange_code": code,
			}
		)
		doc.flags.ignore_permissions = True
		doc.insert()
		return doc.name
	except Exception:
		return None


def _market_from_exchange(exchange_code: str, currency: str) -> str:
	"""Best-effort canonical market (Kenya/Global) from exchange code, falling back to currency."""
	from growie_app.utils.market_labels import GLOBAL, KENYA

	code = (exchange_code or "").strip().upper()
	if code in ("NSE", "XNAI"):
		return KENYA
	if (currency or "").upper() == "KES":
		return KENYA
	return GLOBAL


def _pick_stock_for_import(ticker: str, exchange_hint: str = "", currency_hint: str = "") -> str | None:
	"""Prefer Growe Stock matching ticker + ISO Mic exchange platform when possible."""
	clean = (ticker or "").strip().upper()
	if not clean:
		return None
	platform = _resolve_exchange_platform(exchange_hint) if exchange_hint else None
	if platform:
		exact = frappe.db.get_value(
			"Growe Stock",
			{"ticker": clean, "exchange_platform": platform},
			"name",
		)
		if exact:
			return exact
		# Document name is usually ticker-exchange_code
		named = f"{clean}-{platform}"
		if frappe.db.exists("Growe Stock", named):
			return named

	from growie_app.utils.stock_verification import pick_best_stock_for_ticker

	return pick_best_stock_for_ticker(clean, currency_hint)


def _apply_import_stock_symbols(
	stock_name: str,
	*,
	us_ticker: str = "",
	exchange_hint: str = "",
) -> None:
	"""Fill missing us_ticker_number / exchange_platform from the sheet."""
	if not stock_name or not frappe.db.exists("Growe Stock", stock_name):
		return
	doc = frappe.get_doc("Growe Stock", stock_name)
	changed = False
	us = _us_ticker_from_sheet(us_ticker)
	# Excel API Ticker Number is the US ticker — always keep sheet value when present.
	if us and (doc.us_ticker_number or "").strip().upper() != us:
		doc.us_ticker_number = us
		changed = True
	if exchange_hint and not (doc.exchange_platform or "").strip():
		platform = _resolve_exchange_platform(exchange_hint)
		if platform:
			doc.exchange_platform = platform
			changed = True
	if changed:
		doc.flags.ignore_permissions = True
		doc.save()


def _insert_background_stock(
	raw_ticker: str,
	investment_hint: str,
	currency_hint: str,
	*,
	by_unsubscribed_member: bool,
	exchange_hint: str = "",
	us_ticker: str = "",
) -> str | None:
	"""Create an unverified Growe Stock row if none exists for this ticker. Returns doc name or None."""
	clean = (raw_ticker or "").strip().upper()
	if not clean:
		return None

	existing = _pick_stock_for_import(clean, exchange_hint, currency_hint)
	if existing:
		_apply_import_stock_symbols(
			existing,
			us_ticker=us_ticker,
			exchange_hint=exchange_hint,
		)
		return existing

	company = (investment_hint or "").strip() or clean
	ccy = _parse_currency_cell(currency_hint) or "USD"
	market = _market_from_exchange(exchange_hint, ccy)
	platform = _resolve_exchange_platform(exchange_hint)
	us = _us_ticker_from_sheet(us_ticker)

	instrument_type = "ETF" if market == "ETF" else "Stock"
	doc = frappe.get_doc(
		{
			"doctype": "Growe Stock",
			"ticker": clean,
			"company_name": company[:240],
			"market": market,
			"instrument_type": instrument_type,
			"currency": ccy,
			"us_ticker_number": us,
			"is_active": 1,
			"verified": 0,
			"by_unsubscribed_member": 1 if by_unsubscribed_member else 0,
			**({"exchange_platform": platform} if platform else {}),
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()
	return doc.name


def _get_or_create_stock(
	raw_ticker: str,
	investment_hint: str,
	currency_hint: str = "",
	investor: str | None = None,
	exchange_hint: str = "",
	us_ticker: str = "",
	*,
	admin_import: bool = False,
) -> dict:
	"""
	Resolve or create Growe Stock for an import row.

	``us_ticker`` comes from Excel ``API Ticker Number`` → Growe Stock.us_ticker_number.

	Free members: holdings only for verified master tickers. Missing tickers are still
	recorded on Growe Stock (unverified, by_unsubscribed_member) then skipped for holdings.
	Subscribed members: may create unverified listings and holdings (System Manager ToDos).
	Desk System Manager imports (admin_import=True) always create/attach holdings.
	Returns {name, created, ticker, company_name, us_ticker_number}.
	"""
	from growie_app.utils.stock_verification import (
		UnsupportedImportTicker,
		create_stock_verification_todos,
		member_is_subscribed,
	)

	clean, _hint = _normalize_ticker(raw_ticker)
	if not clean:
		frappe.throw(_("Missing ticker in row."))

	us_raw = _us_ticker_from_sheet(us_ticker)

	subscribed = True if admin_import else (member_is_subscribed(investor) if investor else False)
	existing_name = _pick_stock_for_import(clean, exchange_hint, currency_hint)
	if existing_name:
		_apply_import_stock_symbols(
			existing_name,
			us_ticker=us_raw,
			exchange_hint=exchange_hint,
		)
		is_verified = int(frappe.db.get_value("Growe Stock", existing_name, "verified") or 0)
		stored_us = (
			frappe.db.get_value("Growe Stock", existing_name, "us_ticker_number") or us_raw
		)
		if is_verified or subscribed:
			return {
				"name": existing_name,
				"created": False,
				"ticker": clean,
				"company_name": frappe.db.get_value("Growe Stock", existing_name, "company_name")
				or "",
				"us_ticker_number": stored_us,
			}
		raise UnsupportedImportTicker(clean)

	company = (investment_hint or "").strip() or clean
	if not subscribed:
		_insert_background_stock(
			clean,
			company,
			currency_hint,
			by_unsubscribed_member=True,
			exchange_hint=exchange_hint,
			us_ticker=us_raw,
		)
		raise UnsupportedImportTicker(clean)

	ccy = _parse_currency_cell(currency_hint) or "USD"
	market = _market_from_exchange(exchange_hint, ccy)
	platform = _resolve_exchange_platform(exchange_hint)

	instrument_type = "ETF" if market == "ETF" else "Stock"
	doc = frappe.get_doc(
		{
			"doctype": "Growe Stock",
			"ticker": clean,
			"company_name": company[:240],
			"market": market,
			"instrument_type": instrument_type,
			"currency": ccy,
			"us_ticker_number": us_raw,
			"is_active": 1,
			"verified": 1 if admin_import else 0,
			"by_unsubscribed_member": 0,
			**({"exchange_platform": platform} if platform else {}),
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()

	if not admin_import:
		create_stock_verification_todos(
			doc.name,
			clean,
			company,
			investor,
			from_unsubscribed=False,
		)

	return {
		"name": doc.name,
		"created": True,
		"ticker": clean,
		"company_name": company[:240],
		"us_ticker_number": us_raw,
	}


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
	us_ticker_number: str = "",
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
	# Templates without Current Price/Value columns: seed current value from cost basis
	# so the position is not zero before the first live-price refresh.
	if value_kes <= 0 and cost_kes > 0:
		value_kes = cost_kes

	notes_parts = []
	if owner:
		notes_parts.append(f"Owner: {owner}")
	if goal:
		notes_parts.append(f"Goal: {goal}")
	notes_parts.append("Imported from Excel")
	notes = " | ".join(notes_parts)

	us_from_sheet = _us_ticker_from_sheet(
		_norm_cell(_row_val_by_map(row, col_map, "us_ticker"))
	)
	us_val = us_from_sheet or (us_ticker_number or "").strip().upper()

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
		"us_ticker_number": us_val[:140] if us_val else "",
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


_GOAL_CATEGORY_OPTIONS = {
	"retirement": "Retirement",
	"home": "Home",
	"house": "Home",
	"education": "Education",
	"school": "Education",
	"emergency": "Emergency",
	"travel": "Travel",
	"wealth building": "Wealth Building",
	"wealth": "Wealth Building",
}


def _goal_category_for_name(goal_name: str) -> str:
	"""Map a free-text goal label to a valid Growe Goal category (defaults to Wealth Building)."""
	return _GOAL_CATEGORY_OPTIONS.get((goal_name or "").strip().lower(), "Wealth Building")


def _sum_open_holdings_value_kes(member: str, goal_name: str) -> float:
	"""Total current value (in KES) of the member's open holdings tagged with this goal."""
	from growie_app.api.portfolio import _to_kes

	rows = frappe.get_all(
		"Growe Holding",
		filters={"investor": member, "goal": goal_name, "sold": 0},
		fields=["value_kes", "currency"],
	)
	on_date = str(today())
	total = 0.0
	for r in rows:
		native = float(r.get("value_kes") or 0)
		if native <= 0:
			continue
		ccy = (r.get("currency") or "KES").upper()
		total += native if ccy == "KES" else _to_kes(native, ccy, on_date, strict=False)
	return total


def _kes_to_currency(amount_kes: float, currency: str, on_date: str) -> float:
	"""Convert a KES amount into ``currency`` using ERPNext exchange rates (hub: KES)."""
	from growie_app.api.portfolio import _to_kes

	ccy = (currency or "KES").upper()
	if ccy == "KES" or not amount_kes:
		return float(amount_kes or 0)
	kes_per_unit = _to_kes(1, ccy, on_date, strict=False)
	return amount_kes / kes_per_unit if kes_per_unit > 0 else float(amount_kes)


def _convert_currency_amount(amount: float, from_ccy: str, to_ccy: str, on_date: str) -> float:
	"""Convert an amount between two currencies via the KES hub."""
	from growie_app.api.portfolio import _to_kes

	src = (from_ccy or "KES").upper()
	dst = (to_ccy or "KES").upper()
	if not amount or src == dst:
		return float(amount or 0)
	return _kes_to_currency(_to_kes(amount, src, on_date, strict=False), dst, on_date)


def _sync_goal_from_holdings(member: str, goal_name: str) -> dict | None:
	"""
	Create (or refresh) a Growe Goal for ``goal_name`` and seed its amounts from the
	member's open holdings tagged with the same goal.

	The goal is denominated in the member's preferred (display) currency so it matches
	what they see elsewhere in the app. ``current_amount`` reflects the live value of the
	goal's holdings; ``target_amount`` is seeded to that value on first creation so the
	goal is valid — the member can adjust the real target in the UI.
	"""
	from frappe.utils import add_years

	name = (goal_name or "").strip()
	if not name:
		return None

	on_date = str(today())
	total_kes = _sum_open_holdings_value_kes(member, name)
	preferred_currency = (
		frappe.db.get_value("Growe Member", member, "preferred_currency") or "USD"
	).upper()
	existing = frappe.db.get_value("Growe Goal", {"member": member, "goal_name": name}, "name")

	if existing:
		doc = frappe.get_doc("Growe Goal", existing)
		# A goal with logged transactions owns its currency; leave it untouched. An
		# import-seeded goal (no transactions) is re-denominated to the member's
		# preferred (display) currency so it matches the rest of the app.
		old_currency = (doc.currency or "USD").upper()
		has_txns = frappe.db.count("Growe Goal Transaction", {"goal": doc.name, "docstatus": 1})
		goal_currency = old_currency if has_txns else preferred_currency
		total = round(_kes_to_currency(total_kes, goal_currency, on_date), 2)
		# Preserve the target's real-world magnitude when re-denominating the goal.
		old_target = float(doc.target_amount or 0)
		if goal_currency != old_currency and old_target > 0:
			new_target = round(_convert_currency_amount(old_target, old_currency, goal_currency, on_date), 2)
		else:
			new_target = old_target
		if new_target <= 0 and total > 0:
			new_target = total
		doc.currency = goal_currency
		doc.current_amount = total
		doc.target_amount = new_target
		doc.flags.ignore_permissions = True
		doc.save()
		return {
			"name": doc.name,
			"goal_name": name,
			"created": False,
			"current_amount": total,
			"currency": goal_currency,
		}

	goal_currency = preferred_currency
	total = round(_kes_to_currency(total_kes, goal_currency, on_date), 2)

	if total <= 0:
		# Nothing to seed and target_amount is mandatory (> 0) — skip creating an empty goal.
		return None

	doc = frappe.get_doc(
		{
			"doctype": "Growe Goal",
			"member": member,
			"goal_name": name,
			"category": _goal_category_for_name(name),
			"currency": goal_currency,
			"target_amount": total,
			"current_amount": total,
			"target_date": getdate(add_years(today(), 5)),
			"priority": "Medium",
			"status": "Active",
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()
	return {
		"name": doc.name,
		"goal_name": name,
		"created": True,
		"current_amount": total,
		"currency": goal_currency,
	}


def _import_scope_template_rows(
	rows: list[tuple],
	investor: str,
	source_label: str,
	*,
	admin_import: bool = False,
) -> dict:
	"""Shared import for Excel, CSV, and Google Sheets (same Scope template columns)."""
	from growie_app.utils.stock_verification import (
		UnsupportedImportTicker,
		member_is_subscribed,
		pending_verification_row,
	)

	_assert_can_import_for_investor(investor)

	active_rows, sold_rows, active_col_map, sold_col_map = _split_active_and_sold(rows)
	created = 0
	skipped = 0
	errors: list[str] = []
	unsupported_tickers: list[str] = []
	pending_map: dict[str, dict] = {}
	goal_names: set[str] = set()
	is_subscribed = True if admin_import else member_is_subscribed(investor)

	def _track_pending(stock_name: str) -> None:
		row = pending_verification_row(stock_name)
		if row:
			pending_map[row["stock_name"]] = row

	def _handle_row_error(label: str, err: Exception) -> None:
		nonlocal skipped
		if isinstance(err, UnsupportedImportTicker):
			skipped += 1
			if err.ticker and err.ticker not in unsupported_tickers:
				unsupported_tickers.append(err.ticker)
			errors.append(f"{label}: {err.ticker} is not supported on your plan.")
			return
		errors.append(f"{label}: {err!s}")
		frappe.log_error(
			title="Holding import row",
			message=f"{source_label}\n{err!s}",
		)

	for i, row in enumerate(active_rows):
		try:
			investment = _norm_cell(_row_val_by_map(row, active_col_map, "investment")) or _norm_cell(
				_row_val_by_map(row, active_col_map, "ticker")
			)
			raw_tk = _norm_cell(_row_val_by_map(row, active_col_map, "ticker"))
			us_tk = _us_ticker_from_sheet(
				_norm_cell(_row_val_by_map(row, active_col_map, "us_ticker"))
			)
			use_date = _parse_date_cell(_row_val_by_map(row, active_col_map, "date"))
			sheet_ccy = _parse_currency_cell(_row_val_by_map(row, active_col_map, "currency"))
			exchange_hint = _norm_cell(_row_val_by_map(row, active_col_map, "exchange"))

			stock_info = _get_or_create_stock(
				raw_tk,
				investment,
				sheet_ccy,
				investor=investor,
				exchange_hint=exchange_hint,
				us_ticker=us_tk,
				admin_import=admin_import,
			)
			stock_doc = stock_info["name"]
			if stock_info.get("created") and not admin_import:
				_track_pending(stock_doc)
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
				us_ticker_number=stock_info.get("us_ticker_number") or "",
			)
			created += 1
			goal_val = _norm_cell(_row_val_by_map(row, active_col_map, "goal"))
			if goal_val:
				goal_names.add(goal_val)
		except Exception as e:
			_handle_row_error(f"Active row {i + 1}", e)

	for j, row in enumerate(sold_rows):
		try:
			raw_tk = _norm_cell(_row_val_by_map(row, sold_col_map, "ticker"))
			us_tk = _us_ticker_from_sheet(
				_norm_cell(_row_val_by_map(row, sold_col_map, "us_ticker"))
			)
			use_date = _parse_date_cell(_row_val_by_map(row, sold_col_map, "date"))
			sell_raw = _row_val_by_map(row, sold_col_map, "sell_date")
			if isinstance(sell_raw, datetime):
				sold_date = sell_raw.date().isoformat()
			elif isinstance(sell_raw, date):
				sold_date = sell_raw.isoformat()
			else:
				s = _norm_cell(sell_raw)
				sold_date = str(getdate(s)) if s else None

			stock_info = _get_or_create_stock(
				raw_tk,
				"",
				"",
				investor=investor,
				us_ticker=us_tk,
				admin_import=admin_import,
			)
			stock_doc = stock_info["name"]
			if stock_info.get("created") and not admin_import:
				_track_pending(stock_doc)
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
				us_ticker_number=stock_info.get("us_ticker_number") or "",
			)
			created += 1
			goal_val = _norm_cell(_row_val_by_map(row, sold_col_map, "goal"))
			if goal_val:
				goal_names.add(goal_val)
		except Exception as e:
			_handle_row_error(f"Sold row {j + 1}", e)

	frappe.db.commit()

	goals: list[dict] = []
	for gname in sorted(goal_names):
		try:
			info = _sync_goal_from_holdings(investor, gname)
			if info:
				goals.append(info)
		except Exception as e:
			frappe.log_error(title="Holding import goal sync", message=f"{gname}\n{e!s}")
	if goals:
		frappe.db.commit()
	pending_verification = sorted(
		pending_map.values(),
		key=lambda r: (r.get("ticker") or "").upper(),
	) if is_subscribed and not admin_import else []
	return {
		"created": created,
		"skipped": skipped,
		"active_rows": len(active_rows),
		"sold_rows": len(sold_rows),
		"errors": errors,
		"source": source_label,
		"unsupported_tickers": unsupported_tickers,
		"pending_verification": pending_verification,
		"pending_verification_count": len(pending_verification),
		"is_subscribed": is_subscribed,
		"goals": goals,
		"goals_count": len(goals),
	}


@frappe.whitelist()
def import_scope_template_excel(file_url: str, investor: str, admin_import: int = 0):
	"""
	Import the Final Web Data Import Template (.xlsx) into Growe Holding.

	:param file_url: Uploaded File ``file_url`` (Desk attach or portal ``upload_file``).
	:param investor: Growe Member name (must match the signed-in member unless System Manager).
	:param admin_import: When 1 (Desk System Manager), create/verify stocks as needed.
	"""
	path = _get_uploaded_file_path(file_url)
	rows = _rows_from_excel_path(path)
	return _import_scope_template_rows(
		rows,
		investor,
		"Excel",
		admin_import=bool(int(admin_import or 0)),
	)


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
