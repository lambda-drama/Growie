# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt
"""RSS/HTML helpers for News Settings → Growe Insight / Growe LearningBite ingestion."""

from __future__ import annotations

import html as html_module
import re
import xml.etree.ElementTree as ET
from typing import Any

import requests

import frappe

UA_HEADERS = {
	"User-Agent": "Mozilla/5.0 (compatible; GroweNewsBot/1.0; +https://growe.app) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
	"Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml, text/html;q=0.9, */*;q=0.8",
}

DEFAULT_YAHOO_RSS = "https://finance.yahoo.com/rss/topstories"

INVESTMENT_KEYWORD = re.compile(
	r"stock|market|invest|etf|fund|earnings|econom|fed|rate|bond|yield|ipo|trade|portfolio|equity|"
	r"dividend|bank|quarter|profit|revenue|nasdaq|s&p|dow|wall\s+street|nse|share|financial|crypto|bitcoin|"
	r"oil|gold|sec|merger|acquisition|analyst|forecast|credit|currency|forex|index|debt|lender|assets",
	re.I,
)


def fetch_article_plain_text(url: str, max_chars: int = 12000) -> str:
	"""Best-effort full-page text when AI rewrite needs more context (RSS snippets are thin)."""
	if not url or not url.startswith(("http://", "https://")):
		return ""
	try:
		text = http_get(url, timeout=16)
	except Exception:
		return ""
	text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", text)
	text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
	text = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", text)
	text = re.sub(r"<[^>]+>", " ", text)
	text = html_module.unescape(text)
	text = re.sub(r"\s+", " ", text).strip()
	return text[:max_chars]


def http_get(url: str, timeout: int = 22) -> str:
	resp = requests.get(url, headers=UA_HEADERS, timeout=timeout)
	resp.raise_for_status()
	resp.encoding = resp.apparent_encoding or getattr(resp, "encoding", None) or "utf-8"
	return resp.text or ""


def _local_tag(tag: str) -> str:
	return tag.split("}")[-1] if "}" in tag else tag


def parse_feed_xml(xml_content: str, max_items: int = 10) -> list[dict[str, Any]]:
	"""Parse RSS 2.0 items or Atom entries into dicts: title, link, summary."""
	out: list[dict[str, Any]] = []
	try:
		root = ET.fromstring(xml_content)
	except ET.ParseError:
		return out

	# RSS 2.0 <item>
	for item in root.iter():
		if _local_tag(item.tag) != "item":
			continue
		title = link = ""
		description = ""
		for ch in item:
			lt = _local_tag(ch.tag)
			if lt == "title" and ch.text:
				title = html_module.unescape(ch.text.strip())
			elif lt == "link" and ch.text:
				link = ch.text.strip()
			elif lt == "description" or lt.endswith("encoded"):
				raw = "".join(ch.itertext())
				description = html_module.unescape(re.sub(r"<[^>]+>", " ", raw))
				description = re.sub(r"\s+", " ", description).strip()
		if title:
			out.append({"title": title[:500], "link": link[:2000], "summary": (description or "")[:4000]})
		if len(out) >= max_items:
			return out

	# Atom <entry>
	if out:
		return out

	for entry in root.iter():
		if _local_tag(entry.tag) != "entry":
			continue
		title = link = ""
		summary = ""
		for ch in entry:
			lt = _local_tag(ch.tag)
			if lt == "title" and ch.text:
				title = html_module.unescape(ch.text.strip())
			elif lt == "link":
				link = (ch.get("href") or ch.text or "").strip()
			elif lt in ("summary", "content"):
				raw = "".join(ch.itertext())
				summary = html_module.unescape(re.sub(r"<[^>]+>", " ", raw))
				summary = re.sub(r"\s+", " ", summary).strip()
		if title:
			out.append({"title": title[:500], "link": link[:2000], "summary": (summary or "")[:4000]})
		if len(out) >= max_items:
			break

	return out


def extract_headlines_from_html_page(url: str, max_items: int = 4) -> list[dict[str, Any]]:
	"""Very light scrape: first plausible h1–h3 headings (fallback when no RSS)."""
	try:
		text = http_get(url)
	except Exception:
		return []
	candidates = re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", text, flags=re.IGNORECASE | re.DOTALL)
	out: list[dict[str, Any]] = []
	for raw in candidates:
		t = re.sub(r"<[^>]+>", "", raw)
		t = html_module.unescape(t).strip()
		if len(t) >= 16 and t not in [x["title"] for x in out]:
			out.append({"title": t[:500], "link": url, "summary": ""})
		if len(out) >= max_items:
			break
	return out


