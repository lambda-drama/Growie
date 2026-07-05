"""
EODData modern REST API — end-of-day quotes.

Docs: https://api.eoddata.com/scalar/v1
Products: https://www.eoddata.com/products/api.aspx

Configure Growe Price API:
  - api_provider: EODData
  - api_key: EODData ApiKey (from https://eoddata.com/myaccount/api.aspx)
  - api_base_url: https://api.eoddata.com (optional)
  - endpoint_prices: Quote/Get (optional)

Auth: append ApiKey query param to every request (no username/password).

Uses Growe Stock exchange_platform as EODData exchange code (NASDAQ, NYSE, LSE, …).
Kenya (Nairobi NSE) tickers are skipped — EODData NSE is the Indian exchange.
"""

from __future__ import annotations

import time

import frappe
import requests

_EODDATA_DEFAULT_BASE = "https://api.eoddata.com"
_QUOTE_PATH = "/Quote/Get"

# Growe exchange_platform → EODData exchange code
_EODDATA_EXCHANGE_MAP = {
	"NYSE": "NYSE",
	"NASDAQ": "NASDAQ",
	"XNAS": "NASDAQ",
	"AMEX": "AMEX",
	"LSE": "LSE",
	"XLON": "LSE",
	"FRA": "FRA",
	"XETRA": "FRA",
	"PAR": "PAR",
	"AMS": "AMS",
	"BRU": "BRU",
	"LIS": "LIS",
	"OSL": "OSL",
	"ASX": "ASX",
	"TSX": "TSX",
	"TSXV": "TSXV",
	"JSE": "JSE",
	"XJSE": "JSE",
	"HKEX": "HKEX",
	"SGX": "SGX",
	"TSE": "TSE",
	"SHE": "SHE",
	"SHG": "SHG",
	"MSE": "MSE",
	"EURONEXT": "PAR",
	"Euronext": "PAR",
}

_EXCHANGE_CURRENCY = {
	"NYSE": "USD",
	"NASDAQ": "USD",
	"AMEX": "USD",
	"OTCBB": "USD",
	"LSE": "GBP",
	"FRA": "EUR",
	"PAR": "EUR",
	"AMS": "EUR",
	"BRU": "EUR",
	"LIS": "EUR",
	"OSL": "NOK",
	"JSE": "ZAR",
	"ASX": "AUD",
	"TSX": "CAD",
	"TSXV": "CAD",
	"HKEX": "HKD",
	"SGX": "SGD",
	"TSE": "JPY",
	"SHE": "CNY",
	"SHG": "CNY",
	"NSE": "INR",
}


def _provider_api_key(provider: dict) -> str:
	from growie_app.api.price import _price_api_key

	return _price_api_key(provider)


def _service_base(provider: dict) -> str:
	raw = (provider.get("api_base_url") or "").strip().rstrip("/")
	# Legacy SOAP installs may still point at ws.eoddata.com — prefer modern API.
	if not raw or "ws.eoddata.com" in raw.lower():
		return _EODDATA_DEFAULT_BASE
	return raw


def _quote_path(provider: dict) -> str:
	raw = (provider.get("endpoint_prices") or "").strip().strip("/")
	if not raw or raw.lower() in ("quoteget", "quote/get"):
		return _QUOTE_PATH.strip("/")
	return raw.strip("/")


def _mark_eoddata_auth_failed(provider: dict, message: str) -> None:
	provider["_eoddata_auth_failed"] = 1
	frappe.logger("growie.price").warning(
		"EODData auth failed for %s: %s",
		provider.get("provider_name") or provider.get("name"),
		message[:200],
	)


def _mark_eoddata_rate_limited(provider: dict, message: str) -> None:
	from growie_app.api.price import _mark_provider_rate_limited

	_mark_provider_rate_limited(provider, "eoddata", message)


def _parse_quote_json(body: dict, exchange: str) -> dict | None:
	if not isinstance(body, dict):
		return None

	try:
		close = float(body.get("close") or 0)
	except (TypeError, ValueError):
		close = 0.0
	if not close:
		return None

	try:
		previous = float(body.get("previous") or 0)
	except (TypeError, ValueError):
		previous = 0.0

	if previous:
		change_pct = round((close - previous) / previous * 100, 4)
	else:
		try:
			change = float(body.get("change") or 0)
			change_pct = round(change / close * 100, 4) if close else 0.0
		except (TypeError, ValueError):
			change_pct = 0.0

	currency = (body.get("currency") or _EXCHANGE_CURRENCY.get(exchange.upper(), "USD"))
	return {
		"price": close,
		"change_percent": change_pct,
		"currency": str(currency).upper(),
	}


