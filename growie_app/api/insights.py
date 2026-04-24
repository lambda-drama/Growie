"""
Insights & Learning Bites API.

Growe Insight  → curated weekly market picks + commentary
Growe LearningBite → educational snippets linked to insights
Growe Progress     → tracks which learning bites a user has read
"""

import frappe
from frappe import _
from frappe.utils import now_datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

def _member_name() -> str | None:
	email = frappe.session.user
	if email == "Guest":
		return None
	return frappe.db.get_value("Growe Member", {"user": email}, "name")


def _is_pro(member: str | None) -> bool:
	if not member:
		return False
	tier = frappe.db.get_value("Growe Member", member, "subscription_tier") or "free"
	return tier in ("pro", "coached")


# ── Weekly Insights (Stock Picks) ─────────────────────────────────────────────

@frappe.whitelist(allow_guest=True)
def get_insights(limit: int = 20, market: str = None):
	"""
	Return Growe Insight records ordered by week_starting desc.
	- Free users: only `is_pro_only = 0` records.
	- Pro/Coached: all records.
	"""
	member = _member_name()
	pro = _is_pro(member)

	filters: list = []
	if not pro:
		filters.append(["is_pro_only", "=", 0])
	if market:
		filters.append(["market", "=", market])

	rows = frappe.get_all(
		"Growe Insight",
		filters=filters,
		fields=[
			"name", "title", "market", "ticker", "sentiment",
			"commentary", "week_starting", "published_date",
			"is_pro_only", "scope_partner_tag", "order",
			"learning_bite_content",
		],
		order_by="week_starting desc, `order` asc",
		limit=int(limit),
	)

	# For each insight, attach linked learning bites (if the user is pro)
	result = []
	for r in rows:
		item = dict(r)
		item["id"] = item.pop("name")
		item["isPro"] = bool(item.pop("is_pro_only"))
		item["isScopePartner"] = bool(item.pop("scope_partner_tag"))
		item["publishedAt"] = str(item.pop("published_date") or item.get("week_starting") or "")
		item["weekStarting"] = str(item.pop("week_starting") or "")
		item["learningBiteContent"] = item.pop("learning_bite_content") or ""

		# Attach linked learning bite if any
		bite = frappe.db.get_value(
			"Growe LearningBite",
			{"linked_insight": r.get("name")},
			["name", "title", "topic_tag", "explanation", "difficulty", "estimated_read_time"],
			as_dict=True,
		)
		if bite:
			item["learningBite"] = {
				"id": bite.name,
				"topic": bite.topic_tag,
				"title": bite.title,
				"explanation": bite.explanation,
				"difficulty": bite.difficulty,
				"estimatedReadTime": bite.estimated_read_time,
			}
		else:
			item["learningBite"] = None

		result.append(item)

	return result


# ── Learning Bites ─────────────────────────────────────────────────────────────

@frappe.whitelist(allow_guest=True)
def get_learning_bites(limit: int = 50):
	"""Return all learning bites with user-specific read status."""
	member = _member_name()

	rows = frappe.get_all(
		"Growe LearningBite",
		fields=[
			"name", "title", "topic_tag", "explanation",
			"linked_insight", "month_year", "difficulty",
			"estimated_read_time", "order",
		],
		order_by="`order` asc, creation asc",
		limit=int(limit),
	)

	# Build a set of read bites for this user
	read_set: set = set()
	if member:
		progress = frappe.get_all(
			"Growe Progress",
			filters={"investor": member, "is_read": 1},
			fields=["learning_bite"],
		)
		read_set = {p.learning_bite for p in progress}

	result = []
	for r in rows:
		result.append({
			"id": r.name,
			"title": r.title,
			"topic": r.topic_tag,
			"explanation": r.explanation,
			"linkedInsightId": r.linked_insight or "",
			"monthYear": r.month_year or "",
			"difficulty": r.difficulty or "Beginner",
			"estimatedReadTime": r.estimated_read_time or 2,
			"isRead": r.name in read_set,
		})

	return result


# ── Mark Bite as Read ──────────────────────────────────────────────────────────

@frappe.whitelist()
def mark_bite_read(bite_name: str):
	"""Mark a Growe LearningBite as read for the current user."""
	member = _member_name()
	if not member:
		frappe.throw(_("Please log in."), frappe.AuthenticationError)

	# Check bite exists
	if not frappe.db.exists("Growe LearningBite", bite_name):
		frappe.throw(_("Learning bite not found."))

	# Upsert progress record
	existing = frappe.db.get_value(
		"Growe Progress",
		{"investor": member, "learning_bite": bite_name},
		"name",
	)

	if existing:
		doc = frappe.get_doc("Growe Progress", existing)
		if not doc.is_read:
			doc.is_read = 1
			doc.read_date = now_datetime()
			doc.flags.ignore_permissions = True
			doc.save()
	else:
		doc = frappe.get_doc({
			"doctype": "Growe Progress",
			"investor": member,
			"learning_bite": bite_name,
			"is_read": 1,
			"read_date": now_datetime(),
			"first_viewed": now_datetime(),
		})
		doc.flags.ignore_permissions = True
		doc.insert()

	frappe.db.commit()
	return {"success": True}


# ── User Learning Progress ─────────────────────────────────────────────────────

@frappe.whitelist()
def get_user_progress():
	"""Return reading progress stats for the current user."""
	member = _member_name()
	if not member:
		frappe.throw(_("Please log in."), frappe.AuthenticationError)

	total_bites = frappe.db.count("Growe LearningBite")
	read_count = frappe.db.count("Growe Progress", {"investor": member, "is_read": 1})

	recent_reads = frappe.get_all(
		"Growe Progress",
		filters={"investor": member, "is_read": 1},
		fields=["learning_bite", "read_date"],
		order_by="read_date desc",
		limit=5,
	)

	return {
		"totalBites": total_bites,
		"readCount": read_count,
		"completionPercent": round(read_count / total_bites * 100, 1) if total_bites else 0,
		"recentReads": [
			{"biteId": r.learning_bite, "readDate": str(r.read_date)}
			for r in recent_reads
		],
	}
