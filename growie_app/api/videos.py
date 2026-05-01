import frappe


@frappe.whitelist()
def get_videos(limit=50):
    videos = frappe.get_all(
        "Videos",
        fields=["name", "title", "category", "related_video", "youtube_url", "whats_all_about", "creation"],
        order_by="creation desc",
        limit=int(limit),
    )

    result = []
    for v in videos:
        result.append({
            "id": v.name,
            "title": v.title or "",
            "description": v.whats_all_about or "",
            "category": v.category or "education",
            "videoUrl": v.related_video or "",
            "youtubeUrl": v.youtube_url or "",
            "publishedAt": str(v.creation),
        })

    return result