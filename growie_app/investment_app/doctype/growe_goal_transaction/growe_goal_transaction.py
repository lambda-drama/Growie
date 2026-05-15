# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

from growie_app.api.portfolio import _to_kes


_ADD_TYPES = frozenset({"Deposit", "Interest", "Dividend"})
_SUBTRACT_TYPES = frozenset({"Withdrawal"})


def _convert_currency(amount: float, from_currency: str, to_currency: str, on_date: str) -> float:
	"""Convert amount between currencies via ERPNext exchange rates (hub: KES)."""
	from_c = (from_currency or "USD").upper().strip()
	to_c = (to_currency or "USD").upper().strip()
	val = flt(amount)
	if not val or from_c == to_c:
		return val
	kes = _to_kes(val, from_c, on_date)
	if to_c == "KES":
		return kes
	kes_per_unit = _to_kes(1, to_c, on_date)
	if kes_per_unit > 0:
		return kes / kes_per_unit
	return kes


def _signed_amount_in_goal_currency(
	transaction_type: str,
	amount: float,
	txn_currency: str,
	goal_currency: str,
	on_date: str,
) -> float:
	"""Return balance delta in the goal's currency (positive = increase)."""
	val = flt(amount)
	if not val:
		return 0.0
	magnitude = abs(val)
	converted = _convert_currency(magnitude, txn_currency, goal_currency, on_date)
	if transaction_type in _SUBTRACT_TYPES:
		return -converted
	if transaction_type in _ADD_TYPES:
		return converted
	if val < 0:
		return -abs(converted)
	return converted


def recalculate_goal_balance(goal_name: str) -> float:
	"""Sum all submitted transactions in the goal's currency and set current_amount."""
	goal_currency = (frappe.db.get_value("Growe Goal", goal_name, "currency") or "USD").upper()
	rows = frappe.get_all(
		"Growe Goal Transaction",
		filters={"goal": goal_name, "docstatus": 1},
		fields=["transaction_type", "amount", "currency", "transaction_date"],
	)
	total = 0.0
	for row in rows:
		total += _signed_amount_in_goal_currency(
			row.transaction_type,
			row.amount,
			row.currency,
			goal_currency,
			str(row.transaction_date or ""),
		)
	total = max(total, 0.0)
	frappe.db.set_value("Growe Goal", goal_name, "current_amount", total, update_modified=False)
	return total


class GroweGoalTransaction(Document):
	def validate(self):
		if flt(self.amount) == 0:
			frappe.throw("Amount must not be zero.")
		if self.goal and self.member:
			goal_member = frappe.db.get_value("Growe Goal", self.goal, "member")
			if goal_member and goal_member != self.member:
				frappe.throw("Goal does not belong to this member.")

	def on_submit(self):
		if self.goal:
			recalculate_goal_balance(self.goal)
			_maybe_mark_achieved(self.goal)

	def on_cancel(self):
		if self.goal:
			recalculate_goal_balance(self.goal)


def _maybe_mark_achieved(goal_name: str):
	goal = frappe.db.get_value(
		"Growe Goal",
		goal_name,
		["target_amount", "current_amount", "status"],
		as_dict=True,
	)
	if not goal or goal.status == "Achieved":
		return
	target = flt(goal.target_amount)
	current = flt(goal.current_amount)
	if target > 0 and current >= target:
		frappe.db.set_value("Growe Goal", goal_name, "status", "Achieved", update_modified=True)