def get_alpha_vantage_api_key() -> str | None:
	rows = frappe.get_all(
		"Growe Price API",
		filters={"is_active": 1},
		fields=["api_key", "api_provider", "provider_name"],
	)
	for r in rows:
		ap = (r.api_provider or "").lower()
		pn = (r.provider_name or "").lower().replace(" ", "")
		if "alpha" in ap or "alphavantage" in pn or "alphavantage" in ap:
			key = (r.api_key or "").strip()
			if key:
				return key
	return None


def fetch_alpha_vantage_news(api_key: str, limit: int = 6) -> list[dict[str, Any]]:
	"""NEWS_SENTIMENT — broad ETFs/large caps so headlines stay investment-relevant."""
	url = "https://www.alphavantage.co/query"
	params = {
		"function": "NEWS_SENTIMENT",
		"tickers": "SPY,QQQ,MSFT,AAPL,GOOGL,BRK.B,JPM",
		"limit": str(min(max(limit * 4, 10), 50)),
		"apikey": api_key,
	}
	resp = requests.get(url, params=params, timeout=25)
	resp.raise_for_status()
	data = resp.json()

	if data.get("Note") or data.get("Information"):
		frappe.log_error(
			title="Alpha Vantage news (rate limit or notice)",
			message=str(data)[:1200],
		)
		return []

	feed = data.get("feed") or []
	out: list[dict[str, Any]] = []
	for item in feed:
		title = (item.get("title") or "").strip()
		if not title:
			continue
		link = (item.get("url") or "").strip()
		summary = (item.get("summary") or "").strip()
		tickers = item.get("ticker_sentiment") or item.get("overall_sentiment_label") or ""
		if not summary and tickers:
			summary = str(tickers)
		out.append({"title": title[:500], "link": link[:2000], "summary": summary[:4000]})
		if len(out) >= limit:
			break
	return out


def _is_investment_related(title: str, summary: str) -> bool:
	text = f"{title} {summary or ''}"
	if len(text.strip()) < 12:
		return False
	return bool(INVESTMENT_KEYWORD.search(text))


def fetch_articles_for_configured_site(
	sites_row_name: str,
	fallback_site_link: str,
	max_items: int = 6,
) -> tuple[list[dict[str, Any]], list[str]]:
	"""
	Return (articles, errors) for one News WebScrapping Sites document linked from News Settings child table.
	"""
	errors: list[str] = []
	if not sites_row_name:
		return [], ["News Settings row is missing the Sites link"]

	meta = frappe.db.get_value(
		"News WebScrapping Sites",
		sites_row_name,
		["site_name", "rss_feed", "site_link"],
		as_dict=True,
	)
	if not meta:
		return [], [f"News WebScrapping Sites {sites_row_name} not found"]

	site_name = (meta.site_name or "").strip()
	name_lower = site_name.lower()
	rss_url = (meta.rss_feed or "").strip()
	base_link = (meta.site_link or fallback_site_link or "").strip()

	try:
		# 1) Explicit RSS / Atom URL on the site record
		if rss_url:
			xml = http_get(rss_url)
			articles = parse_feed_xml(xml, max_items=max_items)
			if not articles:
				errors.append(f"{site_name}: no stories parsed from RSS ({rss_url})")
			return _filter_relevant(articles, max_items=max_items), errors

		# 2) Alpha Vantage (API — uses Growe Price API key)
		if "alpha" in name_lower and "vantage" in name_lower:
			key = get_alpha_vantage_api_key()
			if not key:
				errors.append(
					f"{site_name}: set an active Growe Price API provider with Alpha Vantage and an API key."
				)
				return [], errors
			articles = fetch_alpha_vantage_news(key, limit=max_items)
			if not articles:
				errors.append(f"{site_name}: Alpha Vantage returned no articles (check quota/key).")
			return _filter_relevant(articles, max_items=max_items), errors

		# 3) Yahoo: default top stories RSS
		if "yahoo" in name_lower:
			xml = http_get(DEFAULT_YAHOO_RSS)
			articles = parse_feed_xml(xml, max_items=max_items)
			return _filter_relevant(articles, max_items=max_items), errors

		# 4) Generic: URL looks like a feed
		if base_link and (
			base_link.endswith(".rss")
			or base_link.endswith(".xml")
			or "/rss" in base_link.lower()
			or "/feed" in base_link.lower()
			or "format=rss" in base_link.lower()
		):
			xml = http_get(base_link)
			articles = parse_feed_xml(xml, max_items=max_items)
			if not articles:
				errors.append(f"{site_name}: could not parse feed at {base_link}")
			return _filter_relevant(articles, max_items=max_items), errors

		# 5) HTML fallback
		if base_link:
			articles = extract_headlines_from_html_page(base_link, max_items=max_items)
			if not articles:
				errors.append(
					f"{site_name}: no headings found — add an RSS or Atom URL on the site record "
					f"(many publishers block server-side scraping)."
				)
			return _filter_relevant(articles, max_items=max_items), errors

		errors.append(f"{site_name}: configure Site Link or RSS feed URL.")
		return [], errors

	except requests.RequestException as e:
		errors.append(f"{site_name}: network error — {e!s}")
		return [], errors
	except Exception as e:
		errors.append(f"{site_name}: {e!s}")
		frappe.log_error(title="News ingest error", message=f"{site_name}\n{e!s}")
		return [], errors


