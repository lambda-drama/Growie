# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt

import re
import frappe
import requests
from frappe.model.document import Document
from frappe.utils import today, now_datetime


class NewsSettings(Document):
	pass


def _extract_top_titles(url: str, max_items: int = 3) -> list[str]:
	resp = requests.get(url, timeout=12, headers={"User-Agent": "GroweBot/1.0"})
	resp.raise_for_status()
	html = resp.text or ""
	candidates = re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", html, flags=re.IGNORECASE | re.DOTALL)
	clean: list[str] = []
	for raw in candidates:
		txt = re.sub(r"<[^>]+>", "", raw).strip()
		if len(txt) >= 20 and txt not in clean:
			clean.append(txt)
		if len(clean) >= max_items:
			break
	return clean


@frappe.whitelist()
def fetch_best_news_now():
	"""Scrape configured sources and create Growe Insight + Learning Bite drafts."""
	settings = frappe.get_single("News Settings")
	created = 0
	for row in settings.webscrapping_sites or []:
		site = row.site_link or ""
		if not site:
			continue
		try:
			titles = _extract_top_titles(site, max_items=2)
			for title in titles:
				insight = frappe.get_doc({
					"doctype": "Growe Insight",
					"title": title[:140],
					"market": "Global",
					"sentiment": "Watch",
					"commentary": f"Auto-curated from {site}<br/>{title}",
					"week_starting": today(),
					"published_date": now_datetime(),
					"is_pro_only": 0,
				})
				insight.insert(ignore_permissions=True)

				bite = frappe.get_doc({
					"doctype": "Growe LearningBite",
					"title": f"Context: {title[:100]}",
					"topic_tag": "Market News",
					"explanation": f"What happened: {title}<br/>Source: {site}",
					"linked_insight": insight.name,
					"month_year": now_datetime().strftime("%B %Y"),
					"difficulty": "Beginner",
					"estimated_read_time": 2,
				})
				bite.insert(ignore_permissions=True)
				created += 1
		except Exception as e:
			frappe.log_error(title="News scrape failed", message=f"{site}\n{e}")

	frappe.db.commit()
	return {"created": created}


def daily_news_scrape():
	"""Scheduler entrypoint."""
	try:
		fetch_best_news_now()
	except Exception as e:
		frappe.log_error(title="Daily news scrape failed", message=str(e))
