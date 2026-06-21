"""
Growe Stock verification workflow — unverified listings from imports / paid requests,
System Manager ToDos, and member email when verified.
"""

from __future__ import annotations

import frappe
from frappe import _


class UnsupportedImportTicker(frappe.ValidationError):
	"""Ticker is not in the verified master and the member cannot request new listings."""

	def __init__(self, ticker: str, message: str | None = None):
		self.ticker = (ticker or "").strip().upper()
		super().__init__(
			message
			or _("{0} is not supported on your plan. Upgrade to Pro or Coached to request new assets.").format(
				self.ticker
			)
		)


def member_is_subscribed(member_name: str) -> bool:
	"""Pro and Coached tiers may request new master listings."""
	if not member_name:
		return False
	tier = frappe.db.get_value("Growe Member", member_name, "subscription_tier") or "Free"
	return str(tier).strip().lower() in ("pro", "coached")


def outgoing_email_configured() -> bool:
	"""True when a default outgoing Email Account exists."""
	try:
		return bool(frappe.db.get_value("Email Account", {"default_outgoing": 1, "enable_outgoing": 1}, "name"))
	except Exception:
		return False


def get_system_manager_users() -> list[str]:
	"""User names (emails) with the System Manager role."""
	return frappe.get_all(
		"Has Role",
		filters={"role": "System Manager", "parenttype": "User"},
		pluck="parent",
		distinct=True,
	) or []


def create_stock_verification_todos(
	stock_name: str,
	ticker: str,
	company_name: str,
	requested_by_member: str | None,
	*,
	from_unsubscribed: bool = False,
) -> None:
	"""Assign an open ToDo to each System Manager (subscribed requests only)."""
	if from_unsubscribed:
		return
	if frappe.db.exists(
		"ToDo",
		{"reference_type": "Growe Stock", "reference_name": stock_name, "status": "Open"},
	):
		return

	requester = requested_by_member or _("Unknown")
	desc = _("Verify Growe Stock {0} ({1}) — requested by {2}").format(
		ticker,
		company_name or ticker,
		requester,
	)
	for user in get_system_manager_users():
		if not user or user == "Guest":
			continue
		todo = frappe.get_doc(
			{
				"doctype": "ToDo",
				"description": desc,
				"reference_type": "Growe Stock",
				"reference_name": stock_name,
				"allocated_to": user,
				"priority": "Medium",
				"status": "Open",
			}
		)
		todo.flags.ignore_permissions = True
		todo.insert()


def notify_member_stock_verified(stock) -> None:
	"""Email Growe Members who hold this stock when it is marked verified."""
	if not outgoing_email_configured():
		return

	stock_name = stock.name if hasattr(stock, "name") else stock.get("name")
	if not stock_name:
		return

	members = frappe.get_all(
		"Growe Holding",
		filters={"asset_name": stock_name},
		pluck="member",
		distinct=True,
	)
	if not members:
		return

	ticker = (stock.ticker or stock_name or "").strip()
	company = (stock.company_name or ticker).strip()
	subject = _("Your asset is now available on Growe: {0}").format(ticker)
	message = (
		"<p>Hi,</p>"
		f"<p>Good news — <strong>{company}</strong> ({ticker}) has been verified and added "
		"to the Growe stock master.</p>"
		"<p>You can now search for this ticker when adding or editing positions in My Stack.</p>"
		"<p>— Growe</p>"
	)

	sent: set[str] = set()
	for member_name in members:
		user = frappe.db.get_value("Growe Member", member_name, "user")
		if not user or user in sent:
			continue
		email = frappe.db.get_value("User", user, "email")
		if not email:
			continue
		sent.add(user)
		try:
			frappe.sendmail(recipients=[email], subject=subject, message=message, now=True)
		except Exception:
			frappe.log_error(title="Growe stock verified email failed", message=frappe.get_traceback())


def pending_verification_row(stock_name: str) -> dict | None:
	"""Return a display row if the stock exists and is not verified."""
	if not stock_name or not frappe.db.exists("Growe Stock", stock_name):
		return None
	row = frappe.db.get_value(
		"Growe Stock",
		stock_name,
		["name", "ticker", "company_name", "verified", "by_unsubscribed_member"],
		as_dict=True,
	)
	if not row or int(row.verified or 0):
		return None
	return {
		"stock_name": row.name,
		"ticker": row.ticker or "",
		"company_name": row.company_name or "",
		"by_unsubscribed_member": bool(row.by_unsubscribed_member),
	}


def pick_best_stock_for_ticker(ticker: str, currency_hint: str = "") -> str | None:
	"""
	Choose the best Growe Stock row when several share the same ticker.

	Prefers verified master rows, then market inferred from row currency (KES→NSE, USD→Global).
	"""
	clean = (ticker or "").strip().upper()
	if not clean:
		return None

	ccy = (currency_hint or "").strip().upper()
	prefer_market = "NSE" if ccy == "KES" else ("Global" if ccy == "USD" else None)

	matches = frappe.get_all(
		"Growe Stock",
		filters={"ticker": clean},
		fields=["name", "market", "verified", "by_unsubscribed_member"],
		limit=50,
	)
	if not matches:
		return None

	def sort_key(row):
		verified = int(row.get("verified") or 0)
		market = (row.get("market") or "").strip()
		market_match = 1 if prefer_market and market == prefer_market else 0
		# Master / seed rows beat import duplicates flagged for unsubscribed members.
		from_member_import = int(row.get("by_unsubscribed_member") or 0)
		return (verified, market_match, -from_member_import)

	matches.sort(key=sort_key, reverse=True)
	return matches[0].name


def verified_stock_exists(ticker: str, currency_hint: str = "") -> str | None:
	"""Return a verified Growe Stock name for this ticker, if any."""
	name = pick_best_stock_for_ticker(ticker, currency_hint)
	if not name:
		return None
	if int(frappe.db.get_value("Growe Stock", name, "verified") or 0):
		return name
	return None
