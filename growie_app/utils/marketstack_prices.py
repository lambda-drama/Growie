"""
Marketstack (APILayer) — end-of-day stock prices.

Docs: https://docs.apilayer.com/marketstack/docs/marketstack-api-v2-v-2-0-0

Configure Growe Price API:
  - api_provider: Marketstack
  - api_key: access_key from https://marketstack.com/dashboard
  - api_base_url: https://api.marketstack.com/v2 (optional)
  - endpoint_prices: eod/latest (optional; default latest EOD per symbol)
  - use_us_ticker: when checked, send Growe Stock.us_ticker_number instead of ticker

Auth: access_key query param on every request.

Sends Growe Exchange Platform ISO Mic as ``exchange`` on every request.
Nairobi NSE (Kenya) maps to MIC XNAI — not the Indian NSE (XNSE).
"""

from __future__ import annotations

import re
import time

import frappe
import requests

_MARKETSTACK_DEFAULT_BASE = "https://api.marketstack.com/v2"
_EOD_LATEST_PATH = "eod/latest"
_BATCH_SIZE = 100

# Growe exchange_platform / exchange_code → Marketstack MIC
_MARKETSTACK_MIC = {
	"NYSE": "XNYS",
	"XNYS": "XNYS",
	"NASDAQ": "XNAS",
	"XNAS": "XNAS",
	"AMEX": "XASE",
	"XASE": "XASE",
	"AMS": "XAMS",
	"XAMS": "XAMS",
	"EPA": "XPAR",
	"PAR": "XPAR",
	"XPAR": "XPAR",
	"EURONEXT": "XPAR",
	"BRU": "XBRU",
	"XBRU": "XBRU",
	"LIS": "XLIS",
	"XLIS": "XLIS",
	"LSE": "XLON",
	"XLON": "XLON",
	"FRA": "XFRA",
	"XFRA": "XFRA",
	"XETRA": "XETR",
	"XETR": "XETR",
	"JSE": "XJSE",
	"XJSE": "XJSE",
	"TSX": "XTSE",
	"XTSE": "XTSE",
	"ASX": "XASX",
	"XASX": "XASX",
	"HKEX": "XHKG",
	"XHKG": "XHKG",
	"SGX": "XSES",
	"XSES": "XSES",
	"TSE": "XTKS",
	"XTKS": "XTKS",
	"NSE": "XNAI",
	"XNAI": "XNAI",
}

_MIC_CURRENCY = {
	"XNAS": "USD",
	"XNYS": "USD",
	"XASE": "USD",
	"IEXG": "USD",
	"XAMS": "EUR",
	"XPAR": "EUR",
	"XBRU": "EUR",
	"XLIS": "EUR",
	"XFRA": "EUR",
	"XETR": "EUR",
	"XLON": "GBP",
	"XNAI": "KES",
	"XJSE": "ZAR",
	"XTSE": "CAD",
	"XASX": "AUD",
	"XHKG": "HKD",
	"XSES": "SGD",
	"XTKS": "JPY",
	"XNSE": "INR",
}


def _provider_api_key(provider: dict) -> str:
	from growie_app.api.price import _price_api_key

	return _price_api_key(provider)


def _service_base(provider: dict) -> str:
	raw = (provider.get("api_base_url") or "").strip().rstrip("/")
	if not raw:
		return _MARKETSTACK_DEFAULT_BASE
	# Legacy v1 installs may still point at /v1 — prefer v2 for new rows.
	if raw.endswith("/v1"):
		return raw[:-2] + "v2"
	return raw


def _eod_path(provider: dict) -> str:
	raw = (provider.get("endpoint_prices") or "").strip().strip("/")
	if not raw or raw.lower() in ("eod", "eod/latest"):
		return _EOD_LATEST_PATH
	return raw.strip("/")


def _mark_marketstack_auth_failed(provider: dict, message: str) -> None:
	provider["_marketstack_auth_failed"] = 1
	frappe.logger("growie.price").warning(
		"Marketstack auth failed for %s: %s",
		provider.get("provider_name") or provider.get("name"),
		message[:200],
	)


def _mark_marketstack_rate_limited(provider: dict, message: str) -> None:
	from growie_app.api.price import _mark_provider_rate_limited

	_mark_provider_rate_limited(provider, "marketstack", message)


def marketstack_mic(exchange_platform: str | None, market: str = "Global") -> str | None:
	"""
	Resolve Marketstack ``exchange`` (ISO MIC) from Growe Stock.exchange_platform.

	Prefers Growe Exchange Platform.exchange_code (ISO Mic). Falls back to a
	known alias map, then 4-char MIC passthrough (platform docs are often named by MIC).
	"""
	from growie_app.api.price import _is_nse_exchange, _normalize_market_label

	raw = (exchange_platform or "").strip()
	if raw:
		key = raw.upper()
		if key in ("KENYA_FUNDS", "PRIVATE"):
			return None

		# Growe Exchange Platform is autonamed by ISO Mic (exchange_code).
		if frappe.db.exists("Growe Exchange Platform", raw):
			code = (
				frappe.db.get_value("Growe Exchange Platform", raw, "exchange_code") or ""
			).strip().upper()
			if code:
				return code

		if key in _MARKETSTACK_MIC:
			return _MARKETSTACK_MIC[key]
		# Already a MIC (e.g. XNAS) or unknown code — pass through uppercase.
		if len(key) == 4 and key.isalnum():
			return key

	if _is_nse_exchange(exchange_platform):
		return "XNAI"

	if raw:
		key = raw.upper()
		if key == "NSE":
			return "XNAI"
		return _MARKETSTACK_MIC.get(key, key)

	if _normalize_market_label(market) == "NSE":
		return "XNAI"
	return None


