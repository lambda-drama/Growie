"""
Mansa Markets API — African exchange stock quotes (Nairobi NSE and others).

Docs: https://mansaapi.com/docs
OpenAPI: https://mansaapi.com/openapi.json

Configure Growe Price API:
  - api_provider: Mansa Markets
  - api_key: mansa_live_sk_… key (Bearer token)
  - api_base_url: https://mansaapi.com/api/v1  (no www — www returns 402)
  - endpoint_prices: markets/exchanges/NSE/stocks (optional)

Auth: Authorization: Bearer {api_key}
Kenya/NSE bulk: GET /markets/exchanges/NSE/stocks
Single quote:   GET /markets/exchanges/NSE/stocks/{ticker}
"""

from __future__ import annotations

import re

import frappe
import requests

_MANSA_DEFAULT_BASE = "https://mansaapi.com/api/v1"
_DEFAULT_EXCHANGE = "NSE"
_PAGE_LIMIT = 100


def _provider_api_key(provider: dict) -> str:
	from growie_app.api.price import _price_api_key

	return _price_api_key(provider)


def _service_base(provider: dict) -> str:
	raw = (provider.get("api_base_url") or "").strip().rstrip("/")
	if not raw:
		return _MANSA_DEFAULT_BASE
	# www.mansaapi.com does not serve the API correctly (402 / HTML).
	raw = re.sub(r"^https?://www\.mansaapi\.com", "https://mansaapi.com", raw, flags=re.I)
	if raw.rstrip("/").endswith("mansaapi.com"):
		return f"{raw.rstrip('/')}/api/v1"
	return raw


def _stocks_path(provider: dict, exchange: str) -> str:
	custom = (provider.get("endpoint_prices") or "").strip().strip("/")
	if custom and "markets/" in custom:
		return custom.replace("{exchange_code}", exchange.upper())
	return f"markets/exchanges/{exchange.upper()}/stocks"


def _auth_headers(provider: dict) -> dict[str, str]:
	key = _provider_api_key(provider)
	if not key:
		return {}
	return {"Authorization": f"Bearer {key}", "Accept": "application/json"}


def _mark_mansa_auth_failed(provider: dict, message: str) -> None:
	provider["_mansa_auth_failed"] = 1
	frappe.logger("growie.price").warning(
		"Mansa auth failed for %s: %s",
		provider.get("provider_name") or provider.get("name"),
		message[:200],
	)


def _mark_mansa_rate_limited(provider: dict, message: str) -> None:
	from growie_app.api.price import _mark_provider_rate_limited

	_mark_provider_rate_limited(provider, "mansa markets", message)


def _api_error_message(body) -> str:
	if not isinstance(body, dict):
		return ""
	err = body.get("error")
	if isinstance(err, dict):
		return str(err.get("message") or err.get("code") or err)
	return str(body.get("message") or "")


def _parse_stock_row(item: dict, currency: str = "KES") -> dict | None:
	if not isinstance(item, dict):
		return None
	ticker = (item.get("ticker") or "").upper().strip()
	try:
		price = float(item.get("price") or 0)
	except (TypeError, ValueError):
		price = 0.0
	if not ticker or not price:
		return None
	try:
		change_pct = float(item.get("change_pct") or 0)
	except (TypeError, ValueError):
		change_pct = 0.0
	return {
		"price": price,
		"change_percent": change_pct,
		"currency": (currency or "KES").upper(),
	}


def _request_json(provider: dict, url: str, *, params: dict | None = None) -> dict | None:
	if provider.get("_rate_limited") or provider.get("_mansa_auth_failed"):
		return None
	headers = _auth_headers(provider)
	if not headers:
		return None

	resp = requests.get(url, headers=headers, params=params or {}, timeout=20)
	if resp.status_code == 401:
		_mark_mansa_auth_failed(provider, "Unauthorized — check your Mansa API key.")
		return None
	if resp.status_code == 402:
		_mark_mansa_auth_failed(
			provider,
			"Payment required — use https://mansaapi.com (not www) and a valid mansa_live_sk key.",
		)
		return None
	if resp.status_code == 429:
		_mark_mansa_rate_limited(provider, "Too many requests")
		return None
	if resp.status_code == 404:
		return None
	if not resp.ok:
		frappe.logger("growie.price").warning(
			"Mansa HTTP %s %s: %s",
			resp.status_code,
			url,
			(resp.text or "")[:300],
		)
		return None

	try:
		body = resp.json()
	except ValueError:
		frappe.logger("growie.price").warning("Mansa non-JSON response from %s", url)
		return None

	if isinstance(body, dict) and body.get("success") is False:
		msg = _api_error_message(body)
		if msg and re.search(r"(?i)limit|quota|rate", msg):
			_mark_mansa_rate_limited(provider, msg)
		else:
			frappe.logger("growie.price").warning("Mansa API error: %s", msg[:300])
		return None
	return body if isinstance(body, dict) else None


