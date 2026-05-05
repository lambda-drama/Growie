"""Growe Appointment — coached members only for booking."""

from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime
from frappe.utils.data import get_system_timezone

DEFAULT_COACH_NAME = "Barbara Nzovu"


def _naive_system_local(dt):
	"""
	JS sends ISO-8601 with Z / offset (timezone-aware). `now_datetime()` is naive system-local.
	Convert aware datetimes to naive wall time in the site's timezone so compares and DB writes match Frappe.
	"""
	if dt is None:
		return None
	if dt.tzinfo is None:
		return dt
	try:
		sys_tz = ZoneInfo(get_system_timezone())
	except Exception:
		sys_tz = ZoneInfo("UTC")
	return dt.astimezone(sys_tz).replace(tzinfo=None)


def _require_member_row() -> tuple[str, str]:
	"""Returns (growe_member_name, subscription_tier_lower)."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in."), frappe.AuthenticationError)
	row = frappe.db.get_value(
		"Growe Member",
		{"user": user},
		["name", "subscription_tier"],
		as_dict=True,
	)
	if not row or not row.name:
		frappe.throw(_("Growe Member profile not found."))
	tier_lc = str(row.subscription_tier or "free").strip().lower()
	return row.name, tier_lc


def _require_coached() -> str:
	"""Growe Member name; raises if not on Coached plan."""
	member_name, tier = _require_member_row()
	if tier != "coached":
		frappe.throw(
			_("Individual coaching appointments are reserved for Growe Coached subscribers."),
			frappe.PermissionError,
		)
	return member_name


def _appointment_row(appt):
	return {
		"name": appt.name,
		"scheduled_time": str(appt.scheduled_time or ""),
		"status": appt.status or "",
		"customer_name": appt.customer_name or "",
		"customer_phone_number": appt.customer_phone_number or "",
		"customer_skype": appt.customer_skype or "",
		"customer_email": appt.customer_email or "",
		"customer_details": appt.customer_details or "",
		"google_link": appt.google_link or "",
		"coach": appt.coach or "",
	}


@frappe.whitelist()
def coaching_access():
	"""Whether the logged-in member can manage coaching bookings (Coached tier)."""
	_, tier = _require_member_row()
	return {"eligible": tier == "coached", "tier": tier}


@frappe.whitelist()
def my_appointments():
	"""List Growe Appointment rows linked to this member."""
	member_name = _require_coached()
	items = frappe.get_all(
		"Growe Appointment",
		filters={"member": member_name},
		fields=[
			"name",
			"scheduled_time",
			"status",
			"customer_name",
			"customer_phone_number",
			"customer_skype",
			"customer_email",
			"customer_details",
			"google_link",
			"coach",
			"creation",
		],
		order_by="scheduled_time desc",
	)
	out = []
	for row in items:
		out.append(
			{
				"name": row.name,
				"scheduled_time": str(row.scheduled_time or ""),
				"status": row.status or "",
				"customer_name": row.customer_name or "",
				"customer_phone_number": row.customer_phone_number or "",
				"customer_skype": row.customer_skype or "",
				"customer_email": row.customer_email or "",
				"customer_details": row.customer_details or "",
				"google_link": row.google_link or "",
				"coach": row.coach or "",
				"creation": str(row.creation or ""),
			}
		)
	return out


@frappe.whitelist()
def book_appointment(
	scheduled_time: str,
	customer_phone_number: str | None = None,
	customer_skype: str | None = None,
	customer_details: str | None = None,
	customer_email: str | None = None,
):
	"""
	Create one Growe Appointment for the logged-in coached member.

	Desk-only fields (google_link, calendar_event, appointment_with/party)
	remain empty until staff updates them after confirmation.
	"""
	member_name = _require_coached()

	if not (scheduled_time or "").strip():
		frappe.throw(_("Please choose a date and time for your session."))

	dt = get_datetime(scheduled_time)
	if not dt:
		frappe.throw(_("Invalid date or time."))

	dt = _naive_system_local(dt)
	if dt <= now_datetime():
		frappe.throw(_("Please pick a time in the future."))

	member_doc = frappe.get_doc("Growe Member", member_name)

	doc = frappe.get_doc(
		{
			"doctype": "Growe Appointment",
			"scheduled_time": dt,
			"status": "Unverified",
			"member": member_name,
			"customer_name": member_doc.full_name or member_doc.user,
			"customer_phone_number": (customer_phone_number or "").strip(),
			"customer_skype": (customer_skype or "").strip(),
			"customer_details": (customer_details or "").strip(),
			"customer_email": (customer_email or "").strip(),
			"coach": DEFAULT_COACH_NAME,
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()
	frappe.db.commit()
	doc.reload()

	return _appointment_row(doc)