def _currency_for_row(row: dict, mic: str | None) -> str:
	# Marketstack v2 includes price_currency on EOD rows (e.g. EUR for ADYEN.AS).
	pc = (row.get("price_currency") or row.get("currency") or "").upper().strip()
	if len(pc) == 3 and pc.isalpha():
		return pc
	ex = (row.get("exchange") or row.get("exchange_code") or mic or "").upper()
	if ex in _MIC_CURRENCY:
		return _MIC_CURRENCY[ex]
	return "USD"


# Yahoo / Marketstack exchange suffixes kept as-is (e.g. ADYEN.AS, VOD.L).
# Only strip Alpha Vantage Nairobi ``.NR`` — that API wants bare ticker + XNAI.
_MARKETSTACK_STRIP_SUFFIXES = (".NR",)


def _marketstack_api_symbol(ticker: str, symbol_override_map: dict | None) -> str:
	"""
	Resolve the symbol sent to Marketstack.

	Prefer us_ticker_number / override when provided (e.g. ADYEN.AS). Plain ADYEN
	is often rejected for non-US listings; the dotted Yahoo form is what works.
	"""
	tu = (ticker or "").upper().strip()
	if not tu:
		return ""

	override = ((symbol_override_map or {}).get(tu) or "").strip()
	if override:
		if ":" in override:
			override = override.split(":", 1)[1].strip()
		sym = override.upper()
		for suffix in _MARKETSTACK_STRIP_SUFFIXES:
			if sym.endswith(suffix):
				sym = sym[: -len(suffix)]
				break
		return sym or tu
	return tu


def _map_response_to_internal(response_symbol: str, api_to_internal: dict[str, str]) -> str | None:
	"""
	Map Marketstack response symbol back to our ticker.

	Marketstack often returns the base symbol (ADYEN) even when requested as ADYEN.AS.
	"""
	sym = (response_symbol or "").upper().strip()
	if not sym:
		return None
	if sym in api_to_internal:
		return api_to_internal[sym]
	for req, internal in api_to_internal.items():
		req_u = (req or "").upper()
		if not req_u:
			continue
		if req_u == sym or req_u.startswith(sym + ".") or sym.startswith(req_u + "."):
			return internal
		if req_u.split(".", 1)[0] == sym:
			return internal
	return None


def _iter_eod_rows(body) -> list[dict]:
	"""Normalize Marketstack JSON into a flat list of EOD row dicts."""
	if isinstance(body, list):
		candidates = body
	elif isinstance(body, dict):
		candidates = body.get("data") or []
	else:
		return []

	rows: list[dict] = []
	for item in candidates:
		if isinstance(item, dict):
			rows.append(item)
		elif isinstance(item, list):
			for sub in item:
				if isinstance(sub, dict):
					rows.append(sub)
	return rows


def _marketstack_error_message(body) -> str:
	if not isinstance(body, dict):
		return ""
	err = body.get("error")
	if isinstance(err, dict):
		return str(err.get("message") or err.get("code") or err)
	if isinstance(err, list):
		parts = []
		for item in err:
			if isinstance(item, dict):
				parts.append(str(item.get("message") or item.get("code") or item))
			else:
				parts.append(str(item))
		return "; ".join(p for p in parts if p)
	if err:
		return str(err)
	return str(body.get("message") or "")


def _parse_eod_row(row: dict, mic: str | None) -> dict | None:
	if not isinstance(row, dict):
		return None

	try:
		close = float(row.get("adj_close") or row.get("close") or 0)
	except (TypeError, ValueError):
		close = 0.0
	if not close:
		return None

	try:
		open_p = float(row.get("adj_open") or row.get("open") or 0)
	except (TypeError, ValueError):
		open_p = 0.0

	if open_p:
		change_pct = round((close - open_p) / open_p * 100, 4)
	else:
		change_pct = 0.0

	return {
		"price": close,
		"change_percent": change_pct,
		"currency": _currency_for_row(row, mic),
	}


