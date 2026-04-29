import frappe


@frappe.whitelist()
def get_videos(limit: int = 50):
	"""Return published videos for authenticated users."""
	if frappe.session.user == "Guest":
		frappe.throw("Please log in to access videos.", frappe.AuthenticationError)

	rows = frappe.get_all(
		"Videos",
		fields=["name", "title", "category", "related_video", "whats_all_about", "modified"],
		order_by="modified desc",
		limit=int(limit),
	)
	return [
		{
			"id": r.name,
			"title": r.title,
			"description": r.whats_all_about or "",
			"category": (r.category or "").lower() or "education",
			"videoUrl": r.related_video or "",
			"publishedAt": str(r.modified),
		}
		for r in rows
	]
