"""
Goldman Sachs Marquee / GS Quant market data (REST).

Docs: https://developer.gs.com/docs
Auth: OAuth2 client_credentials → https://idfs.gs.com/as/token.oauth2
API:  https://api.gs.com/data/{dataset}/last/query

Equity EOD prices use dataset TREOD (Thomson Reuters End-of-Day) with field closePrice.
Configure Growe Price API:
  - api_provider: Goldman Sachs
  - api_key: OAuth client_id
  - api_secret: OAuth client_secret
  - api_base_url: https://api.gs.com
  - endpoint_prices: TREOD (dataset id, optional — defaults to TREOD)
"""

from __future__ import annotations

import time
from datetime import date, timedelta

import frappe
import requests

_GS_AUTH_URL_PROD = "https://idfs.gs.com/as/token.oauth2"
_GS_AUTH_URL_QA = "https://idfs-qa.gs.com/as/token.oauth2"
_GS_DEFAULT_BASE = "https://api.gs.com"
_GS_DEFAULT_DATASET = "TREOD"
_GS_DEFAULT_SCOPE = "read_product_data"
_TOKEN_CACHE: dict[str, tuple[str, float]] = {}


def _provider_client_id(provider: dict) -> str:
	name = provider.get("name")
	if not name:
		return ""
	try:
		doc = frappe.get_doc("Growe Price API", name)
		pw = doc.get_password("api_key")
		if pw:
			return str(pw).strip()
	except Exception:
		pass
	return ""


def _provider_secret(provider: dict) -> str:
	name = provider.get("name")
	if not name:
		return ""
	try:
		doc = frappe.get_doc("Growe Price API", name)
		pw = doc.get_password("api_secret")
		if pw:
			return str(pw).strip()
	except Exception:
		pass
	return ""


def _auth_url(api_base: str) -> str:
	base = (api_base or "").lower()
	if "marquee-qa" in base or "idfs-qa" in base or "-qa." in base:
		return _GS_AUTH_URL_QA
	return _GS_AUTH_URL_PROD


def _dataset_id(provider: dict) -> str:
	raw = (provider.get("endpoint_prices") or "").strip()
	if not raw:
		return _GS_DEFAULT_DATASET
	# Allow full path legacy values — keep last segment only.
	if "/" in raw:
		raw = raw.rstrip("/").split("/")[-1]
	return raw or _GS_DEFAULT_DATASET


def _get_access_token(provider: dict, client_id: str, client_secret: str) -> str:
	cache_key = provider.get("name") or client_id
	cached = _TOKEN_CACHE.get(cache_key)
	if cached and cached[1] > time.time() + 30:
		return cached[0]

	auth_url = _auth_url(provider.get("api_base_url") or _GS_DEFAULT_BASE)
	resp = requests.post(
		auth_url,
		data={
			"grant_type": "client_credentials",
			"client_id": client_id,
			"client_secret": client_secret,
			"scope": _GS_DEFAULT_SCOPE,
		},
		timeout=20,
	)
	if resp.status_code == 429:
		raise RuntimeError("Goldman Sachs OAuth rate limited (429)")
	resp.raise_for_status()
	body = resp.json()
	token = (body.get("access_token") or "").strip()
	if not token:
		raise RuntimeError("Goldman Sachs OAuth: no access_token in response")
	expires_in = float(body.get("expires_in") or 3600)
	_TOKEN_CACHE[cache_key] = (token, time.time() + expires_in)
	return token


def _gs_headers(token: str) -> dict:
	return {
		"Authorization": f"Bearer {token}",
		"Content-Type": "application/json",
		"Accept": "application/json",
	}


def _resolve_symbol_keys(
	base: str, token: str, ticker: str, symbol_override: str | None
) -> list[dict]:
	"""Build TREOD where-clause candidates: bbid (Bloomberg), assetId, ticker."""
	headers = _gs_headers(token)
	candidates: list[dict] = []

	override = (symbol_override or "").strip()
	if override and not override.upper().endswith(".NR"):
		# api_symbol often holds Bloomberg id e.g. AAPL UW — TREOD bbid dimension.
		candidates.append({"bbid": override})

	try:
		resp = requests.get(
			f"{base.rstrip('/')}/markets/securities",
			headers=headers,
			params={"ticker": ticker, "limit": 5, "isPrimary": "true"},
			timeout=20,
		)
		if resp.ok:
			payload = resp.json()
			for row in payload.get("results") or []:
				asset_id = (row.get("id") or row.get("assetId") or "").strip()
				bbid = (row.get("bbid") or "").strip()
				if asset_id:
					candidates.append({"assetId": asset_id})
				if bbid:
					candidates.append({"bbid": bbid})
	except Exception as exc:
		frappe.logger("growie.price").debug(
			"Goldman Sachs secmaster lookup failed for %s: %s", ticker, exc
		)

	candidates.append({"ticker": ticker})

	# De-dupe while preserving order.
	seen: set[str] = set()
	unique: list[dict] = []
	for item in candidates:
		key = str(sorted(item.items()))
		if key in seen:
			continue
		seen.add(key)
		unique.append(item)
	return unique


