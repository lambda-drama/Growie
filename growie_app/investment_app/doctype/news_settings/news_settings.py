# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt

import re

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, today

from growie_app.api.ai import rewrite_news_article_for_ingestion
from growie_app.utils.news_ingest import (
	build_bite_explanation_html,
	build_commentary_html,
	duplicate_insight_title,
	fetch_article_plain_text,
	fetch_articles_for_configured_site,
	infer_insight_market,
	canonicalize_insight_market,
	normalize_title_key,
)


class NewsSettings(Document):
	pass


ARTICLES_PER_SITE = 1


def _estimated_read_minutes(html: str) -> int:
	words = len(re.findall(r"[\w''-]+", (html or ""), flags=re.UNICODE))
	return max(2, min(12, 2 + words // 200))


def _source_attribution_footer(link: str, site_label: str) -> str:
	from frappe.utils import escape_html

	site_label = escape_html(site_label or "Source")
	if link.startswith("http"):
		return (
			f'<p><em>Derived from headline coverage.</em> '
			f'<a href="{escape_html(link)}" rel="noopener noreferrer">{site_label}</a>.</p>'
		)
	return f'<p><em>Derived from headline coverage ({site_label}).</em></p>'


def _news_fetch_active() -> bool:
	"""Single toggle: Activate on News Settings must be checked for any ingest."""
	return bool(frappe.db.get_single_value("News Settings", "activate"))


@frappe.whitelist()
def fetch_best_news_now():
	"""
	Pull **one** investment headline per configured site (News Details child table).

	Runs only when **Activate** is checked on News Settings (scheduled job and desk button).

	When **Rewrite with AI** is unchecked: reuse RSS/API title + summaries.
	When checked: optionally fetch linked article text and call Growe AI to produce
	a fresh headline, commentary, bite title/topic/explanation HTML (no automated user AI limits).

	If a site yields no scrape items, nothing is invented — that site is skipped.
	"""
	settings = frappe.get_single("News Settings")
	if not _news_fetch_active():
		return {
			"created": 0,
			"skipped_duplicates": 0,
			"errors": [
				"News fetch is disabled. Tick Activate on News Settings to allow fetching.",
			],
			"rewrite_with_ai": bool(getattr(settings, "rewrite_with_ai", False)),
			"inactive": True,
		}

	rewrite = bool(getattr(settings, "rewrite_with_ai", False))
	per_site = ARTICLES_PER_SITE
	created = 0
	skipped_duplicates = 0
	errors: list[str] = []
	seen_keys: set[str] = set()

	for row in settings.webscrapping_sites or []:
		site_ref = row.sites
		site_link = (row.site_link or "").strip()
		if not site_ref:
			errors.append("Skipped a row with no Sites link")
			continue

		site_label = frappe.db.get_value("News WebScrapping Sites", site_ref, "site_name") or site_ref

		articles, src_errors = fetch_articles_for_configured_site(
			site_ref,
			site_link,
			max_items=per_site,
		)
		errors.extend(src_errors)

		if not articles:
			continue

		pick = articles[0]
		raw_title = (pick.get("title") or "").strip()
		if not raw_title:
			continue

		link = (pick.get("link") or site_link or "").strip()
		summary = (pick.get("summary") or "").strip()

		if rewrite:
			supplementary = ""
			if link.startswith("http"):
				supplementary = fetch_article_plain_text(link)
			try:
				rew = rewrite_news_article_for_ingestion(
					raw_title=raw_title,
					raw_summary=summary,
					source_url=link if link.startswith("http") else "",
					source_label=site_label,
					supplementary_text=supplementary,
				)
			except Exception as e:
				errors.append(f"{site_label}: AI rewrite skipped — {e!s}")
				frappe.log_error(
					title="News AI rewrite failed",
					message=f"{site_label}\n{raw_title}\n{e!s}",
				)
				continue

			insight_title = (rew.get("insight_title") or "")[:240]
			commentary_body = rew.get("insight_commentary_html") or "<p></p>"
			bite_title = (rew.get("learning_bite_title") or "")[:240]
			topic_tag = (rew.get("topic_tag") or "Market News")[:140]
			bite_body = rew.get("article_html") or "<p></p>"
		else:
			insight_title = raw_title[:240]
			commentary_body = build_commentary_html(summary, link, site_label)
			bite_title = (f"Investing takeaway: {raw_title}")[:240]
			topic_tag = "Market News"
			bite_body = build_bite_explanation_html(raw_title, summary, link, site_label)

		footer = _source_attribution_footer(link, site_label)
		final_commentary = commentary_body + footer
		final_bite = bite_body + footer

		key = normalize_title_key(insight_title)
		if key in seen_keys:
			skipped_duplicates += 1
			continue
		if duplicate_insight_title(insight_title):
			skipped_duplicates += 1
			continue
		seen_keys.add(key)

		read_mins = _estimated_read_minutes(final_bite if rewrite else (summary + final_bite))

		market = canonicalize_insight_market(
			infer_insight_market(
				site_label=site_label,
				source_url=link,
				title=insight_title,
				summary=summary,
				commentary_html=final_commentary,
			)
		)

		# Prefer AI market when rewrite returned a valid Kenya/Global value.
		if rewrite and isinstance(rew, dict) and rew.get("market"):
			market = canonicalize_insight_market(rew.get("market"))

		try:
			insight = frappe.get_doc(
				{
					"doctype": "Growe Insight",
					"title": insight_title,
					"market": market,
					"sentiment": "Watch",
					"commentary": final_commentary,
					"week_starting": today(),
					"published_date": now_datetime(),
					"is_pro_only": 0,
				}
			)
			insight.insert(ignore_permissions=True)

			bite = frappe.get_doc(
				{
					"doctype": "Growe LearningBite",
					"title": bite_title,
					"topic_tag": topic_tag,
					"explanation": final_bite,
					"linked_insight": insight.name,
					"month_year": now_datetime().strftime("%B %Y"),
					"difficulty": "Beginner",
					"estimated_read_time": read_mins,
				}
			)
			bite.insert(ignore_permissions=True)
			created += 1
		except Exception as e:
			errors.append(f"{site_label}: could not save «{insight_title[:50]}» — {e!s}")
			frappe.log_error(title="News ingest insert failed", message=f"{site_label}\n{insight_title}\n{e!s}")

	frappe.db.commit()
	return {
		"created": created,
		"skipped_duplicates": skipped_duplicates,
		"errors": errors,
		"rewrite_with_ai": rewrite,
	}


@frappe.whitelist()
def reclassify_insight_markets():
	"""Fix market tags on existing insights (e.g. legacy NSE / Global mislabels)."""
	updated = 0
	for row in frappe.get_all("Growe Insight", fields=["name", "title", "commentary", "market"]):
		target = canonicalize_insight_market(
			infer_insight_market(title=row.title or "", commentary_html=row.commentary or "")
		)
		if target != (row.market or ""):
			frappe.db.set_value("Growe Insight", row.name, "market", target, update_modified=False)
			updated += 1
	frappe.db.commit()
	return {"updated": updated}


def daily_news_scrape():
	"""Scheduler entrypoint — 08:00 daily (cron in hooks.py). Respects Activate on News Settings."""
	if not _news_fetch_active():
		return
	try:
		fetch_best_news_now()
	except Exception as e:
		frappe.log_error(title="Daily news scrape failed", message=str(e))
