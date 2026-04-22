import frappe
from frappe import _
from frappe.utils import validate_email_address


# ── Signup ────────────────────────────────────────────────────────────────────

@frappe.whitelist(allow_guest=True)
def signup(full_name: str, email: str, password: str, id_type: str, id_number: str, preferred_currency: str = "KES"):
	"""
	Create a new Frappe User (Website User) and a linked Growe Member record,
	then auto-login so the browser session is immediately active.
	"""
	# ── Basic validation ──────────────────────────────────────────────────────
	full_name = (full_name or "").strip()
	email = (email or "").strip().lower()
	id_number = (id_number or "").strip()
	id_type = (id_type or "").strip()

	if not full_name:
		frappe.throw(_("Full name is required."))

	if not validate_email_address(email):
		frappe.throw(_("Please enter a valid email address."))

	if len(password or "") < 8:
		frappe.throw(_("Password must be at least 8 characters."))

	if not id_number:
		frappe.throw(_("ID number is required."))

	if preferred_currency not in ("KES", "USD", "EUR", "GBP"):
		preferred_currency = "KES"

	# ── Duplicate check ───────────────────────────────────────────────────────
	if frappe.db.exists("User", {"email": email}):
		frappe.throw(_("An account with this email already exists. Please sign in instead."))

	# ── Create Frappe User ────────────────────────────────────────────────────
	parts = full_name.split(" ", 1)
	first_name = parts[0]
	last_name = parts[1] if len(parts) > 1 else ""

	user_doc = frappe.get_doc({
		"doctype": "User",
		"email": email,
		"first_name": first_name,
		"last_name": last_name,
		"new_password": password,
		"user_type": "Website User",
		"send_welcome_email": 0,
	})
	user_doc.flags.ignore_permissions = True
	user_doc.flags.ignore_password_policy = True
	user_doc.insert()

	# ── Create Growe Member ───────────────────────────────────────────────────
	id_row = {"id_type": id_type, "id_number": id_number}

	member = frappe.get_doc({
		"doctype": "Growe Member",
		"user": email,
		"full_name": full_name,
		"subscription_tier": "free",
		"preferred_currency": preferred_currency,
		"id_documents": [id_row],
	})
	member.flags.ignore_permissions = True
	member.insert()

	frappe.db.commit()

	# ── Auto-login ────────────────────────────────────────────────────────────
	frappe.local.login_manager.login_as(email)
	frappe.db.commit()

	return {
		"user": email,
		"full_name": full_name,
		"subscription_tier": "free",
		"preferred_currency": preferred_currency,
	}


# ── Profile ───────────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_profile():
	"""Return the Growe Member profile for the currently logged-in user."""
	user_email = frappe.session.user

	if user_email == "Guest":
		frappe.throw(_("Please log in to view your profile."), frappe.AuthenticationError)

	member_name = frappe.db.get_value("Growe Member", {"user": user_email}, "name")
	if not member_name:
		frappe.throw(_("Growe Member profile not found. Please contact support."))

	member = frappe.get_doc("Growe Member", member_name)

	return {
		"user": member.user,
		"full_name": member.full_name,
		"subscription_tier": member.subscription_tier or "free",
		"preferred_currency": member.preferred_currency or "KES",
		"id_documents": [
			{"id_type": doc.id_type, "id_number": doc.id_number}
			for doc in member.id_documents
		],
	}


# ── Update Profile ────────────────────────────────────────────────────────────

@frappe.whitelist()
def update_profile(subscription_tier: str = None, preferred_currency: str = None):
	"""Update the subscription tier or preferred currency for the current user."""
	user_email = frappe.session.user

	if user_email == "Guest":
		frappe.throw(_("Please log in first."), frappe.AuthenticationError)

	member_name = frappe.db.get_value("Growe Member", {"user": user_email}, "name")
	if not member_name:
		frappe.throw(_("Growe Member profile not found."))

	member = frappe.get_doc("Growe Member", member_name)

	if subscription_tier and subscription_tier in ("free", "pro", "coached"):
		member.subscription_tier = subscription_tier
	if preferred_currency and preferred_currency in ("KES", "USD", "EUR", "GBP"):
		member.preferred_currency = preferred_currency

	member.flags.ignore_permissions = True
	member.save()
	frappe.db.commit()

	return {"success": True}
