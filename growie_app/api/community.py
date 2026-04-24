"""
Community API — Posts, Comments, and Likes.

Growe Community Post    → member-created posts/discussions
Growe Community Comment → replies on posts (with optional thread nesting)
Growe Community Like    → per-member like on a post or comment
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


def _require_member() -> str:
	member = _member_name()
	if not member:
		frappe.throw(_("Please log in to continue."), frappe.AuthenticationError)
	return member


def _author_info(member_name: str) -> dict:
	"""Return display name and initials for a Growe Member."""
	if not member_name:
		return {"name": "Unknown", "initials": "?"}
	full_name = frappe.db.get_value("Growe Member", member_name, "full_name") or member_name
	parts = full_name.strip().split()
	initials = "".join(p[0].upper() for p in parts[:2]) if parts else "?"
	return {"name": full_name, "initials": initials}


def _liked_posts(member: str | None) -> set:
	if not member:
		return set()
	rows = frappe.get_all(
		"Growe Community Like",
		filters={"investor": member, "post": ["!=", ""]},
		fields=["post"],
	)
	return {r.post for r in rows if r.post}


def _liked_comments(member: str | None) -> set:
	if not member:
		return set()
	rows = frappe.get_all(
		"Growe Community Like",
		filters={"investor": member, "comment": ["!=", ""]},
		fields=["comment"],
	)
	return {r.comment for r in rows if r.comment}


def _post_to_dict(p, member: str | None, liked_set: set) -> dict:
	author = _author_info(p.get("author"))
	return {
		"id": p.get("name"),
		"authorId": p.get("author"),
		"authorName": author["name"],
		"authorInitials": author["initials"],
		"category": p.get("category") or "General",
		"content": p.get("content") or "",
		"tags": [t.strip() for t in (p.get("tags") or "").split(",") if t.strip()],
		"isPinned": bool(p.get("is_pinned")),
		"likesCount": int(p.get("likes_count") or 0),
		"commentsCount": int(p.get("comments_count") or 0),
		"publishedAt": str(p.get("published_at") or ""),
		"isLiked": p.get("name") in liked_set,
		"isOwn": p.get("author") == member,
	}


def _comment_to_dict(c, member: str | None, liked_set: set) -> dict:
	author = _author_info(c.get("author"))
	return {
		"id": c.get("name"),
		"postId": c.get("post"),
		"authorId": c.get("author"),
		"authorName": author["name"],
		"authorInitials": author["initials"],
		"content": c.get("content") or "",
		"parentCommentId": c.get("parent_comment") or None,
		"likesCount": int(c.get("likes_count") or 0),
		"commentedAt": str(c.get("commented_at") or ""),
		"isLiked": c.get("name") in liked_set,
		"isOwn": c.get("author") == member,
	}


# ── Posts ─────────────────────────────────────────────────────────────────────

@frappe.whitelist(allow_guest=True)
def get_posts(category: str = None, limit: int = 20, offset: int = 0):
	"""Return paginated posts newest-first, pinned always first."""
	member = _member_name()

	filters = []
	if category and category != "all":
		filters.append(["category", "=", category])

	rows = frappe.get_all(
		"Growe Community Post",
		filters=filters,
		fields=[
			"name", "author", "category", "content", "tags",
			"is_pinned", "likes_count", "comments_count", "published_at",
		],
		order_by="is_pinned desc, published_at desc",
		limit=int(limit),
		start=int(offset),
	)

	liked = _liked_posts(member)
	return [_post_to_dict(p, member, liked) for p in rows]


@frappe.whitelist(allow_guest=True)
def get_post(post_id: str):
	"""Return a single post with its comments."""
	member = _member_name()

	post = frappe.db.get_value(
		"Growe Community Post",
		post_id,
		["name", "author", "category", "content", "tags",
		 "is_pinned", "likes_count", "comments_count", "published_at"],
		as_dict=True,
	)
	if not post:
		frappe.throw(_("Post not found."), frappe.DoesNotExistError)

	liked_posts = _liked_posts(member)
	liked_comments = _liked_comments(member)

	comments_rows = frappe.get_all(
		"Growe Community Comment",
		filters={"post": post_id},
		fields=["name", "post", "author", "content", "parent_comment",
		        "likes_count", "commented_at"],
		order_by="commented_at asc",
	)

	return {
		"post": _post_to_dict(post, member, liked_posts),
		"comments": [_comment_to_dict(c, member, liked_comments) for c in comments_rows],
	}


@frappe.whitelist()
def create_post(content: str, category: str = "General", tags: str = ""):
	member = _require_member()

	if not content or not content.strip():
		frappe.throw(_("Post content cannot be empty."))

	doc = frappe.get_doc({
		"doctype": "Growe Community Post",
		"author": member,
		"category": category,
		"content": content.strip(),
		"tags": tags.strip(),
		"published_at": now_datetime(),
		"likes_count": 0,
		"comments_count": 0,
		"is_pinned": 0,
	})
	doc.flags.ignore_permissions = True
	doc.insert()
	frappe.db.commit()
	return _post_to_dict(doc, member, set())


@frappe.whitelist()
def delete_post(post_id: str):
	member = _require_member()
	doc = frappe.get_doc("Growe Community Post", post_id)

	is_admin = frappe.db.get_value("Has Role", {"parent": frappe.session.user, "role": "System Manager"}, "name")
	if doc.author != member and not is_admin:
		frappe.throw(_("You can only delete your own posts."), frappe.PermissionError)

	# Cascade-delete comments and likes
	frappe.db.delete("Growe Community Like", {"post": post_id})
	comment_names = frappe.get_all("Growe Community Comment", filters={"post": post_id}, pluck="name")
	for cn in comment_names:
		frappe.db.delete("Growe Community Like", {"comment": cn})
	frappe.db.delete("Growe Community Comment", {"post": post_id})

	doc.flags.ignore_permissions = True
	doc.delete()
	frappe.db.commit()
	return {"success": True}


# ── Comments ──────────────────────────────────────────────────────────────────

@frappe.whitelist()
def add_comment(post_id: str, content: str, parent_comment_id: str = None):
	member = _require_member()

	if not frappe.db.exists("Growe Community Post", post_id):
		frappe.throw(_("Post not found."))
	if not content or not content.strip():
		frappe.throw(_("Comment cannot be empty."))

	doc = frappe.get_doc({
		"doctype": "Growe Community Comment",
		"post": post_id,
		"author": member,
		"content": content.strip(),
		"parent_comment": parent_comment_id or None,
		"commented_at": now_datetime(),
		"likes_count": 0,
	})
	doc.flags.ignore_permissions = True
	doc.insert()

	# Increment comments_count on the post
	frappe.db.set_value(
		"Growe Community Post", post_id, "comments_count",
		frappe.db.get_value("Growe Community Post", post_id, "comments_count") + 1,
	)
	frappe.db.commit()
	return _comment_to_dict(doc, member, set())


@frappe.whitelist()
def delete_comment(comment_id: str):
	member = _require_member()
	doc = frappe.get_doc("Growe Community Comment", comment_id)

	is_admin = frappe.db.get_value("Has Role", {"parent": frappe.session.user, "role": "System Manager"}, "name")
	if doc.author != member and not is_admin:
		frappe.throw(_("You can only delete your own comments."), frappe.PermissionError)

	post_id = doc.post
	frappe.db.delete("Growe Community Like", {"comment": comment_id})
	doc.flags.ignore_permissions = True
	doc.delete()

	# Decrement comments_count
	current = frappe.db.get_value("Growe Community Post", post_id, "comments_count") or 0
	frappe.db.set_value("Growe Community Post", post_id, "comments_count", max(0, current - 1))
	frappe.db.commit()
	return {"success": True}


# ── Likes ─────────────────────────────────────────────────────────────────────

@frappe.whitelist()
def toggle_like(post_id: str = None, comment_id: str = None):
	"""Toggle like on a post or comment. Returns new liked state and count."""
	member = _require_member()

	if not post_id and not comment_id:
		frappe.throw(_("Provide either post_id or comment_id."))

	# Find existing like
	like_filters = {"investor": member}
	if post_id:
		like_filters["post"] = post_id
	else:
		like_filters["comment"] = comment_id

	existing = frappe.db.get_value("Growe Community Like", like_filters, "name")

	if existing:
		# Unlike
		frappe.db.delete("Growe Community Like", {"name": existing})
		delta = -1
		liked = False
	else:
		# Like
		doc = frappe.get_doc({
			"doctype": "Growe Community Like",
			"investor": member,
			"post": post_id or None,
			"comment": comment_id or None,
			"liked_at": now_datetime(),
		})
		doc.flags.ignore_permissions = True
		doc.insert()
		delta = 1
		liked = True

	# Update count on the target document
	if post_id:
		current = frappe.db.get_value("Growe Community Post", post_id, "likes_count") or 0
		new_count = max(0, current + delta)
		frappe.db.set_value("Growe Community Post", post_id, "likes_count", new_count)
	else:
		current = frappe.db.get_value("Growe Community Comment", comment_id, "likes_count") or 0
		new_count = max(0, current + delta)
		frappe.db.set_value("Growe Community Comment", comment_id, "likes_count", new_count)

	frappe.db.commit()
	return {"liked": liked, "count": new_count}
