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
	from growie_app.api.price import _price_api_key

	return _price_api_key(provider)


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
	if body.get("status") == "error":
		return None
	code = body.get("code")
	if code is not None:
		try:
			if int(code) >= 400:
				return None
		except (TypeError, ValueError):
			pass

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


def _quote_url(
	base: str,
	path: str,
	api_key: str,
	ticker: str,
	exchange: str | None = None,
	country: str | None = None,
) -> str:
	"""Build a full GET /quote URL."""
	root = f"{base.rstrip('/')}{path}"
	parts = [f"symbol={quote(ticker, safe='')}", f"apikey={quote(api_key, safe='')}"]
	if exchange:
		parts.append(f"exchange={quote(exchange, safe='')}")
	if country:
		parts.append(f"country={quote(country, safe='')}")
	return f"{root}?{'&'.join(parts)}"


def _quote_get_single(
	base: str,
	path: str,
	api_key: str,
	ticker: str,
	exchange: str | None,
	country: str | None,
) -> dict:
	"""GET /quote for one symbol."""
	url = _quote_url(base, path, api_key, ticker, exchange, country)
	resp = requests.get(url, timeout=25)
	if resp.status_code == 429:
		raise RuntimeError("Twelve Data rate limited (429)")
	resp.raise_for_status()
	body = resp.json()
	parsed = _parse_quote_payload(body if isinstance(body, dict) else {})
	return {ticker.upper(): parsed} if parsed else {}


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
	results: dict = {}

	try:
		# One GET /quote per symbol — same path as Test Connection (reliable for bulk).
		for i, t in enumerate(tickers):
			ex_platform = exchange_map.get(t)
			td_ex = twelve_data_exchange(ex_platform, market_label)
			td_country = twelve_data_country(ex_platform, market_label)
			results.update(
				_quote_get_single(base, path, api_key, t, td_ex, td_country)
			)
			if i + 1 < len(tickers):
				time.sleep(0.08)

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
