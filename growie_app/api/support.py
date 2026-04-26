"""
Help desk — list/create Issue records linked to Growe Member (custom_growe_member).
Expects the standard Issue DocType with a custom Link field to Growe Member.
"""

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, now

# Custom field on Issue (Customize Form name is often custom_growe_member)
GROWE_MEMBER_FIELD = "custom_growe_member"


def _require_member_name() -> str:
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in."), frappe.AuthenticationError)
	member = frappe.db.get_value("Growe Member", {"user": user}, "name")
	if not member:
		frappe.throw(_("Growe Member profile not found."))
	return member


def _issue_meta():
	if not frappe.db.exists("DocType", "Issue"):
		frappe.throw(_("Support is not available: Issue DocType is not installed."))
	return frappe.get_meta("Issue")


def _pick_issue_list_fields(meta):
	fields = ["name", "subject", "status", "creation", "modified", "description"]
	if meta.has_field("issue_type"):
		fields.append("issue_type")
	for fn in ("replied", "resolution_details"):
		if meta.has_field(fn):
			fields.append(fn)
	return fields


def _row_has_reply(row: dict, meta) -> bool:
	if meta.has_field("replied"):
		r = row.get("replied")
		try:
			if cint(r):
				return True
		except Exception:
			if r in (True, "1", 1):
				return True
	res = (row.get("resolution_details") or "").strip()
	if res:
		return True
	return False


def _serialize_issue(row: dict, meta) -> dict:
	replied_flag = False
	if meta.has_field("replied"):
		r = row.get("replied")
		try:
			replied_flag = bool(cint(r))
		except Exception:
			replied_flag = r in (True, "1", 1)
	resolution = (row.get("resolution_details") or "").strip()
	if resolution:
		replied_flag = True
	return {
		"name": row.get("name"),
		"subject": row.get("subject") or "",
		"status": row.get("status") or "",
		"description": row.get("description") or "",
		"issueType": row.get("issue_type") or "",
		"creation": str(row.get("creation") or ""),
		"modified": str(row.get("modified") or ""),
		"replied": replied_flag,
		"resolutionDetails": resolution or None,
		"hasReply": _row_has_reply(row, meta),
	}


@frappe.whitelist()
def get_issue_types():
	"""Dropdown options for Issue Type."""
	_require_member_name()
	if not frappe.db.exists("DocType", "Issue Type"):
		return []
	filters = {}
	try:
		if frappe.get_meta("Issue Type").has_field("disabled"):
			filters["disabled"] = 0
	except Exception:
		pass
	if filters:
		return frappe.get_all("Issue Type", fields=["name"], filters=filters, order_by="name asc")
	return frappe.get_all("Issue Type", fields=["name"], order_by="name asc")


@frappe.whitelist()
def get_my_issues():
	"""Issues raised by the current member (custom_growe_member)."""
	member = _require_member_name()
	meta = _issue_meta()
	if not meta.has_field(GROWE_MEMBER_FIELD):
		frappe.throw(
			_(
				"Configure Issue: add a Link field '{0}' to DocType Growe Member."
			).format(GROWE_MEMBER_FIELD)
		)
	fields = _pick_issue_list_fields(meta)
	rows = frappe.get_all(
		"Issue",
		filters={GROWE_MEMBER_FIELD: member},
		fields=fields,
		order_by="modified desc",
		limit=200,
	)
	return [_serialize_issue(r, meta) for r in rows]


@frappe.whitelist()
def get_support_unread_count():
	"""Count issues with a staff reply newer than last inbox read time."""
	member_name = _require_member_name()
	meta = _issue_meta()
	if not meta.has_field(GROWE_MEMBER_FIELD):
		return {"count": 0}
	read_at = None
	if frappe.get_meta("Growe Member").has_field("last_support_inbox_read_at"):
		read_at = frappe.db.get_value("Growe Member", member_name, "last_support_inbox_read_at")
	read_dt = get_datetime(read_at) if read_at else None
	fields = _pick_issue_list_fields(meta)
	rows = frappe.get_all(
		"Issue",
		filters={GROWE_MEMBER_FIELD: member_name},
		fields=fields,
	)
	n = 0
	for r in rows:
		if not _row_has_reply(r, meta):
			continue
		mod = r.get("modified")
		if not mod:
			n += 1
			continue
		mod_dt = get_datetime(mod)
		if read_dt and mod_dt <= read_dt:
			continue
		n += 1
	return {"count": n}


@frappe.whitelist()
def mark_support_inbox_read():
	"""Call when the user opens the notification menu or the Support page."""
	member_name = _require_member_name()
	if not frappe.get_meta("Growe Member").has_field("last_support_inbox_read_at"):
		return {"success": True}
	member = frappe.get_doc("Growe Member", member_name)
	member.last_support_inbox_read_at = now()
	member.flags.ignore_permissions = True
	member.save()
	frappe.db.commit()
	return {"success": True}


@frappe.whitelist()
def create_issue(subject: str, description: str, issue_type: str = None):
	"""Create an Issue for the logged-in member."""
	member_name = _require_member_name()
	subject = (subject or "").strip()
	description = (description or "").strip()
	if not subject:
		frappe.throw(_("Subject is required."))
	if not description:
		frappe.throw(_("Description is required."))

	meta = _issue_meta()
	if not meta.has_field(GROWE_MEMBER_FIELD):
		frappe.throw(
			_("Add field '{0}' (Link to Growe Member) to Issue to enable support.").format(GROWE_MEMBER_FIELD)
		)

	data = {
		"doctype": "Issue",
		"subject": subject,
		"description": description,
		"raised_by": frappe.session.user,
		GROWE_MEMBER_FIELD: member_name,
	}
	if (issue_type or "").strip() and meta.has_field("issue_type"):
		data["issue_type"] = issue_type.strip()

	doc = frappe.get_doc(data)
	doc.flags.ignore_permissions = True
	doc.insert()
	frappe.db.commit()
	return {"success": True, "name": doc.name}
