"""
Twelve Data market quotes — batch + exchange-aware.

Docs: https://twelvedata.com/docs
Batch: https://support.twelvedata.com/en/articles/5203360-batch-api-requests

Uses Growe Stock exchange_platform as Twelve Data `exchange` query param (NSE, NYSE, NASDAQ, …).
"""

from __future__ import annotations

import re
import time
from urllib.parse import quote

import frappe
import requests

_TD_DEFAULT_BASE = "https://api.twelvedata.com"
_TD_QUOTE_PATH = "/quote"
_TD_BATCH_PATH = "/batch"
_TD_BATCH_SIZE = 120

# Growe Exchange Platform → Twelve Data exchange name
_TD_EXCHANGE_MAP = {
	"NSE": "NSE",
	"NYSE": "NYSE",
	"NASDAQ": "NASDAQ",
	"LSE": "LSE",
	"EURONEXT": "Euronext",
	"JPX": "JPX",
	"HKEX": "HKEX",
	"JSE": "JSE",
	"AMEX": "NYSE",
	"XETRA": "XETR",
}


def _provider_api_key(provider: dict) -> str:
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


def twelve_data_exchange(exchange_platform: str | None, market: str = "Global") -> str | None:
	"""Map Growe exchange_platform to Twelve Data exchange parameter."""
	raw = (exchange_platform or "").strip()
	if raw:
		key = raw.upper()
		return _TD_EXCHANGE_MAP.get(key, raw)
	if str(market or "").upper() == "NSE":
		return "NSE"
	return None


def twelve_data_country(exchange_platform: str | None, market: str = "Global") -> str | None:
	"""Disambiguate Nairobi NSE from Indian NSE on Twelve Data."""
	if str(market or "").upper() == "NSE":
		return "Kenya"
	if (exchange_platform or "").strip().upper() == "NSE":
		return "Kenya"
	return None


def _load_exchange_map(tickers: list[str]) -> dict[str, str]:
	uniq = list({(t or "").upper() for t in tickers if (t or "").strip()})
	if not uniq:
		return {}
	rows = frappe.get_all(
		"Growe Stock",
		filters={"ticker": ["in", uniq]},
		fields=["ticker", "exchange_platform"],
	)
	out: dict[str, str] = {}
	for row in rows:
		t = (row.ticker or "").upper()
		ex = (row.get("exchange_platform") or "").strip()
		if t and ex:
			out[t] = ex
	return out


def _parse_quote_payload(body: dict) -> dict | None:
	if not isinstance(body, dict):
		return None
	if body.get("status") == "error" or (body.get("code") and int(body.get("code") or 0) >= 400):
		return None

	price_raw = body.get("close")
	if price_raw is None:
		price_raw = body.get("price")
	if price_raw is None:
		price_raw = body.get("previous_close")
	try:
		price = float(price_raw or 0)
	except (TypeError, ValueError):
		price = 0.0
	if not price:
		return None

	change_pct = 0.0
	pct_raw = body.get("percent_change")
	if pct_raw is not None:
		try:
			change_pct = float(str(pct_raw).replace("%", "").strip() or 0)
		except (TypeError, ValueError):
			change_pct = 0.0
	else:
		try:
			prev = float(body.get("previous_close") or 0)
			if prev:
				change_pct = round((price - prev) / prev * 100, 4)
		except (TypeError, ValueError):
			pass

	currency = (body.get("currency") or "USD").upper()
	if currency not in ("USD", "KES", "EUR", "GBP"):
		currency = "USD"

	return {
		"price": price,
		"change_percent": change_pct,
		"currency": currency,
	}


def _parse_batch_quote_response(data: dict, id_to_ticker: dict[str, str]) -> dict:
	results: dict = {}
	if not isinstance(data, dict):
		return results
	for req_id, payload in data.items():
		ticker = id_to_ticker.get(req_id)
		if not ticker:
			continue
		parsed = _parse_quote_payload(payload if isinstance(payload, dict) else {})
		if parsed:
			results[ticker] = parsed
	return results


def _quote_get_single(
	base: str,
	path: str,
	api_key: str,
	ticker: str,
	exchange: str | None,
	country: str | None,
) -> dict:
	"""GET /quote for one symbol (fallback when batch misses)."""
	url = f"{base.rstrip('/')}{path}"
	params: dict = {"symbol": ticker, "apikey": api_key}
	if exchange:
		params["exchange"] = exchange
	if country:
		params["country"] = country

	resp = requests.get(url, params=params, timeout=25)
	if resp.status_code == 429:
		raise RuntimeError("Twelve Data rate limited (429)")
	resp.raise_for_status()
	body = resp.json()
	parsed = _parse_quote_payload(body if isinstance(body, dict) else {})
	return {ticker.upper(): parsed} if parsed else {}


