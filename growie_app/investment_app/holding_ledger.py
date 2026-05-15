"""Buy/sell ledger entries linked to Growe Holding positions."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, getdate, today

from growie_app.api.portfolio import _to_kes


def create_holding_transaction(
	*,
	member: str,
	holding_name: str,
	transaction_type: str,
	quantity: float,
	unit_price: float,
	currency: str,
	transaction_date,
	holding_doc,
	reference: str = "",
	notes: str = "",
) -> frappe.model.document.Document:
	"""Persist one Growe Holding Transaction row."""
	qty = flt(quantity)
	if qty <= 0:
		frappe.throw(_("Quantity must be greater than zero."))

	txn_type = (transaction_type or "").strip()
	if txn_type not in ("Buy", "Sell"):
		frappe.throw(_("Transaction type must be Buy or Sell."))

	use_date = getdate(transaction_date or today())
	ccy = (currency or "USD").upper()
	unit = flt(unit_price)
	amount_ccy = qty * unit
	amount_kes = _to_kes(amount_ccy, ccy, str(use_date))

	market_tag = ""
	ac = holding_doc.asset_class or ""
	if ac == "NSE":
		market_tag = "NSE"
	elif ac == "Global":
		market_tag = "Global"

	txn = frappe.get_doc(
		{
			"doctype": "Growe Holding Transaction",
			"member": member,
			"holding": holding_name,
			"transaction_type": txn_type,
			"asset_class": ac,
			"market_tag": market_tag,
			"currency": ccy,
			"quantity": qty,
			"unit_price": unit,
			"amount": amount_ccy,
			"amount_kes": amount_kes,
			"transaction_date": use_date,
			"ticker": holding_doc.ticker or "",
			"asset_name": holding_doc.asset_name,
			"reference": reference or "",
			"notes": notes or "",
		}
	)
	txn.flags.ignore_permissions = True
	txn.insert()
	return txn