def _fetch_quote_get(
	provider: dict,
	api_key: str,
	exchange: str,
	symbol: str,
) -> dict | None:
	if provider.get("_rate_limited") or provider.get("_eoddata_auth_failed"):
		return None

	base = _service_base(provider)
	path = _quote_path(provider)
	url = f"{base}/{path}/{exchange.upper()}/{symbol.upper()}"
	resp = requests.get(url, params={"ApiKey": api_key}, timeout=25)

	if resp.status_code == 401:
		_mark_eoddata_auth_failed(provider, "Unauthorized — check your EODData ApiKey.")
		return None
	if resp.status_code == 429:
		_mark_eoddata_rate_limited(provider, "Too many requests")
		return None
	if resp.status_code == 404:
		return None
	if not resp.ok:
		frappe.logger("growie.price").warning(
			"EODData quote %s/%s HTTP %s", exchange, symbol, resp.status_code
		)
		return None

	try:
		body = resp.json()
	except ValueError:
		return None

	if isinstance(body, list):
		body = body[0] if body else None
	return _parse_quote_json(body, exchange) if body else None


def eoddata_exchange(exchange_platform: str | None, market: str = "Global") -> str | None:
	"""Map Growe Stock exchange_platform to an EODData exchange code."""
	from growie_app.api.price import _is_nse_exchange, _normalize_market_label

	if _is_nse_exchange(exchange_platform):
		return None

	raw = (exchange_platform or "").strip()
	if raw:
		key = raw.upper()
		if key in ("NSE", "KENYA_FUNDS", "PRIVATE"):
			return None
		return _EODDATA_EXCHANGE_MAP.get(key, raw)

	if _normalize_market_label(market) == "NSE":
		return None
	return "NASDAQ"


def _load_exchange_map(
	tickers: list[str],
	stock_meta: dict | None = None,
) -> dict[str, str]:
	uniq = list({(t or "").upper() for t in tickers if (t or "").strip()})
	if not uniq:
		return {}
	rows = frappe.get_all(
		"Growe Stock",
		filters={"ticker": ["in", uniq]},
		fields=["ticker", "exchange_platform", "api_symbol"],
	)
	out: dict[str, str] = {}
	for row in rows:
		t = (row.ticker or "").upper()
		ex = (row.get("exchange_platform") or "").strip()
		if t and ex:
			out[t] = ex
	if stock_meta:
		for ticker, meta in stock_meta.items():
			t = (ticker or "").upper().strip()
			if not t or t not in uniq or t in out:
				continue
			ex = ((meta or {}).get("exchange_platform") or "").strip()
			if ex:
				out[t] = ex
	return out


def _symbol_for_ticker(ticker: str, symbol_override_map: dict | None) -> str:
	tu = (ticker or "").upper().strip()
	override = (symbol_override_map or {}).get(tu) or ""
	override = override.strip()
	if override:
		if ":" in override:
			return override.split(":", 1)[1].strip().upper()
		return override.upper()
	return tu


def _group_by_exchange(
	symbols: list[str],
	exchange_by_ticker: dict[str, str],
	market: str,
) -> dict[str, list[str]]:
	groups: dict[str, list[str]] = {}
	for symbol in symbols:
		tu = (symbol or "").upper().strip()
		if not tu:
			continue
		ex = eoddata_exchange(exchange_by_ticker.get(tu), market)
		if not ex:
			continue
		groups.setdefault(ex, []).append(tu)
	return groups


def _throttle(provider: dict) -> None:
	seconds = int(provider.get("refresh_rate_seconds") or 0)
	if seconds > 0:
		time.sleep(min(seconds, 10))
		return
	time.sleep(1.1)


def fetch_eoddata_prices(
	provider: dict,
	symbols: list,
	market: str = "Global",
	symbol_override_map: dict | None = None,
	stock_meta: dict | None = None,
) -> dict:
	"""Fetch EOD quotes via EODData REST API (ApiKey only, one request per symbol)."""
	from growie_app.api.price import _log_price_fetch_error, _normalize_market_label

	if _normalize_market_label(market) != "GLOBAL":
		return {}

	api_key = _provider_api_key(provider)
	if not api_key:
		frappe.logger("growie.price").warning(
			"EODData %s: set API Key (ApiKey from eoddata.com/myaccount/api.aspx).",
			provider.get("provider_name") or provider.get("name"),
		)
		return {}

	exchange_by_ticker = _load_exchange_map(symbols, stock_meta=stock_meta)
	groups = _group_by_exchange(symbols, exchange_by_ticker, market)
	results: dict = {}

	for exchange, tickers in groups.items():
		if provider.get("_rate_limited"):
			break
		for ticker in tickers:
			if provider.get("_rate_limited"):
				break
			sym = _symbol_for_ticker(ticker, symbol_override_map)
			try:
				quote = _fetch_quote_get(provider, api_key, exchange, sym)
				if quote:
					results[ticker] = quote
			except Exception as exc:
				_log_price_fetch_error("EODData", f"{exchange}:{sym}", exc)
			_throttle(provider)

	requested = {(s or "").upper().strip() for s in symbols if (s or "").strip()}
	skipped = len(requested) - len(results)
	if skipped and not provider.get("_rate_limited"):
		frappe.logger("growie.price").info(
			"EODData %s: %s/%s symbol(s) returned no quote (check exchange_platform on Growe Stock).",
			provider.get("provider_name") or provider.get("name"),
			skipped,
			len(requested),
		)

	return results