def _quote_post_batch(
	base: str,
	api_key: str,
	items: list[tuple[str, str | None, str | None]],
) -> dict:
	"""POST /batch — per-symbol quote URLs with individual exchange/country params."""
	url = f"{base.rstrip('/')}{_TD_BATCH_PATH}"
	payload: dict[str, str] = {}
	id_to_ticker: dict[str, str] = {}
	for idx, (ticker, exchange, country) in enumerate(items):
		req_id = f"q{idx}"
		id_to_ticker[req_id] = ticker.upper()
		q = f"/quote?symbol={quote(ticker, safe='')}"
		if exchange:
			q += f"&exchange={quote(exchange, safe='')}"
		if country:
			q += f"&country={quote(country, safe='')}"
		payload[req_id] = q

	resp = requests.post(
		url,
		params={"apikey": api_key},
		json=payload,
		timeout=45,
	)
	if resp.status_code == 429:
		raise RuntimeError("Twelve Data batch rate limited (429)")
	resp.raise_for_status()
	body = resp.json()
	if isinstance(body, dict) and body.get("status") == "error":
		msg = body.get("message") or str(body)
		if re.search(r"(?i)limit|quota|rate", msg):
			raise RuntimeError(msg)
		return {}

	data = body.get("data") if isinstance(body, dict) else None
	return _parse_batch_quote_response(data or {}, id_to_ticker)


def fetch_twelve_data_prices(
	provider: dict,
	symbols: list,
	market: str = "Global",
	symbol_override_map: dict | None = None,
) -> dict:
	"""
	Fetch quotes via Twelve Data. Uses exchange_platform from Growe Stock when set.
	Returns {TICKER: {price, change_percent, currency}}.
	"""
	del symbol_override_map  # api_symbol not used; exchange_platform drives routing

	api_key = _provider_api_key(provider)
	if not api_key:
		frappe.log_error(
			title="Twelve Data: missing API key",
			message="Set API Key on Growe Price API (Twelve Data).",
		)
		return {}

	base = (provider.get("api_base_url") or "").strip().rstrip("/") or _TD_DEFAULT_BASE
	path = (provider.get("endpoint_prices") or "").strip() or _TD_QUOTE_PATH
	if not path.startswith("/"):
		path = "/" + path

	tickers = [(s or "").upper().strip() for s in symbols if (s or "").strip()]
	if not tickers:
		return {}

	exchange_map = _load_exchange_map(tickers)
	market_label = str(market or "Global")

	# /quote only accepts one symbol per GET; use POST /batch for all tickers.
	items: list[tuple[str, str | None, str | None]] = []
	for t in tickers:
		ex_platform = exchange_map.get(t)
		td_ex = twelve_data_exchange(ex_platform, market_label)
		td_country = twelve_data_country(ex_platform, market_label)
		items.append((t, td_ex, td_country))

	results: dict = {}

	try:
		for i in range(0, len(items), _TD_BATCH_SIZE):
			chunk = items[i : i + _TD_BATCH_SIZE]
			if not chunk:
				continue
			if i > 0:
				time.sleep(0.4)
			results.update(_quote_post_batch(base, api_key, chunk))

		# Fallback: single GET for any ticker the batch did not return
		missing = [t for t in tickers if t not in results]
		for t in missing:
			ex_platform = exchange_map.get(t)
			td_ex = twelve_data_exchange(ex_platform, market_label)
			td_country = twelve_data_country(ex_platform, market_label)
			results.update(_quote_get_single(base, path, api_key, t, td_ex, td_country))
			time.sleep(0.15)

		if not results and tickers:
			frappe.log_error(
				title="Twelve Data: no quotes returned",
				message=(
					f"Requested {len(tickers)} ticker(s) for market {market_label!r}: "
					f"{', '.join(tickers[:20])}{'…' if len(tickers) > 20 else ''}. "
					"Check API key, plan quota, and Growe Stock exchange_platform values."
				),
			)

	except RuntimeError as exc:
		if re.search(r"(?i)rate|limit|quota", str(exc)):
			frappe.logger("growie.price").warning("Twelve Data: %s", exc)
		else:
			frappe.log_error(title="Twelve Data fetch error", message=str(exc))
	except Exception as exc:
		frappe.log_error(title="Twelve Data fetch error", message=str(exc))

	return results
