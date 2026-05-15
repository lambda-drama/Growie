"""
Goals API — CRUD for Growe Goal and Growe Goal Transaction.
Transactions update goal current_amount on submit (see growe_goal_transaction.py).
"""

import frappe
from frappe import _
from frappe.utils import flt, getdate, today

from growie_app.api.portfolio import _to_kes


def _member_name() -> str:
	email = frappe.session.user
	if email == "Guest":
		frappe.throw(_("Please log in to access your goals."), frappe.AuthenticationError)
	member = frappe.db.get_value("Growe Member", {"user": email}, "name")
	if not member:
		frappe.throw(_("Growe Member profile not found."))
	return member


def _goal_to_dict(row) -> dict:
	target = flt(row.get("target_amount") or 0)
	current = flt(row.get("current_amount") or 0)
	pct = round((current / target) * 100, 1) if target > 0 else 0.0
	return {
		"id": row.get("name"),
		"goalName": row.get("goal_name") or "",
		"category": row.get("category") or "",
		"targetAmount": target,
		"currentAmount": current,
		"progressPercent": min(pct, 100.0),
		"targetDate": str(row.get("target_date") or ""),
		"priority": row.get("priority") or "Medium",
		"status": row.get("status") or "Active",
		"monthlyContribution": flt(row.get("monthly_contribution") or 0),
		"currency": (row.get("currency") or "USD").upper(),
	}


def _transaction_to_dict(row) -> dict:
	return {
		"id": row.get("name"),
		"goalId": row.get("goal") or "",
		"transactionType": row.get("transaction_type") or "",
		"amount": flt(row.get("amount") or 0),
		"currency": (row.get("currency") or "USD").upper(),
		"transactionDate": str(row.get("transaction_date") or ""),
		"source": row.get("source") or "",
		"reference": row.get("reference") or "",
		"notes": row.get("notes") or "",
		"docstatus": row.get("docstatus", 0),
	}


def _assert_goal_owner(goal_name: str, member: str):
	if not frappe.db.exists("Growe Goal", goal_name):
		frappe.throw(_("Goal not found."))
	owner = frappe.db.get_value("Growe Goal", goal_name, "member")
	if owner != member:
		frappe.throw(_("You are not authorised to access this goal."), frappe.PermissionError)


@frappe.whitelist()
def get_goals():
	"""List all goals for the current member."""
	member = _member_name()
	rows = frappe.get_all(
		"Growe Goal",
		filters={"member": member},
		fields=[
			"name",
			"goal_name",
			"category",
			"target_amount",
			"current_amount",
			"target_date",
			"priority",
			"status",
			"monthly_contribution",
			"currency",
		],
		order_by="modified desc",
	)
	return [_goal_to_dict(r) for r in rows]


@frappe.whitelist()
def get_goal(goal_name: str):
	"""Return one goal and its submitted transactions."""
	member = _member_name()
	_assert_goal_owner(goal_name, member)
	row = frappe.db.get_value(
		"Growe Goal",
		goal_name,
		[
			"name",
			"goal_name",
			"category",
			"target_amount",
			"current_amount",
			"target_date",
			"priority",
			"status",
			"monthly_contribution",
			"currency",
		],
		as_dict=True,
	)
	txns = frappe.get_all(
		"Growe Goal Transaction",
		filters={"goal": goal_name, "member": member, "docstatus": 1},
		fields=[
			"name",
			"goal",
			"transaction_type",
			"amount",
			"currency",
			"transaction_date",
			"source",
			"reference",
			"notes",
			"docstatus",
		],
		order_by="transaction_date desc, creation desc",
	)
	return {
		"goal": _goal_to_dict(row),
		"transactions": [_transaction_to_dict(t) for t in txns],
	}