def _fetch_single_stock(provider: dict, exchange: str, ticker: str) -> dict | None:
	base = _service_base(provider)
	path = _stocks_path(provider, exchange)
	url = f"{base}/{path}/{ticker.upper()}"
	body = _request_json(provider, url)
	if not body:
		return None
	item = body.get("data")
	meta = body.get("meta") if isinstance(body.get("meta"), dict) else {}
	currency = meta.get("currency") or "KES"
	if isinstance(item, dict):
		return _parse_stock_row(item, currency)
	return None


def _fetch_stocks_page(
	provider: dict,
	exchange: str,
	*,
	offset: int = 0,
	limit: int = _PAGE_LIMIT,
) -> tuple[list[dict], dict]:
	base = _service_base(provider)
	path = _stocks_path(provider, exchange)
	url = f"{base}/{path}"
	body = _request_json(
		provider,
		url,
		params={"offset": offset, "limit": limit},
	)
	if not body:
		return [], {}
	data = body.get("data") or []
	if not isinstance(data, list):
		data = []
	pagination = body.get("pagination") if isinstance(body.get("pagination"), dict) else {}
	return data, pagination


def fetch_mansa_prices(provider: dict, symbols: list, market: str = "NSE") -> dict:
	"""Fetch NSE (Kenya) quotes from Mansa Markets."""
	from growie_app.api.price import _log_price_fetch_error, _normalize_market_label

	if _normalize_market_label(market) != "NSE":
		return {}

	api_key = _provider_api_key(provider)
	if not api_key:
		frappe.logger("growie.price").warning(
			"Mansa %s: set API Key (mansa_live_sk_… from mansaapi.com/dashboard).",
			provider.get("provider_name") or provider.get("name"),
		)
		return {}

	exchange = _DEFAULT_EXCHANGE
	wanted = {(s or "").upper().strip() for s in symbols if (s or "").strip()}
	results: dict = {}
	if not wanted:
		return results

	# Small tests (Desk “Test Connection”) — one call per ticker is clearer and paginates less.
	if len(wanted) <= 5:
		for sym in sorted(wanted):
			try:
				quote = _fetch_single_stock(provider, exchange, sym)
				if quote:
					results[sym] = quote
			except Exception as exc:
				_log_price_fetch_error("Mansa", sym, exc)
		if not results:
			frappe.logger("growie.price").info(
				"Mansa %s: no quote for %s (exchange=%s, base=%s). "
				"Check API key and that api_base_url is https://mansaapi.com/api/v1 (not www).",
				provider.get("provider_name") or provider.get("name"),
				", ".join(sorted(wanted)),
				exchange,
				_service_base(provider),
			)
		return results

	# Bulk refresh — walk exchange pages until all wanted tickers are found.
	offset = 0
	total = None
	while wanted - set(results.keys()):
		try:
			rows, pagination = _fetch_stocks_page(provider, exchange, offset=offset, limit=_PAGE_LIMIT)
		except Exception as exc:
			_log_price_fetch_error("Mansa", exchange, exc)
			break

		if not rows:
			break

		for item in rows:
			ticker = (item.get("ticker") or "").upper().strip()
			if ticker not in wanted or ticker in results:
				continue
			parsed = _parse_stock_row(item, "KES")
			if parsed:
				results[ticker] = parsed

		if total is None:
			try:
				total = int(pagination.get("total") or 0)
			except (TypeError, ValueError):
				total = 0
		offset += len(rows)
		if total and offset >= total:
			break
		if len(rows) < _PAGE_LIMIT:
			break

	# Fallback singles for anything the bulk listing missed.
	for sym in sorted(wanted - set(results.keys())):
		try:
			quote = _fetch_single_stock(provider, exchange, sym)
			if quote:
				results[sym] = quote
		except Exception as exc:
			_log_price_fetch_error("Mansa", sym, exc)

	if not results:
		frappe.logger("growie.price").info(
			"Mansa %s: 0/%s NSE quote(s) returned for [%s]. base=%s",
			provider.get("provider_name") or provider.get("name"),
			len(wanted),
			", ".join(sorted(wanted)[:8]),
			_service_base(provider),
		)

	return results


