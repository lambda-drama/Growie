# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt
"""
Parse Scope-style global stocks Excel (Sample Global Stocks Template) and create Growe Holding rows.

Sheet layout:
- Row 1: headers (Purchase Dates, Investment, Ticker #, Broker, Shares Breakdown, …)
- Data rows until a row with first cell == "SOLD STOCKS"
- "SOLD STOCKS" block: header row with Purchase Period, Sell date, Ticker Number, …
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

import frappe
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
	if val is None or val == "":
		return None
	try:
		return float(val)
	except (TypeError, ValueError):
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


def _get_excel_path(file_url: str) -> str:
	if not file_url:
		frappe.throw(_("Attach an Excel file first."))
	name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not name and "/" in (file_url or ""):
		tail = file_url.strip().split("/")[-1]
		if tail:
			name = frappe.db.get_value("File", {"file_name": tail}, "name")
	if not name:
		frappe.throw(_("Uploaded file not found. Try uploading again."))
	return frappe.get_doc("File", name).get_full_path()


def _get_or_create_stock(raw_ticker: str, investment_hint: str) -> str:
	clean, api_raw = _normalize_ticker(raw_ticker)
	if not clean:
		frappe.throw(_("Missing ticker in row."))

	stock_name = frappe.db.get_value(
		"Growe Stock",
		{"ticker": clean, "market": "Global"},
		"name",
	)
	if not stock_name:
		stock_name = frappe.db.get_value("Growe Stock", {"ticker": clean}, "name")
	if stock_name:
		return stock_name

	company = (investment_hint or "").strip() or clean
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
			"market": "Global",
			"currency": "USD",
			"api_symbol": api_raw or clean,
			"is_active": 1,
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert(set_name=name)
	return doc.name


def _split_active_and_sold(rows: list[tuple]) -> tuple[list[tuple], list[tuple]]:
	"""rows: all values_only rows from sheet."""
	sold_idx = None
	for i, row in enumerate(rows):
		if row and str(row[0] or "").strip().upper() == "SOLD STOCKS":
			sold_idx = i
			break

	active_end = sold_idx if sold_idx is not None else len(rows)
	# Data starts after row 1 (header); row 0 may be a title row
	start = 2
	active_rows: list[tuple] = []
	for r in range(start, active_end):
		row = rows[r]
		if not row:
			continue
		if str(row[0] or "").strip().upper() == "SOLD STOCKS":
			break
		# Skip summary / blank blocks
		if row[0] is None and row[2] is None:
			continue
		if row[2] is None or str(row[2]).strip() == "":
			continue
		active_rows.append(row)

	sold_rows: list[tuple] = []
	if sold_idx is not None:
		hdr = sold_idx + 1
		for r in range(hdr + 1, len(rows)):
			row = rows[r]
			if not row:
				continue
			if row[2] is None or str(row[2]).strip() == "":
				continue
			sold_rows.append(row)

	return active_rows, sold_rows


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

	The Scope template is USD; we set ``currency`` = USD on the holding and store the same
	numbers in ``value_kes`` / ``cost_basis_kes`` without FX conversion, so ERPNext Currency
	Exchange is not required for import. (Field names are legacy; amounts follow ``currency``.)
	"""
	return float(current_value or 0), float(initial_investment or 0)


def _insert_holding(
	investor: str,
	asset_name: str,
	ticker_symbol: str,
	row: tuple,
	*,
	sold: bool,
	use_date: str,
	sold_date: str | None,
) -> None:
	broker = _norm_cell(row[3])
	shares = _to_float(row[4])
	buy_px = _to_float(row[5])
	cur_px = _to_float(row[6])
	init_inv = _to_float(row[7])
	cur_val = _to_float(row[8])
	delta_v = _to_float(row[9])
	pct = _percent_from_excel(row[10])
	owner = _norm_cell(row[11])
	goal = _norm_cell(row[12])

	value_kes, cost_kes = _holding_amounts_as_uploaded(cur_val, init_inv)

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
		"asset_class": "Global",
		"asset_name": asset_name,
		"ticker": ticker_symbol,
		"currency": "USD",
		"quantity": shares or 0,
		"value_kes": value_kes,
		"cost_basis_kes": cost_kes,
		"date_added": getdate(use_date),
		"broker": broker[:140] if broker else "",
		"initial_investment_value": init_inv or 0,
		"share_breakdown": shares,
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


@frappe.whitelist()
def import_scope_template_excel(file_url: str, investor: str):
	"""
	Import Sample Global Stocks Template .xlsx into Growe Holding.

	:param file_url: Uploaded File ``file_url`` (Desk attach or portal ``upload_file``).
	:param investor: Growe Member name (must match the signed-in member unless System Manager).
	"""
	_assert_can_import_for_investor(investor)

	try:
		import openpyxl
	except ImportError as e:
		frappe.throw(f"openpyxl is required: {e}")

	path = _get_excel_path(file_url)
	wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
	try:
		ws = wb.active
		rows = [tuple(r) for r in ws.iter_rows(values_only=True)]
	finally:
		wb.close()

	active_rows, sold_rows = _split_active_and_sold(rows)
	created = 0
	errors: list[str] = []
	for i, row in enumerate(active_rows):
		try:
			purchase = row[0]
			investment = _norm_cell(row[1]) or _norm_cell(row[2])
			raw_tk = _norm_cell(row[2])
			if isinstance(purchase, datetime):
				use_date = purchase.date().isoformat()
			elif isinstance(purchase, date):
				use_date = purchase.isoformat()
			else:
				use_date = today()

			stock_doc = _get_or_create_stock(raw_tk, investment)
			ticker_sym = frappe.db.get_value("Growe Stock", stock_doc, "ticker") or raw_tk

			_insert_holding(
				investor,
				stock_doc,
				ticker_sym,
				row,
				sold=False,
				use_date=use_date,
				sold_date=None,
			)
			created += 1
		except Exception as e:
			errors.append(f"Active row {i + 1}: {e!s}")
			frappe.log_error(title="Holding import active row", message=f"{e!s}\n{row}")

	for j, row in enumerate(sold_rows):
		try:
			purchase = row[0]
			sell_raw = row[1]
			raw_tk = _norm_cell(row[2])
			if isinstance(purchase, datetime):
				use_date = purchase.date().isoformat()
			elif isinstance(purchase, date):
				use_date = purchase.isoformat()
			else:
				use_date = today()
			if isinstance(sell_raw, datetime):
				sold_date = sell_raw.date().isoformat()
			elif isinstance(sell_raw, date):
				sold_date = sell_raw.isoformat()
			else:
				sold_date = None

			stock_doc = _get_or_create_stock(raw_tk, "")
			ticker_sym = frappe.db.get_value("Growe Stock", stock_doc, "ticker") or raw_tk

			_insert_holding(
				investor,
				stock_doc,
				ticker_sym,
				row,
				sold=True,
				use_date=use_date,
				sold_date=sold_date,
			)
			created += 1
		except Exception as e:
			errors.append(f"Sold row {j + 1}: {e!s}")
			frappe.log_error(title="Holding import sold row", message=f"{e!s}\n{row}")

	frappe.db.commit()
	return {
		"created": created,
		"skipped": 0,
		"active_rows": len(active_rows),
		"sold_rows": len(sold_rows),
		"errors": errors,
	}