@frappe.whitelist()
def create_goal(
	goal_name: str,
	target_amount: float,
	target_date: str,
	category: str = "Wealth Building",
	priority: str = "Medium",
	monthly_contribution: float = 0,
	currency: str = "USD",
):
	member = _member_name()
	if not goal_name or not str(goal_name).strip():
		frappe.throw(_("Goal name is required."))
	if flt(target_amount) <= 0:
		frappe.throw(_("Target amount must be greater than zero."))
	if not target_date:
		frappe.throw(_("Target date is required."))

	doc = frappe.get_doc(
		{
			"doctype": "Growe Goal",
			"member": member,
			"goal_name": str(goal_name).strip(),
			"category": category or "Wealth Building",
			"target_amount": flt(target_amount),
			"current_amount": 0,
			"target_date": getdate(target_date),
			"priority": priority or "Medium",
			"status": "Active",
			"monthly_contribution": flt(monthly_contribution),
			"currency": (currency or "USD").upper(),
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()
	frappe.db.commit()
	return _goal_to_dict(doc)


@frappe.whitelist()
def update_goal(
	goal_name: str,
	goal_name_label: str = None,
	target_amount: float = None,
	target_date: str = None,
	category: str = None,
	priority: str = None,
	status: str = None,
	monthly_contribution: float = None,
	currency: str = None,
):
	member = _member_name()
	_assert_goal_owner(goal_name, member)
	doc = frappe.get_doc("Growe Goal", goal_name)

	if goal_name_label is not None:
		label = str(goal_name_label).strip()
		if not label:
			frappe.throw(_("Goal name is required."))
		doc.goal_name = label
	if target_amount is not None:
		if flt(target_amount) <= 0:
			frappe.throw(_("Target amount must be greater than zero."))
		doc.target_amount = flt(target_amount)
	if target_date is not None:
		doc.target_date = getdate(target_date)
	if category is not None:
		doc.category = category
	if priority is not None:
		doc.priority = priority
	if status is not None:
		doc.status = status
	if monthly_contribution is not None:
		doc.monthly_contribution = flt(monthly_contribution)
	if currency is not None:
		doc.currency = (currency or "USD").upper()

	doc.flags.ignore_permissions = True
	doc.save()
	frappe.db.commit()
	return _goal_to_dict(doc)


@frappe.whitelist()
def delete_goal(goal_name: str):
	member = _member_name()
	_assert_goal_owner(goal_name, member)
	submitted = frappe.db.count(
		"Growe Goal Transaction",
		{"goal": goal_name, "docstatus": 1},
	)
	if submitted:
		frappe.throw(_("Cannot delete a goal that has submitted transactions. Pause it instead."))
	frappe.delete_doc("Growe Goal", goal_name, ignore_permissions=True)
	frappe.db.commit()
	return {"success": True}


@frappe.whitelist()
def add_goal_transaction(
	goal: str,
	amount: float,
	transaction_type: str = "Deposit",
	transaction_date: str = None,
	currency: str = None,
	source: str = "Bank Transfer",
	reference: str = None,
	notes: str = None,
):
	member = _member_name()
	_assert_goal_owner(goal, member)
	amt = flt(amount)
	if amt == 0:
		frappe.throw(_("Amount must not be zero."))

	goal_currency = (frappe.db.get_value("Growe Goal", goal, "currency") or "USD").upper()
	txn_currency = (currency or goal_currency or "USD").upper()

	doc = frappe.get_doc(
		{
			"doctype": "Growe Goal Transaction",
			"member": member,
			"goal": goal,
			"transaction_type": transaction_type or "Deposit",
			"amount": abs(amt),
			"currency": txn_currency,
			"transaction_date": getdate(transaction_date or today()),
			"source": source or "Bank Transfer",
			"reference": reference or "",
			"notes": notes or "",
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	frappe.db.commit()

	goal_row = frappe.db.get_value(
		"Growe Goal",
		goal,
		[
			"name",
			"goal_name",
			"category",
			"target_amount",
			"current_amount",
			"target_date",
			"priority",
			"status",
			"monthly_contribution",
			"currency",
		],
		as_dict=True,
	)
	return {
		"transaction": _transaction_to_dict(doc),
		"goal": _goal_to_dict(goal_row),
	}