def _fetch_eod_latest_batch(
	provider: dict,
	api_key: str,
	symbols: list[str],
	mic: str | None,
) -> dict[str, dict]:
	if provider.get("_rate_limited") or provider.get("_marketstack_auth_failed"):
		return {}

	base = _service_base(provider)
	path = _eod_path(provider)
	url = f"{base}/{path}"
	params: dict = {
		"access_key": api_key,
		"symbols": ",".join(symbols),
		"limit": len(symbols),
	}
	if mic:
		params["exchange"] = mic

	resp = requests.get(url, params=params, timeout=30)

	if resp.status_code == 401:
		_mark_marketstack_auth_failed(provider, "Unauthorized — check your Marketstack access_key.")
		return {}
	if resp.status_code == 429:
		_mark_marketstack_rate_limited(provider, "Too many requests")
		return {}
	if not resp.ok:
		frappe.logger("growie.price").warning(
			"Marketstack %s HTTP %s: %s",
			path,
			resp.status_code,
			(resp.text or "")[:300],
		)
		return {}

	try:
		body = resp.json()
	except ValueError:
		return {}

	if not isinstance(body, dict):
		frappe.logger("growie.price").warning(
			"Marketstack %s: unexpected JSON type %s",
			path,
			type(body).__name__,
		)
		return {}

	if body.get("error"):
		msg = _marketstack_error_message(body)
		if msg and re.search(r"(?i)limit|quota|rate", msg):
			_mark_marketstack_rate_limited(provider, msg)
		else:
			frappe.logger("growie.price").warning("Marketstack error: %s", msg[:300])
		return {}

	out: dict[str, dict] = {}
	for row in _iter_eod_rows(body):
		sym = (row.get("symbol") or "").upper().strip()
		if not sym:
			continue
		parsed = _parse_eod_row(row, mic)
		if parsed:
			out[sym] = parsed
	return out


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
		fields=["ticker", "exchange_platform"],
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
	return _marketstack_api_symbol(ticker, symbol_override_map)


def _group_by_mic(
	symbols: list[str],
	exchange_by_ticker: dict[str, str],
	market: str,
) -> dict[str | None, list[str]]:
	"""Group internal tickers by Marketstack MIC (None = no exchange filter)."""
	from growie_app.api.price import _is_nse_exchange, _normalize_market_label

	market_norm = _normalize_market_label(market)
	groups: dict[str | None, list[str]] = {}

	for symbol in symbols:
		tu = (symbol or "").upper().strip()
		if not tu:
			continue
		ex_platform = exchange_by_ticker.get(tu)
		is_kenya = _is_nse_exchange(ex_platform)
		if market_norm == "NSE" and not is_kenya:
			continue
		if market_norm == "GLOBAL" and is_kenya:
			continue
		mic = marketstack_mic(ex_platform, market)
		groups.setdefault(mic, []).append(tu)
	return groups


def _throttle(provider: dict) -> None:
	# Marketstack: 5 requests/second on paid tiers; stay conservative.
	seconds = int(provider.get("refresh_rate_seconds") or 0)
	if seconds > 0:
		time.sleep(min(seconds, 5))
		return
	time.sleep(0.25)


def fetch_marketstack_prices(
	provider: dict,
	symbols: list,
	market: str = "Global",
	symbol_override_map: dict | None = None,
	stock_meta: dict | None = None,
) -> dict:
	"""Fetch latest EOD quotes via Marketstack (batch up to 100 symbols per request)."""
	from growie_app.api.price import _log_price_fetch_error

	api_key = _provider_api_key(provider)
	if not api_key:
		frappe.logger("growie.price").warning(
			"Marketstack %s: set API Key (access_key from marketstack.com/dashboard).",
			provider.get("provider_name") or provider.get("name"),
		)
		return {}

	exchange_by_ticker = _load_exchange_map(symbols, stock_meta=stock_meta)
	groups = _group_by_mic(symbols, exchange_by_ticker, market)
	results: dict = {}

	for mic, tickers in groups.items():
		if provider.get("_rate_limited"):
			break
		# Map internal ticker → API symbol for this MIC bucket.
		api_to_internal: dict[str, str] = {}
		for ticker in tickers:
			api_sym = _symbol_for_ticker(ticker, symbol_override_map)
			api_to_internal[api_sym] = ticker

		api_symbols = list(api_to_internal.keys())
		for i in range(0, len(api_symbols), _BATCH_SIZE):
			if provider.get("_rate_limited"):
				break
			chunk = api_symbols[i : i + _BATCH_SIZE]
			try:
				fetched = _fetch_eod_latest_batch(provider, api_key, chunk, mic)
				# Some plans reject MIC+symbol pairs; retry without exchange filter.
				if not fetched and mic:
					fetched = _fetch_eod_latest_batch(provider, api_key, chunk, None)
				for api_sym, quote in fetched.items():
					# Response may be base ticker (ADYEN) while we requested us_ticker (ADYEN.AS).
					internal = _map_response_to_internal(api_sym, api_to_internal)
					if not internal and len(chunk) == 1:
						internal = api_to_internal.get(chunk[0])
					if internal:
						results[internal] = quote
			except Exception as exc:
				_log_price_fetch_error("Marketstack", ",".join(chunk[:5]), exc)
			_throttle(provider)

	requested = {(s or "").upper().strip() for s in symbols if (s or "").strip()}
	skipped = len(requested) - len(results)
	if skipped and not provider.get("_rate_limited"):
		frappe.logger("growie.price").info(
			"Marketstack %s: %s/%s symbol(s) returned no quote (check exchange_platform / plan).",
			provider.get("provider_name") or provider.get("name"),
			skipped,
			len(requested),
		)

	return results