def fetch_mansa_kes_per_usd(provider: dict) -> float | None:
	"""Return KES per 1 USD from Mansa forex feed."""
	base = _service_base(provider)
	url = f"{base}/markets/forex"
	body = _request_json(provider, url)
	if not body:
		return None
	rows = body.get("data") or []
	if not isinstance(rows, list):
		return None
	for row in rows:
		if not isinstance(row, dict):
			continue
		pair = str(row.get("pair") or "").upper()
		try:
			rate = float(row.get("rate") or 0)
		except (TypeError, ValueError):
			rate = 0.0
		if not rate:
			continue
		if pair in ("USD/KES", "USD-KES"):
			return rate
		if pair in ("KES/USD", "KES-USD"):
			return 1.0 / rate
	return None


def _parse_history_point(item: dict, currency: str = "KES") -> dict | None:
	"""Parse one Mansa history point into {date, price, currency}."""
	from frappe.utils import getdate

	if not isinstance(item, dict):
		return None
	raw_date = item.get("date") or item.get("trade_date") or item.get("t")
	if not raw_date:
		return None
	try:
		as_of = getdate(str(raw_date)[:10])
	except Exception:
		return None
	try:
		close = float(
			item.get("adj_close")
			or item.get("close")
			or item.get("price")
			or item.get("value")
			or 0
		)
	except (TypeError, ValueError):
		close = 0.0
	if close <= 0:
		return None
	return {
		"date": as_of,
		"price": close,
		"currency": (currency or "KES").upper(),
	}


def fetch_mansa_historical(
	provider: dict,
	symbols: list,
	date_from: str,
	date_to: str,
	market: str = "NSE",
) -> dict[str, list[dict]]:
	"""
	Fetch daily OHLCV history from Mansa for NSE tickers.

	``GET /markets/exchanges/NSE/stocks/{ticker}/history?from=&to=``
	Returns ``{ticker: [{date, price, currency}, …]}``.
	"""
	from growie_app.api.price import _log_price_fetch_error, _normalize_market_label

	if _normalize_market_label(market) != "NSE":
		return {}

	api_key = _provider_api_key(provider)
	if not api_key:
		frappe.logger("growie.price").warning(
			"Mansa %s: set API Key before fetching historical prices.",
			provider.get("provider_name") or provider.get("name"),
		)
		return {}

	exchange = _DEFAULT_EXCHANGE
	wanted = {(s or "").upper().strip() for s in symbols if (s or "").strip()}
	results: dict[str, list[dict]] = {}
	base = _service_base(provider)

	for sym in sorted(wanted):
		if provider.get("_rate_limited") or provider.get("_mansa_auth_failed"):
			break
		url = f"{base}/markets/exchanges/{exchange}/stocks/{sym}/history"
		try:
			body = _request_json(
				provider,
				url,
				params={"from": date_from, "to": date_to, "order": "asc", "limit": 20000},
			)
		except Exception as exc:
			_log_price_fetch_error("Mansa historical", sym, exc)
			continue
		if not body:
			continue

		data = body.get("data")
		currency = "KES"
		points = []
		if isinstance(data, dict):
			currency = (data.get("currency") or currency).upper()
			points = data.get("points") or data.get("history") or []
			meta = body.get("meta") if isinstance(body.get("meta"), dict) else {}
			if meta.get("currency"):
				currency = str(meta["currency"]).upper()
		elif isinstance(data, list):
			points = data

		if not isinstance(points, list):
			continue

		rows: list[dict] = []
		for item in points:
			parsed = _parse_history_point(item, currency)
			if parsed:
				rows.append(parsed)
		if rows:
			results[sym] = rows

	return results