def _filter_relevant(
	articles: list[dict[str, Any]],
	*,
	max_items: int = 8,
) -> list[dict[str, Any]]:
	"""Prefer investment-related items. For `max_items <= 1`, require a match (no wild fallback)."""
	out: list[dict[str, Any]] = []
	for a in articles:
		if _is_investment_related(a.get("title") or "", a.get("summary") or ""):
			out.append(a)
		if len(out) >= max_items:
			return out[:max_items]
	if out:
		return out[:max_items]
	if max_items <= 1:
		return []
	return articles[:max_items]


NSE_SOURCE_HINTS = re.compile(
	r"nairobi\s+securit|nse\.co\.ke|business\s+daily|nation\s+africa|the\s+standard|"
	r"citizen\s+digital|capital\s+fm|kenya\s+wall\s+street|east\s+african|\.co\.ke",
	re.I,
)

NSE_CONTENT_HINTS = re.compile(
	r"\bnairobi\s+securities\s+exchange\b|\bnse\s+(20|25|all-share|asi)\b|\bnasi\b|"
	r"\bnse\s+closed\b|\bnse\s+mixed\b|kenyan\s+(equity|market|shares)|"
	r"equity\s+turnover\s+came\s+in\s+around\s+kes",
	re.I,
)


def _plain_text_from_html(html: str) -> str:
	text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html or "")
	text = re.sub(r"<[^>]+>", " ", text)
	text = html_module.unescape(text)
	return re.sub(r"\s+", " ", text).strip()


def infer_insight_market(
	*,
	site_label: str = "",
	source_url: str = "",
	title: str = "",
	summary: str = "",
	commentary_html: str = "",
) -> str:
	"""
	Return Growe Insight market: NSE or Global.

	Legacy ingest always saved Global; infer from source site, URL, and article text.
	"""
	blob = " ".join(
		[
			site_label or "",
			source_url or "",
			title or "",
			summary or "",
			_plain_text_from_html(commentary_html),
		]
	)
	if not blob.strip():
		return "Global"

	if NSE_SOURCE_HINTS.search(blob) or NSE_CONTENT_HINTS.search(blob):
		return "NSE"

	if re.search(r"\bnse\b", blob, re.I) and re.search(
		r"nairobi|kenya|kenyan|\.co\.ke|kes\s+\d", blob, re.I
	):
		return "NSE"

	if source_url and re.search(r"\.co\.ke\b", source_url, re.I):
		return "NSE"

	return "Global"


def normalize_title_key(title: str) -> str:
	return re.sub(r"\s+", " ", (title or "").strip().lower())[:120]


def duplicate_insight_title(title: str) -> bool:
	t = (title or "").strip()
	if not t:
		return True
	if frappe.db.exists("Growe Insight", {"title": t}):
		return True
	prefix = t[: min(80, len(t))]
	if frappe.get_all("Growe Insight", filters={"title": ["like", f"{prefix}%"]}, limit=1, pluck="name"):
		return True
	return False


def build_commentary_html(
	summary: str,
	article_link: str,
	source_label: str,
) -> str:
	from frappe.utils import escape_html

	parts = [f"<p><strong>{escape_html(source_label)}</strong></p>"]
	if summary:
		parts.append(f"<p>{escape_html(summary[:4000])}</p>")
	if article_link and article_link.startswith("http"):
		safe_url = escape_html(article_link)
		parts.append(f'<p><a href="{safe_url}" rel="noopener noreferrer">Read the full story</a></p>')
	return "\n".join(parts)


def build_bite_explanation_html(
	title: str,
	summary: str,
	article_link: str,
	source_label: str,
) -> str:
	from frappe.utils import escape_html

	lines = [
		f"<p><strong>What happened:</strong> {escape_html(title)}</p>",
		'<p><strong>Why it matters for investors:</strong> Headlines like this can move sentiment, '
		"earnings expectations, and sector rotation. Use it as a prompt to check your allocations and risk.</p>",
	]
	if summary:
		lines.append(f"<p>{escape_html(summary[:2500])}</p>")
	if article_link and article_link.startswith("http"):
		su = escape_html(article_link)
		lines.append(f'<p>Source: <a href="{su}" rel="noopener noreferrer">{escape_html(source_label)}</a></p>')
	else:
		lines.append(f"<p>Source: {escape_html(source_label)}</p>")
	return "\n".join(lines)
