"""
Transactions API — deposit/payment history for the current user.
"""

import frappe
from frappe import _


def _member_name() -> str:
	email = frappe.session.user
	if email == "Guest":
		frappe.throw(_("Please log in."), frappe.AuthenticationError)
	member = frappe.db.get_value("Growe Member", {"user": email}, "name")
	if not member:
		frappe.throw(_("Growe Member profile not found."))
	return member


@frappe.whitelist()
def get_transactions(limit: int = 50):
	"""Return all Growe Transactions for the current user, newest first."""
	member = _member_name()

	rows = frappe.get_all(
		"Growe Transaction",
		filters={"investor": member},
		fields=[
			"name", "paystack_reference", "amount_kes",
			"tier_purchased", "status", "payment_method",
			"currency", "transaction_date",
		],
		order_by="transaction_date desc",
		limit=int(limit),
	)

	return [
		{
			"id": r.name,
			"reference": r.paystack_reference or r.name,
			"amountKES": float(r.amount_kes or 0),
			"tierPurchased": r.tier_purchased or "",
			"status": r.status or "Pending",
			"paymentMethod": r.payment_method or "",
			"currency": r.currency or "KES",
			"transactionDate": str(r.transaction_date or ""),
		}
		for r in rows
	]
