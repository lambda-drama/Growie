import frappe
from frappe import _
from frappe.utils import validate_email_address


@frappe.whitelist(allow_guest=True)
def signup(full_name: str, email: str, password: str, id_type: str, id_number: str, preferred_currency: str = "KES"):
	"""Register a new Growe user, create Frappe User + Growe Member linked record."""
	# Basic validation
	if not validate_email_address(email):
		frappe.throw(_("Please enter a valid email address."))

	if not full_name or not full_name.strip():
		frappe.throw(_("Full name is required."))

	if not id_number or not id_number.strip():
		frappe.throw(_("ID number is required."))

	if id_type not in ("national_id", "passport"):
		frappe.throw(_("Invalid ID type. Must be 'national_id' or 'passport'."))

	if preferred_currency not in ("KES", "USD", "EUR", "GBP"):
		preferred_currency = "KES"

	# Check duplicate email
	if frappe.db.exists("User", {"email": email}):
		frappe.throw(_("An account with this email already exists. Please sign in instead."))

	# Split full name
	parts = full_name.strip().split(" ", 1)
	first_name = parts[0]
	last_name = parts[1] if len(parts) > 1 else ""

	# Create Frappe User (Website User type)
	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": first_name,
			"last_name": last_name,
			"new_password": password,
			"user_type": "Website User",
			"send_welcome_email": 0,
		}
	)
	user.flags.ignore_permissions = True
	user.flags.ignore_password_policy = True
	user.insert()

	# Create Growe Member linked to the new user
	member = frappe.get_doc(
		{
			"doctype": "Growe Member",
			"user": email,
			"full_name": full_name.strip(),
			"subscription_tier": "free",
			"preferred_currency": preferred_currency,
			"id_documents": [
				{
					"id_type": id_type,
					"id_number": id_number.strip(),
				}
			],
		}
	)
	member.flags.ignore_permissions = True
	member.insert()

	frappe.db.commit()

	# Auto-login the newly created user
	frappe.local.login_manager.login_as(email)
	frappe.db.commit()

	return {
		"user": email,
		"full_name": full_name.strip(),
		"subscription_tier": "free",
		"preferred_currency": preferred_currency,
	}


@frappe.whitelist()
def get_profile():
	"""Return the Growe Member profile for the currently logged-in user."""
	user_email = frappe.session.user

	if user_email == "Guest":
		frappe.throw(_("You must be logged in to view your profile."), frappe.AuthenticationError)

	member_name = frappe.db.get_value("Growe Member", {"user": user_email}, "name")
	if not member_name:
		frappe.throw(_("Growe Member profile not found for this account."))

	member = frappe.get_doc("Growe Member", member_name)

	return {
		"user": member.user,
		"full_name": member.full_name,
		"subscription_tier": member.subscription_tier or "free",
		"preferred_currency": member.preferred_currency or "KES",
		"id_documents": [
			{
				"id_type": doc.id_type,
				"id_number": doc.id_number,
			}
			for doc in member.id_documents
		],
	}


@frappe.whitelist()
def update_profile(subscription_tier: str = None, preferred_currency: str = None):
	"""Update subscription tier or currency preference for the current user."""
	user_email = frappe.session.user

	if user_email == "Guest":
		frappe.throw(_("You must be logged in."), frappe.AuthenticationError)

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