def _treod_last_row(
	base: str, token: str, dataset: str, where: dict, end: date | None = None
) -> dict | None:
	end = end or date.today()
	url = f"{base.rstrip('/')}/data/{dataset}/last/query"
	body = {
		"endDate": end.isoformat(),
		"where": where,
		"fields": ["closePrice", "adjustedClosePrice"],
	}
	resp = requests.post(url, headers=_gs_headers(token), json=body, timeout=25)
	if resp.status_code == 429:
		raise RuntimeError("Goldman Sachs data API rate limited (429)")
	if resp.status_code == 404:
		return None
	if not resp.ok:
		frappe.logger("growie.price").debug(
			"Goldman Sachs TREOD last/query %s: %s %s", where, resp.status_code, resp.text[:300]
		)
		return None

	data = resp.json().get("data") if resp.content else None
	if not data:
		return None
	row = data[0] if isinstance(data, list) else data
	return row if isinstance(row, dict) else None


def _treod_change_percent(
	base: str, token: str, dataset: str, where: dict, end: date | None = None
) -> float:
	"""Approximate 1-day change from last two close prices."""
	end = end or date.today()
	start = end - timedelta(days=7)
	url = f"{base.rstrip('/')}/data/{dataset}/query"
	body = {
		"startDate": start.isoformat(),
		"endDate": end.isoformat(),
		"where": where,
		"fields": ["closePrice"],
	}
	try:
		resp = requests.post(url, headers=_gs_headers(token), json=body, timeout=25)
		if not resp.ok:
			return 0.0
		rows = resp.json().get("data") or []
		closes = []
		for row in rows:
			if not isinstance(row, dict):
				continue
			val = row.get("closePrice")
			if val is not None:
				try:
					closes.append(float(val))
				except (TypeError, ValueError):
					pass
		if len(closes) < 2:
			return 0.0
		prev, last = closes[-2], closes[-1]
		if prev and prev != 0:
			return round((last - prev) / prev * 100, 4)
	except Exception:
		pass
	return 0.0


def fetch_goldman_sachs_prices(
	provider: dict,
	symbols: list,
	market: str = "Global",
	symbol_override_map: dict | None = None,
) -> dict:
	"""
	Fetch latest EOD close prices via Goldman Sachs Marquee TREOD dataset.
	Returns {TICKER: {price, change_percent, currency}}.
	"""
	if str(market or "").upper() == "NSE":
		return {}

	client_id = (provider.get("_api_key_resolved") or _provider_client_id(provider)).strip()
	client_secret = _provider_secret(provider)
	if not client_id or not client_secret:
		frappe.log_error(
			title="Goldman Sachs: missing OAuth credentials",
			message="Set API Key = client_id and API Secret = client_secret on Growe Price API.",
		)
		return {}

	base = (provider.get("api_base_url") or "").strip().rstrip("/") or _GS_DEFAULT_BASE
	dataset = _dataset_id(provider)
	symbol_override_map = symbol_override_map or {}

	try:
		token = _get_access_token(provider, client_id, client_secret)
	except Exception as exc:
		frappe.log_error(title="Goldman Sachs OAuth failed", message=str(exc))
		return {}

	results: dict = {}
	for idx, symbol in enumerate(symbols):
		if idx > 0:
			time.sleep(0.35)

		sym_u = (symbol or "").upper().strip()
		if not sym_u:
			continue

		override = (symbol_override_map.get(sym_u) or "").strip()
		row = None
		used_where: dict | None = None
		for where in _resolve_symbol_keys(base, token, sym_u, override):
			row = _treod_last_row(base, token, dataset, where)
			if row:
				used_where = where
				break

		if not row or not used_where:
			frappe.logger("growie.price").debug(
				"Goldman Sachs: no TREOD price for %s", sym_u
			)
			continue

		price_raw = row.get("closePrice")
		if price_raw is None:
			price_raw = row.get("adjustedClosePrice")
		try:
			price = float(price_raw or 0)
		except (TypeError, ValueError):
			price = 0.0
		if not price:
			continue

		change_pct = _treod_change_percent(base, token, dataset, used_where)
		currency = (row.get("currency") or "USD").upper()
		if currency not in ("USD", "KES", "EUR", "GBP"):
			currency = "USD"

		results[sym_u] = {
			"price": price,
			"change_percent": change_pct,
			"currency": currency,
		}

	return results
