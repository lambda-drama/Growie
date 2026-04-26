import frappe
from frappe import _
from frappe.utils import validate_email_address

# DocType "Growe Member".subscription_tier options are title-cased: Free, Pro, Coached.
# API and frontend use lowercase free|pro|coached.
_TIERS_TO_DB = {"free": "Free", "pro": "Pro", "coached": "Coached"}


def _api_subscription_tier(db_value) -> str:
	"""Map stored Select value to API lowercase (free|pro|coached)."""
	if not db_value:
		return "free"
	lower = str(db_value).strip().lower()
	if lower in _TIERS_TO_DB:
		return lower
	return "free"


def _db_subscription_tier(api_value: str | None) -> str | None:
	"""Map API / query param to DocType option string."""
	if not api_value or not str(api_value).strip():
		return None
	lower = str(api_value).strip().lower()
	return _TIERS_TO_DB.get(lower)


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
		"subscription_tier": _TIERS_TO_DB["free"],
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
	}  # API: always lowercase tier label


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
		"subscription_tier": _api_subscription_tier(member.subscription_tier),
		"preferred_currency": member.preferred_currency or "KES",
		"id_documents": [
			{"id_type": doc.id_type, "id_number": doc.id_number}
			for doc in member.id_documents
		],
	}


# ── Update Profile ────────────────────────────────────────────────────────────

@frappe.whitelist()
def update_profile(
	subscription_tier: str = None,
	preferred_currency: str = None,
	full_name: str = None,
	id_type: str = None,
	id_number: str = None,
):
	"""Update member profile, subscription, currency, name, and primary ID document."""
	user_email = frappe.session.user

	if user_email == "Guest":
		frappe.throw(_("Please log in first."), frappe.AuthenticationError)

	member_name = frappe.db.get_value("Growe Member", {"user": user_email}, "name")
	if not member_name:
		frappe.throw(_("Growe Member profile not found."))

	member = frappe.get_doc("Growe Member", member_name)

	db_tier = _db_subscription_tier(subscription_tier)
	if db_tier:
		member.subscription_tier = db_tier
	if preferred_currency and preferred_currency in ("KES", "USD", "EUR", "GBP"):
		member.preferred_currency = preferred_currency

	if full_name is not None and str(full_name).strip():
		clean = str(full_name).strip()
		member.full_name = clean
		parts = clean.split(" ", 1)
		user_doc = frappe.get_doc("User", user_email)
		user_doc.first_name = parts[0]
		user_doc.last_name = parts[1] if len(parts) > 1 else ""
		user_doc.flags.ignore_permissions = True
		user_doc.save()

	if id_type is not None or id_number is not None:
		if not member.id_documents:
			member.append(
				"id_documents",
				{
					"id_type": (id_type or "").strip() or "National ID",
					"id_number": (id_number or "").strip(),
				},
			)
		else:
			if id_type is not None:
				member.id_documents[0].id_type = (id_type or "").strip() or member.id_documents[0].id_type
			if id_number is not None:
				member.id_documents[0].id_number = (id_number or "").strip()

	member.flags.ignore_permissions = True
	member.save()
	frappe.db.commit()
	member.reload()

	return {
		"success": True,
		"full_name": member.full_name,
		"subscription_tier": _api_subscription_tier(member.subscription_tier),
		"preferred_currency": member.preferred_currency,
		"id_documents": [
			{"id_type": d.id_type, "id_number": d.id_number} for d in member.id_documents
		],
	}


@frappe.whitelist()
def change_password(current_password, new_password):
	"""Set a new account password; requires the current password."""
	user_email = frappe.session.user
	if user_email == "Guest":
		frappe.throw(_("Please log in first."), frappe.AuthenticationError)

	if not (new_password or "").strip() or len((new_password or "").strip()) < 8:
		frappe.throw(_("New password must be at least 8 characters."))

	from frappe.utils.password import check_password, update_password

	try:
		check_password(user_email, (current_password or ""))
	except frappe.AuthenticationError:
		frappe.throw(_("Current password is incorrect."))

	update_password(user_email, (new_password or "").strip(), logout_all_sessions=False)
	frappe.db.commit()
	return {"success": True}
