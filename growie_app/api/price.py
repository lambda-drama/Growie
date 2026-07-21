"""
Price fetching service — Mansa Markets, FCS API, Finnhub, Alpha Vantage, RapidAPI (NSE).

Mansa Markets (mansaapi.com):
  Base: https://mansaapi.com/api/v1  (do not use www — it returns 402/HTML)
  Auth: Authorization: Bearer {mansa_live_sk_…}
  Bulk:   GET /markets/exchanges/NSE/stocks
  Single: GET /markets/exchanges/NSE/stocks/{ticker}
  History: GET /markets/exchanges/NSE/stocks/{ticker}/history?from=&to=
  Forex:  GET /markets/forex  (USD/KES pair)
  Response: {"success":true,"data":[{"ticker":"SCOM","price":33.45,"change_pct":1.52},…]}

FCS API (fcsapi.com):
  Base: https://api-v4.fcsapi.com
  Auth: ?access_key={key}
  Endpoint: GET /stock/latest?symbol=NSE:SCOM,NASDAQ:AAPL&access_key={key}
  Response: {"status":true,"response":[{"c":"19.50","ch":"-0.325","symbol":"SCOM","currency":"KES"}]}
  Fields: c=current price, ch=absolute change

Alpha Vantage (alphavantage.co):
  Base: https://www.alphavantage.co
  Auth: &apikey={key}
  Endpoint: GET /query?function=GLOBAL_QUOTE&symbol=AAPL&apikey={key}
  Response: {"Global Quote":{"01. symbol":"AAPL","05. price":"271.0600",
             "09. change":"-2.3700","10. change percent":"-0.8668%"}}
  NSE format: symbol=SCOM.NBO  (Nairobi Stock Exchange suffix on Alpha Vantage)
  Free tier: 25 req/day — fetches one symbol per call, use sparingly.

Finnhub (finnhub.io):
  Base: https://finnhub.io/api/v1
  Auth: ?token={api_key}
  Endpoint: GET /quote?symbol=AAPL&token={key}
  Response: {"c":261.74,"h","l","o","pc":259.48,"t"} — c=current, pc=previous close
  One HTTP request per symbol; free tier ~60 calls/minute — spaced requests.
  Symbols: Finnhub-native (e.g. AAPL); optional Growe Stock.api_symbol. Quote `c` is USD;
  Growe Price Cache stores the quote as price + currency (provider currency); conversions happen on read.

RapidAPI — Nairobi Stock Exchange (NSE only):
  Host: nairobi-stock-exchange-nse.p.rapidapi.com
  Auth: x-rapidapi-key, x-rapidapi-host headers (API key = RapidAPI key)
  Endpoint: GET /stocks?limit=1000
  Response: {"success":true,"data":[{"ticker":"SCOM","price":"28.75","change":"-0.50 (-1.71%)",...}]}

Goldman Sachs Marquee (developer.gs.com):
  Auth: OAuth2 client_credentials → https://idfs.gs.com/as/token.oauth2
        scope=read_product_data; API Key=client_id, API Secret=client_secret
  API:  POST https://api.gs.com/data/TREOD/last/query
  Body: {"endDate":"YYYY-MM-DD","where":{"ticker":"AAPL"},"fields":["closePrice"]}
  Equities use TREOD (Thomson Reuters EOD); optional Growe Stock.api_symbol as bbid (e.g. AAPL UW).
  Secmaster fallback: GET /markets/securities?ticker=AAPL&isPrimary=true → assetId/bbid.

Twelve Data (twelvedata.com):
  Base: https://api.twelvedata.com
  Auth: ?apikey={key}
  Quote: GET /quote?symbol=AAPL&exchange=NASDAQ&apikey={key}
  Batch: GET /quote?symbol=AAPL,MSFT&exchange=NASDAQ (up to 120, same exchange)
         POST /batch?apikey={key} body {"q0":"/quote?symbol=AAPL&exchange=NASDAQ", ...}
  Uses Growe Stock exchange_platform as `exchange` (NSE, NYSE, NASDAQ, LSE, …).

EODData (eoddata.com):
  Base: https://api.eoddata.com
  Auth: ?ApiKey={api_key} on every request
  Quote: GET /Quote/Get/{exchangeCode}/{symbolCode}?ApiKey={key}
  Response JSON: { close, previous, change, currency, … }
  ApiKey from https://eoddata.com/myaccount/api.aspx
  Uses Growe Stock exchange_platform (NYSE, NASDAQ, LSE, …).
  Kenya (Nairobi NSE) tickers are skipped — EODData NSE is the Indian exchange.

Marketstack (marketstack.com / APILayer):
  Base: https://api.marketstack.com/v2
  Auth: ?access_key={key}
  Latest EOD: GET /eod/latest?symbols=AAPL,MSFT&exchange=XNAS&access_key={key}
  Historical: GET /eod?symbols=AAPL&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&access_key={key}
  Response: {"data":[{"symbol":"AAPL","close":…,"exchange":"XNAS",…}]}
  Batch up to 100 symbols per request; optional exchange MIC filter.
  Global only — Kenya/NSE tickers are never sent (use RapidAPI/Mansa/etc.).
  Uses Growe Stock exchange_platform → MIC (XNYS, XNAS, XAMS, XPAR, …).

Mansa Markets historical:
  GET /markets/exchanges/NSE/stocks/{ticker}/history?from=YYYY-MM-DD&to=YYYY-MM-DD
  Daily OHLCV; stored sparsely into Growe Price Cache → Growe Historical Price
  using Growe Settings.monthly_interval_historical (dates per month).

Dispatch is determined by the "api_provider" Select field on the Growe Price API record.
"""

import re
from urllib.parse import urlparse

import frappe
from frappe import _
from frappe.exceptions import ValidationError
from frappe.utils import now_datetime, today
import requests as _requests
import time


# ── KES/USD fallback rate ─────────────────────────────────────────────────────

_USD_TO_KES_DEFAULT = 130.0


def _redact_secrets_in_message(text: str) -> str:
	"""Strip API keys/tokens from vendor error text before logging (never show to users)."""
	if not text:
		return ""
	s = str(text)
	s = re.sub(r"(?i)(api\s*key\s*as\s*)[A-Za-z0-9]{6,}", r"\1***", s)
	s = re.sub(r"(?i)(apikey[=:\s]+)[A-Za-z0-9]{6,}", r"\1***", s)
	s = re.sub(r"(?i)(access[_\s]?key[=:\s]+)[A-Za-z0-9]{6,}", r"\1***", s)
	s = re.sub(r"(?i)(token[=:\s]+)[A-Za-z0-9]{6,}", r"\1***", s)
	return s


def _mark_provider_rate_limited(provider: dict, vendor: str, raw_message: str = ""):
	"""Skip this provider for the rest of the refresh run; log server-side only."""
	provider["_rate_limited"] = 1
	if vendor == "alpha vantage":
		provider["_alpha_rate_limited"] = 1
	safe = _redact_secrets_in_message(raw_message)
	frappe.logger("growie.price").warning(
		"%s rate limit or quota reached; trying next provider. %s",
		vendor,
		safe[:200] if safe else "",
	)


def _provider_is_rate_limited(provider: dict) -> bool:
	return bool(provider.get("_rate_limited") or provider.get("_alpha_rate_limited"))


def _begin_price_refresh_run() -> None:
	frappe.local.growie_price_refresh_warnings = []


def _note_price_refresh_warning(message: str) -> None:
	if not message:
		return
	warnings = getattr(frappe.local, "growie_price_refresh_warnings", None)
	if warnings is None:
		warnings = []
		frappe.local.growie_price_refresh_warnings = warnings
	if message not in warnings:
		warnings.append(message)


def _price_refresh_warnings() -> list[str]:
	return list(getattr(frappe.local, "growie_price_refresh_warnings", None) or [])


def _mark_provider_key_invalid(provider: dict, reason: str = "") -> None:
	provider["_key_invalid"] = True
	if reason:
		provider["_key_invalid_reason"] = reason[:500]
	label = provider.get("provider_name") or provider.get("name") or "Growe Price API"
	_note_price_refresh_warning(
		_("{0}: skipped — {1}").format(
			label,
			reason or _("API key unavailable."),
		)
	)
	frappe.logger("growie.price").info(
		"Skipping price provider %s: %s",
		label,
		reason or "no API key",
	)


def _provider_key_invalid(provider: dict) -> bool:
	return bool(provider.get("_key_invalid"))


def _provider_ready(provider: dict) -> bool:
	"""True when provider can be called (active key, not rate-limited)."""
	if _provider_is_rate_limited(provider) or _provider_key_invalid(provider):
		return False
	if "_api_key_resolved" in provider:
		return bool(provider["_api_key_resolved"])
	key = _price_api_key(provider)
	provider["_api_key_resolved"] = bool(key)
	return provider["_api_key_resolved"]


def _http_response_rate_limited(resp, provider: dict, vendor: str) -> bool:
	"""True when HTTP status indicates quota exhaustion; provider is skipped for this run."""
	if getattr(resp, "status_code", None) != 429:
		return False
	try:
		body = (resp.text or "")[:500]
	except Exception:
		body = ""
	_mark_provider_rate_limited(provider, vendor, body)
	return True


def _get_usd_to_kes() -> float:
	try:
		settings = frappe.get_single("Growe Settings")
		rate = getattr(settings, "usd_to_kes_rate", None)
		if rate and float(rate) > 0:
			return float(rate)
	except Exception:
		pass
	return _USD_TO_KES_DEFAULT


def _price_api_key(provider: dict) -> str:
	"""
	Resolve API key for Growe Price API. Password fields are omitted from get_value/get_all;
	load the document and read the secret via get_password.

	Decryption failures (e.g. site encryption key changed) are logged and skipped so other
	providers can still run — re-save the API key in Desk to fix the provider row.
	"""
	name = provider.get("name")
	if not name:
		return ""
	try:
		doc = frappe.get_doc("Growe Price API", name)
		try:
			key = doc.get_password("api_key", raise_exception=False)
		except ValidationError as exc:
			_mark_provider_key_invalid(provider, str(exc))
			return ""
		if key:
			return str(key).strip()
		has_stored = bool(frappe.db.get_value("Growe Price API", name, "api_key"))
		_mark_provider_key_invalid(
			provider,
			_("API key is not set.")
			if not has_stored
			else _("Stored API key could not be decrypted."),
		)
		return ""
	except Exception as exc:
		_mark_provider_key_invalid(provider, str(exc))
		frappe.logger("growie.price").warning(
			"Growe Price API %s api_key unreadable: %s", name, exc
		)
		return ""


def _mansa_kes_usd_rate(provider: dict) -> float | None:
	"""Fetch live KES per USD from Mansa forex endpoint."""
	from growie_app.utils.mansa_prices import fetch_mansa_kes_per_usd

	return fetch_mansa_kes_per_usd(provider)


# ── Provider loader ───────────────────────────────────────────────────────────

def _provider_key(provider: dict) -> str:
	"""Normalized key from Growe Price API.api_provider select."""
	return str(provider.get("api_provider") or "").strip().lower()


def _provider_fetches_per_symbol(provider: dict) -> bool:
	"""True when the provider issues one HTTP request per symbol (not a batch quote API)."""
	return _provider_key(provider) in (
		"finnhub",
		"eoddata",
		"alpha vantage",
		"goldman sachs",
	)


def _is_rapidapi_nse_provider(provider: dict) -> bool:
	"""True for RapidAPI Nairobi NSE rows (by select, name, or host URL)."""
	if _provider_key(provider) == "rapidapi":
		return True
	pn = (provider.get("provider_name") or "").lower().replace(" ", "")
	if "rapidapi" in pn:
		return True
	base = (provider.get("api_base_url") or "").lower()
	return "nairobi-stock-exchange-nse" in base or "rapidapi.com" in base


# Which price-fetch buckets each provider may call (NSE = exchange_platform NSE only).
_PROVIDER_MARKETS: dict[str, frozenset] = {
	"rapidapi": frozenset({"NSE"}),
	"mansa markets": frozenset({"NSE"}),
	"fcs api": frozenset({"NSE", "GLOBAL"}),
	"twelve data": frozenset({"NSE", "GLOBAL"}),
	"marketstack": frozenset({"GLOBAL"}),
	"finnhub": frozenset({"GLOBAL"}),
	"eoddata": frozenset({"GLOBAL"}),
	"goldman sachs": frozenset({"GLOBAL"}),
	"alpha vantage": frozenset({"GLOBAL"}),
}

# NSE: RapidAPI first on every UI/desk refresh; then Mansa bulk; AV last (Global only).
_PROVIDER_FETCH_ORDER = {
	"rapidapi": -1,
	"mansa markets": 1,
	"fcs api": 2,
	"twelve data": 2,
	"marketstack": 2,
	"finnhub": 3,
	"eoddata": 3,
	"goldman sachs": 4,
	"alpha vantage": 9,
}


def _normalize_market_label(market: str) -> str:
	from growie_app.utils.market_labels import normalize_market_bucket

	return normalize_market_bucket(market)


def _provider_supports_market(provider: dict, market: str) -> bool:
	"""
	Whether this Growe Price API row may fetch quotes for the given market.
	NSE tickers never use Finnhub/Alpha Vantage even when market_type is Both.
	"""
	from growie_app.utils.market_labels import market_type_supports_bucket

	m = _normalize_market_label(market)
	if _is_rapidapi_nse_provider(provider):
		return m == "NSE"
	key = _provider_key(provider)
	allowed = _PROVIDER_MARKETS.get(key)
	if allowed is not None:
		return m in allowed
	return market_type_supports_bucket(provider.get("market_type"), m)

_RAPIDAPI_NSE_DEFAULT_HOST = "nairobi-stock-exchange-nse.p.rapidapi.com"


def _sort_providers_for_fetch(providers: list, market: str = "NSE") -> list:
	"""Order providers for a market; RapidAPI is always first for NSE refreshes."""

	def _rank(p: dict) -> tuple:
		if str(market).upper() == "NSE" and _is_rapidapi_nse_provider(p):
			return (-1, p.get("name") or "")
		return (_PROVIDER_FETCH_ORDER.get(_provider_key(p), 5), p.get("name") or "")

	return sorted(providers, key=_rank)


def _get_provider_by_name(provider_name: str) -> dict | None:
	"""Load one active Growe Price API row by document name."""
	if not provider_name or not frappe.db.exists("Growe Price API", provider_name):
		return None
	return frappe.db.get_value(
		"Growe Price API",
		provider_name,
		[
			"name", "provider_name", "api_provider", "market_type",
			"api_base_url", "api_key", "endpoint_prices", "calls_per_month", "is_active",
			"use_us_ticker",
		],
		as_dict=True,
	)


def _eligible_tickers_for_provider(
	provider: dict, nse_tickers: list, global_tickers: list
) -> list:
	"""Tickers this provider is allowed to refresh (NSE vs all other exchanges)."""
	out: list = []
	if _provider_supports_market(provider, "NSE"):
		out.extend(nse_tickers or [])
	if _provider_supports_market(provider, "GLOBAL"):
		out.extend(global_tickers or [])
	return list(dict.fromkeys((t or "").upper() for t in out if (t or "").strip()))


def _prices_from_cache_for_tickers(tickers: list) -> dict:
	prices: dict = {}
	for t in tickers:
		tu = (t or "").upper().strip()
		if not tu:
			continue
		kes = _price_kes_from_cache(tu)
		if kes:
			prices[tu] = kes
	return prices


def _get_providers(market_type: str, provider_name: str | None = None) -> list:
	"""
	Load active providers for a market. If provider_name is passed, return only that row
	(if active and market-compatible) so refresh can be forced to a specific provider.
	"""
	if provider_name:
		p = _get_provider_by_name(provider_name)
		if not p:
			frappe.throw(_(f"Provider '{provider_name}' not found."))
		if not int(p.get("is_active") or 0):
			frappe.throw(_(f"Provider '{provider_name}' is not active."))
		if not _provider_supports_market(p, market_type):
			return []
		return [p]

	providers = frappe.get_all(
		"Growe Price API",
		filters={"is_active": 1},
		fields=[
			"name", "provider_name", "api_provider", "market_type",
			"api_base_url", "api_key", "endpoint_prices", "calls_per_month",
			"use_us_ticker",
		],
		order_by="creation asc",
	)
	filtered = [p for p in providers if _provider_supports_market(p, market_type)]
	return _sort_providers_for_fetch(filtered, market_type)


# ── Mansa Markets ─────────────────────────────────────────────────────────────

def _fetch_mansa(provider: dict, symbols: list, market: str = "NSE") -> dict:
	from growie_app.utils.mansa_prices import fetch_mansa_prices

	return fetch_mansa_prices(provider, symbols, market)


# ── RapidAPI — Nairobi Stock Exchange (NSE only) ─────────────────────────────

def _rapidapi_nse_host(provider: dict) -> str:
	"""RapidAPI host from api_base_url or default Nairobi NSE host."""
	base = (provider.get("api_base_url") or "").strip().rstrip("/")
	if base:
		if base.startswith("http"):
			netloc = urlparse(base).netloc
			if netloc:
				return netloc
		return base.split("/")[0]
	return _RAPIDAPI_NSE_DEFAULT_HOST


def _parse_rapidapi_price(val) -> float:
	if val is None or val == "":
		return 0.0
	try:
		return float(str(val).replace(",", "").strip())
	except (TypeError, ValueError):
		return 0.0


def _parse_rapidapi_nse_change(change_str: str) -> float:
	"""Parse '+2.50 (+5.82%)' or '-0.50 (-1.71%)' → change percent."""
	if not change_str:
		return 0.0
	m = re.search(r"\(([+-]?\d+(?:\.\d+)?)%\)", str(change_str))
	if m:
		try:
			return float(m.group(1))
		except ValueError:
			return 0.0
	return 0.0


def _fetch_rapidapi_nse(provider: dict, symbols: list, market: str = "NSE") -> dict:
	"""
	Fetch NSE prices from RapidAPI Nairobi Stock Exchange (bulk GET /stocks).

	Growe Price API.api_key = x-rapidapi-key. api_base_url optional (defaults to Rapid host).
	"""
	if str(market).upper() != "NSE":
		return {}

	api_key = _price_api_key(provider)
	if not api_key:
		return {}

	host = _rapidapi_nse_host(provider)
	endpoint = (provider.get("endpoint_prices") or "/stocks").strip()
	if not endpoint.startswith("/"):
		endpoint = "/" + endpoint
	url = f"https://{host}{endpoint}"
	headers = {
		"x-rapidapi-key": api_key,
		"x-rapidapi-host": host,
		"Content-Type": "application/json",
		"Accept": "application/json",
	}

	wanted = {(s or "").upper().strip() for s in symbols if (s or "").strip()}
	results: dict = {}
	if not wanted:
		return results

	try:
		resp = _requests.get(url, headers=headers, params={"limit": 1000}, timeout=20)
		if _http_response_rate_limited(resp, provider, "rapidapi"):
			return results
		resp.raise_for_status()
		body = resp.json()

		if not body.get("success"):
			msg = str(body.get("message") or body.get("error") or "")
			if re.search(r"(?i)limit|quota|rate|too many", msg):
				_mark_provider_rate_limited(provider, "rapidapi", msg)
			else:
				frappe.logger("growie.price").warning(
					"RapidAPI NSE: %s", _redact_secrets_in_message(msg)[:300]
				)
			return results

		for item in body.get("data") or []:
			ticker = (item.get("ticker") or "").upper().strip()
			if not ticker or ticker not in wanted:
				continue
			price = _parse_rapidapi_price(item.get("price"))
			if price <= 0:
				continue
			results[ticker] = {
				"price": price,
				"change_percent": _parse_rapidapi_nse_change(item.get("change")),
				"currency": "KES",
			}

	except Exception as e:
		frappe.log_error(title="RapidAPI NSE price fetch error", message=str(e))

	return results


# ── FCS API ───────────────────────────────────────────────────────────────────

# FCS exchange prefixes for NSE stocks
_FCS_EXCHANGE_PREFIX = {
	"NSE": "NSE",
	"Global": "",  # global stocks: no prefix needed, FCS searches all exchanges
}

def _fcs_change_pct(c: float, ch: float) -> float:
	"""Compute change percent from current price and absolute change."""
	prev = c - ch
	if prev and prev != 0:
		return round(ch / prev * 100, 2)
	return 0.0


def _fcs_match_ticker_to_batch(raw_response_symbol: str, batch_requests: list) -> str | None:
	"""
	Map FCS response `symbol` to our tickers in this request batch.
	Handles SCOM vs NSE:SCOM, AAPL vs NASDAQ:AAPL, etc.
	"""
	raw = (raw_response_symbol or "").upper().strip()
	if not raw:
		return None
	base = raw.split(":")[-1] if ":" in raw else raw
	for want in batch_requests:
		wu = (want or "").upper()
		if not wu:
			continue
		if raw == wu or base == wu or raw.endswith(f":{wu}"):
			return wu
	return None


def _fetch_fcs(provider: dict, symbols: list, market: str = "Global") -> dict:
	"""
	Fetch prices from FCS API.
	Endpoint: GET /stock/latest?symbol=NSE:SCOM,NASDAQ:AAPL&access_key={key}
	Response: {"status": true, "response": [{"c":"19.50","ch":"-0.325","symbol":"SCOM","exchange":"NSE","currency":"KES"}]}
	"""
	base = provider["api_base_url"].rstrip("/")
	endpoint = provider.get("endpoint_prices") or "/stock/latest"
	url = f"{base}{endpoint}"
	access_key = _price_api_key(provider)
	results: dict = {}
	if not access_key:
		return results

	prefix = _FCS_EXCHANGE_PREFIX.get(market, "")

	# Build symbol list with optional exchange prefix
	sym_list = []
	for s in symbols:
		sym_list.append(f"{prefix}:{s.upper()}" if prefix else s.upper())

	# FCS allows up to 30 symbols per request; batch to be safe
	batch_size = 20
	for i in range(0, len(sym_list), batch_size):
		batch = sym_list[i : i + batch_size]
		batch_requests = [s.upper() for s in symbols[i : i + batch_size]]
		params = {
			"symbol": ",".join(batch),
			"access_key": access_key,
		}
		try:
			resp = _requests.get(url, params=params, timeout=15)
			if _http_response_rate_limited(resp, provider, "fcs api"):
				return results
			resp.raise_for_status()
			body = resp.json()

			if not body.get("status"):
				msg = str(body.get("msg") or body)
				if re.search(r"(?i)limit|quota|rate", msg):
					_mark_provider_rate_limited(provider, "fcs api", msg)
					return results
				frappe.log_error(
					title="FCS API error",
					message=_redact_secrets_in_message(f"status=false: {msg}"),
				)
				continue

			for item in body.get("response", []):
				raw_c = item.get("c", 0)
				raw_ch = item.get("ch", 0)
				c = float(raw_c or 0)
				ch = float(raw_ch or 0)
				raw_sym = (item.get("symbol") or "").upper()
				currency = (item.get("currency") or "USD").upper()
				change_pct = _fcs_change_pct(c, ch)

				# FCS may return "AAPL", "NASDAQ:AAPL", "SCOM" or "NSE:SCOM" — key cache by our ticker
				matched = _fcs_match_ticker_to_batch(raw_sym, batch_requests)
				if not c or not matched:
					continue
				results[matched] = {
					"price": c,
					"change_percent": change_pct,
					"currency": currency,
				}

		except Exception as e:
			frappe.log_error(title="FCS price fetch error", message=str(e))

	return results


# ── Alpha Vantage ─────────────────────────────────────────────────────────────
#
# Free tier: 25 requests/day (one symbol per call).
# NSE Kenya stocks use the ".NBO" suffix on Alpha Vantage, e.g. SCOM.NBO
# Global stocks use plain ticker, e.g. AAPL, MSFT, TSLA

# Alpha Vantage uses .NR for Nairobi Stock Exchange (NSE Kenya)
_AV_NSE_SUFFIX = ".NR"

def _fetch_alpha_vantage(
	provider: dict,
	symbols: list,
	market: str = "Global",
	symbol_override_map: dict | None = None,
) -> dict:
	"""
	symbol_override_map: optional {ticker → api_symbol} from Growe Stock.api_symbol.
	When provided, uses the stored api_symbol instead of guessing the suffix.
	"""
	"""
	Fetch prices one symbol at a time from Alpha Vantage GLOBAL_QUOTE.

	curl "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=KEY"
	→ {
	    "Global Quote": {
	      "01. symbol": "AAPL",
	      "05. price": "271.0600",
	      "09. change": "-2.3700",
	      "10. change percent": "-0.8668%"
	    }
	  }
	"""
	base = provider["api_base_url"].rstrip("/")
	endpoint = provider.get("endpoint_prices") or "/query"
	api_key = _price_api_key(provider)
	results: dict = {}

	for idx, symbol in enumerate(symbols):
		# Alpha free tier allows ~1 request/sec burst; enforce spacing.
		if idx > 0:
			time.sleep(1.05)

		# Prefer api_symbol from Growe Stock; fall back to suffix logic
		if symbol_override_map and symbol.upper() in symbol_override_map:
			av_symbol = symbol_override_map[symbol.upper()]
		elif market == "NSE":
			av_symbol = f"{symbol.upper()}{_AV_NSE_SUFFIX}"
		else:
			av_symbol = symbol.upper()

		params = {
			"function": "GLOBAL_QUOTE",
			"symbol": av_symbol,
			"apikey": api_key,
		}

		try:
			resp = _requests.get(f"{base}{endpoint}", params=params, timeout=10)
			if _http_response_rate_limited(resp, provider, "alpha vantage"):
				break
			resp.raise_for_status()
			body = resp.json()

			# Alpha Vantage returns "Information" or "Note" when rate-limited — skip quietly.
			if "Information" in body or "Note" in body:
				limit_msg = body.get("Information") or body.get("Note", "")
				_mark_provider_rate_limited(provider, "alpha vantage", limit_msg)
				break

			quote = body.get("Global Quote") or {}

			if not quote:
				frappe.logger("growie.price").debug(
					"Alpha Vantage: no quote for %s (%s)",
					av_symbol,
					_redact_secrets_in_message(str(body))[:300],
				)
				continue

			price_str    = quote.get("05. price", "0")
			change_str   = quote.get("09. change", "0")
			change_pct_str = quote.get("10. change percent", "0%")

			price      = float(price_str or 0)
			change_pct = float(change_pct_str.replace("%", "").strip() or 0)

			if not price:
				continue

			# Alpha Vantage prices for NSE stocks are already in KES; global = USD
			currency = "KES" if market == "NSE" else "USD"

			results[symbol.upper()] = {
				"price": price,
				"change_percent": change_pct,
				"currency": currency,
				"raw": {
					"symbol": quote.get("01. symbol"),
					"change": change_str,
					"latest_trading_day": quote.get("07. latest trading day"),
					"previous_close": quote.get("08. previous close"),
				},
			}

		except Exception as e:
			frappe.log_error(
				title=f"Alpha Vantage fetch error ({symbol})",
				message=str(e),
			)

	return results


# ── Finnhub ───────────────────────────────────────────────────────────────────
#
# Quote: GET /api/v1/quote?symbol=AAPL&token=KEY  →  { "c", "pc", "h", "l", "o", "t" }
# See https://finnhub.io/docs/api

_FINNHUB_DEFAULT_BASE = "https://finnhub.io/api/v1"


def _fetch_finnhub(
	provider: dict,
	symbols: list,
	market: str = "Global",
	symbol_override_map: dict | None = None,
) -> dict:
	"""
	Fetch prices via Finnhub quote (one symbol per request). Symbols match Finnhub's
	conventions (same string you pass to curl); optional Growe Stock.api_symbol remaps tickers.

	symbol_override_map: optional {internal ticker → Finnhub symbol} from Growe Stock.api_symbol.
	"""
	if _normalize_market_label(market) != "GLOBAL":
		return {}

	base = (provider.get("api_base_url") or "").strip().rstrip("/") or _FINNHUB_DEFAULT_BASE
	endpoint = (provider.get("endpoint_prices") or "/quote").strip()
	if not endpoint.startswith("/"):
		endpoint = "/" + endpoint
	token = _price_api_key(provider)
	
	symbol_override_map = symbol_override_map or {}
	results: dict = {}

	if not token:
		return {}

	url = f"{base}{endpoint}"

	for idx, symbol in enumerate(symbols):
		if idx > 0:
			time.sleep(1.05)

		sym_u = (symbol or "").upper().strip()
		if not sym_u:
			continue

		# Only use api_symbol when it looks like a Finnhub symbol (not NSE .NR suffixes).
		if sym_u in symbol_override_map and _normalize_market_label(market) == "GLOBAL":
			override = (symbol_override_map[sym_u] or "").strip()
			if override and not override.upper().endswith(".NR"):
				fh_symbol = override
			else:
				fh_symbol = sym_u
		else:
			fh_symbol = sym_u

		params = {"symbol": fh_symbol, "token": token}
		try:
			resp = _requests.get(url, params=params, timeout=12)
			if _http_response_rate_limited(resp, provider, "finnhub"):
				return results
			resp.raise_for_status()
			body = resp.json()

			if isinstance(body, dict) and body.get("error"):
				err = str(body.get("error") or "")
				if re.search(r"(?i)limit|quota|rate", err):
					_mark_provider_rate_limited(provider, "finnhub", err)
					return results
				frappe.log_error(
					title=f"Finnhub API error ({fh_symbol})",
					message=str(body.get("error")),
				)
				continue

			c = float(body.get("c") or 0)
			pc = float(body.get("pc") or 0)

			if not c:
				frappe.logger("growie.price").debug(
					"Finnhub: no price for %s (%s)", fh_symbol, body
				)
				continue

			if body.get("dp") is not None:
				change_pct = round(float(body.get("dp") or 0), 4)
			elif pc and pc != 0:
				change_pct = round((c - pc) / pc * 100, 4)
			else:
				change_pct = 0.0

			# Finnhub /quote has no currency field; `c` is USD — cache upsert derives KES via settings.
			results[sym_u] = {
				"price": c,
				"change_percent": change_pct,
				"currency": "USD",
			}

		except Exception as e:
			_log_price_fetch_error("Finnhub", fh_symbol, e)

	return results


# ── Generic dispatcher (uses api_provider field) ───────────────────────────────

def _fetch_from_provider(
	provider: dict,
	symbols: list,
	market: str = "NSE",
	symbol_override_map: dict | None = None,
	stock_meta: dict | None = None,
) -> dict:
	api_prov = _provider_key(provider)
	symbol_override_map = symbol_override_map or {}

	if _is_rapidapi_nse_provider(provider):
		return _fetch_rapidapi_nse(provider, symbols, market)
	if api_prov == "mansa markets":
		return _fetch_mansa(provider, symbols, market)
	if api_prov == "fcs api":
		return _fetch_fcs(provider, symbols, market)
	if api_prov == "twelve data":
		from growie_app.utils.twelve_data_prices import fetch_twelve_data_prices

		return fetch_twelve_data_prices(
			provider, symbols, market, symbol_override_map=symbol_override_map
		)
	if api_prov == "marketstack":
		from growie_app.utils.marketstack_prices import fetch_marketstack_prices

		return fetch_marketstack_prices(
			provider,
			symbols,
			market,
			symbol_override_map=symbol_override_map,
			stock_meta=stock_meta,
		)
	if api_prov == "finnhub":
		if _normalize_market_label(market) != "GLOBAL":
			return {}
		return _fetch_finnhub(provider, symbols, market, symbol_override_map=symbol_override_map)
	if api_prov == "eoddata":
		if _normalize_market_label(market) != "GLOBAL":
			return {}
		from growie_app.utils.eoddata_prices import fetch_eoddata_prices

		return fetch_eoddata_prices(
			provider,
			symbols,
			market,
			symbol_override_map=symbol_override_map,
			stock_meta=stock_meta,
		)
	if api_prov == "goldman sachs":
		if _normalize_market_label(market) != "GLOBAL":
			return {}
		from growie_app.utils.goldman_sachs_prices import fetch_goldman_sachs_prices

		return fetch_goldman_sachs_prices(
			provider, symbols, market, symbol_override_map=symbol_override_map
		)
	if api_prov == "alpha vantage":
		if str(market).upper() != "GLOBAL":
			return {}
		return _fetch_alpha_vantage(
			provider, symbols, market, symbol_override_map=symbol_override_map
		)

	# Unknown — skip with a warning
	frappe.log_error(
		title="Unknown price provider",
		message=(
			f"No parser for provider '{provider.get('provider_name')}' "
			f"(api_provider='{provider.get('api_provider')}'). "
			"Supported: Mansa Markets, RapidAPI, FCS API, Twelve Data, Marketstack, "
			"Finnhub, EODData, Goldman Sachs, Alpha Vantage."
		),
	)
	return {}


# ── Price cache upsert ────────────────────────────────────────────────────────

def _stock_row_for_ticker(ticker: str) -> dict | None:
	"""Growe Stock row for cache link + exchange_platform (prefer active)."""
	ticker_u = (ticker or "").upper().strip()
	if not ticker_u:
		return None
	rows = frappe.get_all(
		"Growe Stock",
		filters={"ticker": ticker_u},
		fields=["name", "exchange_platform", "is_active"],
		order_by="is_active desc, modified desc",
		limit=1,
	)
	return rows[0] if rows else None


def _apply_stock_link_to_cache(cache, ticker: str, stock_meta: dict | None = None) -> None:
	"""Link Growe Stock and exchange_platform on a price cache row."""
	ticker_u = (ticker or "").upper().strip()
	meta = (stock_meta or {}).get(ticker_u) if stock_meta else None
	if not meta:
		meta = _stock_row_for_ticker(ticker_u)
	# Repair invalid / legacy stock links (e.g. stock = ticker when name is TICKER-EXCH).
	if (not meta or not meta.get("name")) and cache.get("stock"):
		if frappe.db.exists("Growe Stock", cache.stock):
			return
		meta = _stock_row_for_ticker(ticker_u or (cache.ticker or ""))
	if not meta or not meta.get("name"):
		# Clear invalid link so save does not fail LinkValidationError.
		if cache.get("stock") and not frappe.db.exists("Growe Stock", cache.stock):
			cache.stock = None
		return

	cache.stock = meta["name"]
	if hasattr(cache, "set_fetch_from_values"):
		cache.set_fetch_from_values()
	if meta.get("exchange_platform"):
		cache.exchange_platform = meta["exchange_platform"]


def _stock_meta_for_tickers(tickers: list) -> dict[str, dict]:
	"""Map ticker → {name, exchange_platform, us_ticker_number, api_symbol} from Growe Stock."""
	uniq = list(dict.fromkeys((t or "").upper() for t in tickers if (t or "").strip()))
	if not uniq:
		return {}
	rows = frappe.get_all(
		"Growe Stock",
		filters={"ticker": ["in", uniq]},
		fields=[
			"name", "ticker", "exchange_platform", "is_active",
			"us_ticker_number", "api_symbol",
		],
		order_by="is_active desc, modified desc",
	)
	meta: dict[str, dict] = {}
	for row in rows:
		t = (row.ticker or "").upper()
		if t and t not in meta:
			meta[t] = {
				"name": row.name,
				"exchange_platform": row.get("exchange_platform"),
				"us_ticker_number": (row.get("us_ticker_number") or "").strip(),
				"api_symbol": (row.get("api_symbol") or "").strip(),
			}
	return meta


def _provider_uses_us_ticker(provider: dict | None) -> bool:
	"""True when Growe Price API Use US ticker is checked."""
	return bool(int((provider or {}).get("use_us_ticker") or 0))


def _cache_row_usable(row) -> bool:
	"""True when Growe Price Cache has a usable live price + currency."""
	if not row:
		return False
	# New schema: price + currency
	if float(row.get("price") or 0) > 0 and (row.get("currency") or "").strip():
		return True
	# Legacy fallback during migration
	return float(row.get("price_kes") or 0) > 0 or float(row.get("price_usd") or 0) > 0


_PRICE_CACHE_FIELDS = [
	"name",
	"ticker",
	"stock",
	"price",
	"currency",
	"change_percent",
	"market",
	"source",
	"fetched_at",
]


def _convert_price_amount(amount: float, from_ccy: str, to_ccy: str, on_date: str | None = None) -> float:
	"""Convert a unit/amount between currencies; missing FX → assume rate 1 (silent)."""
	from growie_app.api.portfolio import (
		_currency_exchange_db_rate,
		_erpnext_get_exchange_rate,
		_growe_usd_to_kes_fallback,
		kes_per_unit_foreign,
	)

	amount = float(amount or 0)
	if amount <= 0:
		return 0.0
	src = (from_ccy or "KES").upper().strip()
	dst = (to_ccy or "KES").upper().strip()
	if src == dst:
		return amount
	on_date = on_date or str(today())

	# 1) DB Currency Exchange (supports KES pairs when you maintain them)
	db = _currency_exchange_db_rate(src, dst, on_date)
	if db > 0:
		return amount * db
	db_inv = _currency_exchange_db_rate(dst, src, on_date)
	if db_inv > 0:
		return amount / db_inv

	# 2) ERPNext / Frankfurt direct (skipped automatically for KES pairs)
	direct = _erpnext_get_exchange_rate(src, dst, on_date)
	if direct > 0:
		return amount * direct
	inv = _erpnext_get_exchange_rate(dst, src, on_date)
	if inv > 0:
		return amount / inv

	# 3) Bridge via USD for non-KES pairs (e.g. EUR→KES via EURUSD × Growe USD→KES)
	if src != "USD" and dst != "USD":
		to_usd = _erpnext_get_exchange_rate(src, "USD", on_date) or _currency_exchange_db_rate(src, "USD", on_date)
		from_usd = _erpnext_get_exchange_rate("USD", dst, on_date) or _currency_exchange_db_rate("USD", dst, on_date)
		if to_usd > 0 and from_usd > 0:
			return amount * to_usd * from_usd
		# USD→KES via settings when dst is KES
		if dst == "KES" and to_usd > 0:
			return amount * to_usd * _growe_usd_to_kes_fallback()
		if src == "KES" and from_usd > 0:
			# KES → dst: convert via USD
			usd_amt = amount / _growe_usd_to_kes_fallback()
			return usd_amt * from_usd

	if dst == "KES":
		kpu = kes_per_unit_foreign(src, on_date, strict=False)
		# kes_per_unit_foreign returns 1.0 when missing — identity
		return amount * kpu
	if src == "KES":
		kpu = kes_per_unit_foreign(dst, on_date, strict=False)
		return amount / kpu if kpu > 0 else amount

	# Missing FX: fail silently, assume rate 1
	return amount


def _native_quote_from_cache_row(row: dict | None) -> tuple[float, str]:
	"""Return (price, currency) preferring new fields; fall back to legacy KES/USD columns."""
	if not row:
		return 0.0, ""
	price = float(row.get("price") or 0)
	ccy = (row.get("currency") or "").upper().strip()
	if price > 0 and ccy:
		return price, ccy
	pusd = float(row.get("price_usd") or 0)
	pkes = float(row.get("price_kes") or 0)
	if pusd > 0:
		return pusd, "USD"
	if pkes > 0:
		return pkes, "KES"
	return 0.0, ""


def _price_kes_from_cache(ticker: str = "", stock_name: str = "") -> float:
	row = _get_price_cache_row(ticker, stock_name=stock_name)
	price, ccy = _native_quote_from_cache_row(row)
	if price <= 0:
		return 0.0
	return _convert_price_amount(price, ccy, "KES")



def _get_price_cache_row(ticker: str = "", stock_name: str = "") -> dict | None:
	"""
	Load a usable Growe Price Cache row.

	Cache is now named by Growe Stock (autoname=field:stock). Still also match by
	ticker field for legacy rows / callers that only have a ticker.
	"""
	stock_name = (stock_name or "").strip()
	if stock_name:
		row = frappe.db.get_value(
			"Growe Price Cache",
			{"stock": stock_name},
			_PRICE_CACHE_FIELDS,
			as_dict=True,
		)
		if _cache_row_usable(row):
			return row
		# Doc named by stock
		if frappe.db.exists("Growe Price Cache", stock_name):
			row = frappe.db.get_value(
				"Growe Price Cache", stock_name, _PRICE_CACHE_FIELDS, as_dict=True
			)
			if _cache_row_usable(row):
				return row

	tu = (ticker or "").upper().strip()
	if not tu:
		return None
	row = frappe.db.get_value(
		"Growe Price Cache",
		{"ticker": tu},
		_PRICE_CACHE_FIELDS,
		as_dict=True,
	)
	if _cache_row_usable(row):
		return row
	# Legacy: doc name was ticker
	row = frappe.db.get_value(
		"Growe Price Cache",
		tu,
		_PRICE_CACHE_FIELDS,
		as_dict=True,
	)
	return row if _cache_row_usable(row) else None




def _resolve_stock_for_price(
	ticker: str = "",
	stock_name: str = "",
	us_ticker_number: str = "",
) -> dict | None:
	"""Return Growe Stock meta used for price routing + alternate cache lookups."""
	fields = [
		"name",
		"ticker",
		"exchange_platform",
		"us_ticker_number",
		"api_symbol",
		"currency",
		"market",
	]
	if stock_name and frappe.db.exists("Growe Stock", stock_name):
		row = frappe.db.get_value("Growe Stock", stock_name, fields, as_dict=True)
		if row:
			return row

	tu = (ticker or "").upper().strip()
	if tu:
		rows = frappe.get_all(
			"Growe Stock",
			filters={"ticker": tu},
			fields=fields,
			order_by="is_active desc, modified desc",
			limit=1,
		)
		if rows:
			return rows[0]

	us = (us_ticker_number or "").strip().upper()
	if us:
		rows = frappe.get_all(
			"Growe Stock",
			filters={"us_ticker_number": us},
			fields=fields,
			order_by="is_active desc, modified desc",
			limit=1,
		)
		if rows:
			return rows[0]
		# Some sheets store US ticker in api_symbol as well.
		rows = frappe.get_all(
			"Growe Stock",
			filters={"api_symbol": us},
			fields=fields,
			order_by="is_active desc, modified desc",
			limit=1,
		)
		if rows:
			return rows[0]
	return None


def _lookup_price_cache(
	ticker: str = "",
	stock_name: str = "",
	us_ticker_number: str = "",
) -> dict | None:
	"""
	Find a usable Growe Price Cache row for this instrument.

	Lookup order:
	  1. Cache keyed by ticker
	  2. Cache keyed by us_ticker_number / api_symbol
	  3. Cache linked to Growe Stock (stock = stock_name)
	  4. Growe Stock matched by us_ticker → that stock's ticker in cache
	"""
	stock = _resolve_stock_for_price(ticker, stock_name, us_ticker_number)
	primary = (ticker or (stock.ticker if stock else "") or "").upper().strip()
	us = (
		(us_ticker_number or "").strip().upper()
		or ((stock.us_ticker_number if stock else "") or "").strip().upper()
		or ((stock.api_symbol if stock else "") or "").strip().upper()
	)
	stock_link = stock_name or (stock.name if stock else "")

	candidates: list[str] = []
	for key in (primary, us):
		if key and key not in candidates:
			candidates.append(key)
	if stock_link:
		row = _get_price_cache_row(primary, stock_name=stock_link)
		if row:
			return row

	for key in candidates:
		row = _get_price_cache_row(key)
		if row:
			return row

	if us and not stock:
		alt = _resolve_stock_for_price(us_ticker_number=us)
		if alt and (alt.ticker or "").upper() != primary:
			row = _get_price_cache_row(alt.ticker, stock_name=alt.name)
			if row:
				return row
	return None


def ensure_live_price_for_ticker(
	ticker: str = "",
	stock_name: str = "",
	us_ticker_number: str = "",
	*,
	fetch_if_missing: bool = True,
) -> dict | None:
	"""
	Ensure Growe Price Cache has a live price for this ticker before saving a holding.

	1. Check cache by ticker, us_ticker_number, and Growe Stock link.
	2. If missing and fetch_if_missing: call active providers —
	   Kenya/NSE → Mansa (and other NSE providers), Global → Finnhub/Marketstack/etc.
	3. Returns {ticker, price_kes, price_usd, change_percent, source, fetched} or None.
	"""
	stock = _resolve_stock_for_price(ticker, stock_name, us_ticker_number)
	primary = (ticker or (stock.ticker if stock else "") or "").upper().strip()
	if not primary and not stock_name and not us_ticker_number:
		return None

	cached = _lookup_price_cache(primary, stock_name or (stock.name if stock else ""), us_ticker_number)
	if cached:
		price, ccy = _native_quote_from_cache_row(cached)
		price_kes = _convert_price_amount(price, ccy, "KES") if price > 0 else 0.0
		price_usd = _convert_price_amount(price, ccy, "USD") if price > 0 else 0.0
		return {
			"ticker": (cached.get("ticker") or primary).upper(),
			"price": price,
			"currency": ccy,
			"price_kes": price_kes,
			"price_usd": price_usd,
			"change_percent": float(cached.get("change_percent") or 0),
			"source": cached.get("source") or "",
			"fetched": False,
		}

	if not fetch_if_missing or not primary:
		return None

	exchange = (stock.exchange_platform if stock else None) or ""
	bucket = _price_fetch_bucket(exchange)
	# Internal fetch paths use "NSE" / "Global"; cache select stores Kenya / Global.
	market = "NSE" if bucket == "NSE" else "Global"

	sym_map: dict = {}
	us = (
		(us_ticker_number or "").strip()
		or ((stock.us_ticker_number if stock else "") or "").strip()
		or ((stock.api_symbol if stock else "") or "").strip()
	)
	if us:
		sym_map[primary] = us.upper()

	stock_meta = {
		primary: {
			"name": stock.name if stock else "",
			"exchange_platform": exchange,
			"us_ticker_number": us,
			"api_symbol": ((stock.api_symbol if stock else "") or "").strip(),
		}
	}

	try:
		prices = _fetch_and_store(
			market,
			[primary],
			sym_map=sym_map,
			stock_meta=stock_meta,
		)
	except Exception as exc:
		frappe.logger("growie.price").warning(
			"ensure_live_price_for_ticker(%s) failed: %s", primary, exc
		)
		frappe.log_error(
			title=f"Ensure live price failed ({primary})",
			message=frappe.get_traceback(),
		)
		return None

	if not prices:
		frappe.logger("growie.price").info(
			"ensure_live_price_for_ticker(%s): no quote from %s providers",
			primary,
			market,
		)
		return None

	row = _get_price_cache_row(primary)
	if not row:
		return None
	price, ccy = _native_quote_from_cache_row(row)
	return {
		"ticker": primary,
		"price": price,
		"currency": ccy,
		"price_kes": _convert_price_amount(price, ccy, "KES") if price > 0 else 0.0,
		"price_usd": _convert_price_amount(price, ccy, "USD") if price > 0 else 0.0,
		"change_percent": float(row.get("change_percent") or 0),
		"source": row.get("source") or "",
		"fetched": True,
	}


def price_in_holding_currency(
	ticker: str,
	currency: str,
	on_date: str = None,
	*,
	stock_name: str = "",
	us_ticker_number: str = "",
	fetch_if_missing: bool = False,
) -> float:
	"""Return unit price in the holding currency, optionally fetching if cache is empty."""
	cache = ensure_live_price_for_ticker(
		ticker,
		stock_name=stock_name,
		us_ticker_number=us_ticker_number,
		fetch_if_missing=fetch_if_missing,
	)
	if not cache:
		return 0.0
	src_price = float(cache.get("price") or 0)
	src_ccy = (cache.get("currency") or "").upper()
	if src_price <= 0 or not src_ccy:
		# Legacy alias keys
		ccy = (currency or "USD").upper()
		if ccy == "KES":
			return float(cache.get("price_kes") or 0)
		if ccy == "USD":
			return float(cache.get("price_usd") or 0)
		return 0.0
	return _convert_price_amount(src_price, src_ccy, currency or "USD", on_date)


def _symbol_map_for_provider(
	provider: dict | None,
	base_map: dict | None,
	tickers: list,
	stock_meta: dict | None = None,
) -> dict:
	"""
	Resolve per-ticker API symbols for a provider.

	If use_us_ticker is set (or provider is Marketstack): send Growe Stock
	us_ticker_number (e.g. ADYEN.AS). Otherwise keep api_symbol overrides from base_map.
	"""
	# Marketstack expects Yahoo-style us_ticker_number for non-US listings.
	force_us = _provider_key(provider or {}) == "marketstack"
	if not _provider_uses_us_ticker(provider) and not force_us:
		return dict(base_map or {})

	out: dict = {}
	uniq = list(dict.fromkeys((t or "").upper() for t in tickers if (t or "").strip()))
	if not uniq:
		return out

	meta = stock_meta or {}
	need_db: list[str] = []
	for t in uniq:
		row = meta.get(t) or {}
		us = (row.get("us_ticker_number") or "").strip()
		if us:
			out[t] = us.upper()
		elif t not in meta:
			need_db.append(t)

	if need_db:
		for s in frappe.get_all(
			"Growe Stock",
			filters={"ticker": ["in", need_db]},
			fields=["ticker", "us_ticker_number"],
		):
			t = (s.ticker or "").upper()
			us = (s.us_ticker_number or "").strip()
			if t and us:
				out[t] = us.upper()
	return out


def _backfill_price_cache_stock_links(tickers: list, stock_meta: dict | None = None) -> int:
	"""Fill missing Growe Stock / exchange_platform on existing cache rows."""
	updated = 0
	meta = stock_meta or _stock_meta_for_tickers(tickers)
	for ticker in tickers:
		tu = (ticker or "").upper().strip()
		stock_name = ((meta.get(tu) or {}).get("name") or "").strip()
		row = _get_price_cache_row(tu, stock_name=stock_name)
		if not tu or not row:
			continue
		cache = frappe.get_doc("Growe Price Cache", row["name"])
		if cache.stock and cache.get("exchange_platform"):
			continue
		before_stock = cache.stock
		before_ex = cache.get("exchange_platform")
		_apply_stock_link_to_cache(cache, tu, meta)
		if cache.stock != before_stock or cache.get("exchange_platform") != before_ex:
			cache.flags.ignore_permissions = True
			cache.save()
			updated += 1
	return updated


def _archive_previous_cache_price(cache) -> None:
	"""
	Push the current main price into Growe Historical Price before overwriting.

	One row per calendar date + currency (same-day refresh updates that day's row).
	"""
	from frappe.utils import getdate

	arch_price, arch_ccy = _native_quote_from_cache_row(
		{
			"price": cache.get("price"),
			"currency": cache.get("currency"),
			"price_kes": cache.get("price_kes"),
			"price_usd": cache.get("price_usd"),
		}
	)
	if arch_price <= 0 or not arch_ccy:
		return

	as_of = getdate(cache.get("fetched_at") or today())
	for row in cache.get("growe_historical_price") or []:
		if getdate(row.date) == as_of and (row.currency or "").upper() == arch_ccy:
			row.price = round(arch_price, 6)
			return

	cache.append(
		"growe_historical_price",
		{
			"date": as_of,
			"currency": arch_ccy,
			"price": round(arch_price, 6),
		},
	)


def _load_or_new_price_cache(ticker: str, stock_name: str = "", stock_meta: dict | None = None):
	"""Get existing Growe Price Cache by stock (preferred) or ticker; else new doc."""
	ticker = (ticker or "").upper().strip()
	meta = (stock_meta or {}).get(ticker) if stock_meta else None
	if not stock_name and meta:
		stock_name = (meta.get("name") or "").strip()
	if not stock_name:
		stock_row = _stock_row_for_ticker(ticker)
		stock_name = (stock_row.get("name") if stock_row else "") or ""

	# 1) Doc named by stock (current autoname)
	if stock_name and frappe.db.exists("Growe Price Cache", stock_name):
		return frappe.get_doc("Growe Price Cache", stock_name)

	# 2) Doc linked by stock field
	if stock_name:
		rows = frappe.get_all(
			"Growe Price Cache",
			filters={"stock": stock_name},
			fields=["name"],
			limit=1,
		)
		if rows:
			return frappe.get_doc("Growe Price Cache", rows[0].name)

	# 3) Legacy: doc named by / linked by ticker
	if ticker:
		rows = frappe.get_all(
			"Growe Price Cache",
			filters={"ticker": ticker},
			fields=["name", "stock"],
			limit=1,
		)
		if rows:
			return frappe.get_doc("Growe Price Cache", rows[0].name)
		if frappe.db.exists("Growe Price Cache", ticker):
			return frappe.get_doc("Growe Price Cache", ticker)

	cache = frappe.new_doc("Growe Price Cache")
	cache.ticker = ticker
	if stock_name:
		cache.stock = stock_name
	return cache


def _ensure_cache_named_by_stock(cache, stock_name: str) -> object:
	"""
	Price Cache autoname is field:stock. Rename legacy ticker-named rows once stock is known.
	Returns the (possibly renamed) document.
	"""
	stock_name = (stock_name or "").strip()
	if not stock_name or cache.is_new():
		if stock_name:
			cache.stock = stock_name
		return cache

	cache.stock = stock_name
	if cache.name == stock_name:
		return cache

	# Another doc already owns this stock name — keep updating that one and drop duplicate.
	if frappe.db.exists("Growe Price Cache", stock_name) and cache.name != stock_name:
		# Prefer keeping historical rows from the target; caller will re-load.
		return frappe.get_doc("Growe Price Cache", stock_name)

	old_name = cache.name
	cache.save()  # persist stock before rename
	frappe.rename_doc("Growe Price Cache", old_name, stock_name, force=True, merge=False)
	return frappe.get_doc("Growe Price Cache", stock_name)


def _upsert_cache(
	ticker: str,
	market: str,
	price_data: dict,
	usd_to_kes: float,
	source: str,
	stock_meta: dict | None = None,
):
	"""
	Upsert Growe Price Cache for a ticker/stock.

	Before overwriting the main price fields, archive the previous snapshot into
	the Growe Historical Price child table (date + currency + price).
	"""
	ticker = (ticker or "").upper().strip()
	if not ticker:
		return

	price = float(price_data["price"] or 0)
	currency = (price_data.get("currency") or "KES").upper()
	change_pct = float(price_data.get("change_percent", 0) or 0)
	if price <= 0:
		return

	stock_name = ""
	meta = (stock_meta or {}).get(ticker) if stock_meta else None
	if meta:
		stock_name = (meta.get("name") or "").strip()
	if not stock_name:
		stock_row = _stock_row_for_ticker(ticker)
		stock_name = (stock_row.get("name") if stock_row else "") or ""

	cache = _load_or_new_price_cache(ticker, stock_name=stock_name, stock_meta=stock_meta)
	_apply_stock_link_to_cache(cache, ticker, stock_meta)
	if stock_name:
		cache = _ensure_cache_named_by_stock(cache, stock_name)

	# Archive previous live quote before replacing (existing rows only).
	if not cache.is_new():
		_archive_previous_cache_price(cache)

	from growie_app.utils.market_labels import canonical_market_value

	# Store the provider quote as-is (flexible currency — no forced KES/USD columns).
	cache.ticker = ticker
	if stock_name:
		cache.stock = stock_name
	cache.market = canonical_market_value(market)
	cache.currency = currency
	cache.price = round(price, 6)
	cache.change_percent = change_pct
	cache.source = source
	cache.fetched_at = now_datetime()
	cache.flags.ignore_permissions = True
	if cache.is_new():
		cache.insert()
	else:
		cache.save()


# ── Holding value updater ─────────────────────────────────────────────────────

def _update_holdings_for_ticker(ticker: str, price_kes: float = 0.0):
	"""
	Revalue open holdings for a ticker after a price refresh.

	`current_price` / `current_value` are always in the holding's own currency.
	`price_kes` is unused; kept for call-site compatibility.
	"""
	holdings = frappe.get_all(
		"Growe Holding",
		filters={"ticker": ticker, "sold": 0, "quantity": [">", 0]},
		fields=["name"],
	)
	for h in holdings:
		doc = frappe.get_doc("Growe Holding", h.name)
		qty = float(doc.quantity or 0) or float(doc.share_breakdown or 0)
		if qty <= 0:
			continue
		ccy = (doc.currency or "USD").upper()
		# Live quotes always convert with today's FX — not purchase date_added.
		px = price_in_holding_currency(
			ticker,
			ccy,
			str(today()),
			stock_name=doc.asset_name or "",
			us_ticker_number=doc.us_ticker_number or "",
			fetch_if_missing=False,
		)
		if px <= 0:
			continue
		doc.current_price = px
		doc.current_value = round(qty * px, 6)
		doc.last_updated = now_datetime()
		doc.flags.ignore_permissions = True
		doc.save()


# ── Ticker ordering & cache completeness (Markets + multi-provider refresh) ───

def _holding_is_stock_or_etf(asset_class: str | None, asset_name: str | None) -> bool:
	"""True when a holding is a stock or ETF (not cash, bonds, funds, etc.)."""
	from growie_app.utils.market_labels import ETF, is_global_market, is_kenya_market

	ac = (asset_class or "").strip()
	if is_kenya_market(ac) or is_global_market(ac) or ac == ETF or ac == "NSE":
		return True
	if asset_name and frappe.db.exists("Growe Stock", asset_name):
		market = frappe.db.get_value("Growe Stock", asset_name, "market") or ""
		return is_kenya_market(market) or is_global_market(market) or market == ETF
	return False


def _holding_ticker_set() -> set[str]:
	"""Uppercase tickers from open stock/ETF holdings (for fetch priority)."""
	rows = frappe.get_all(
		"Growe Holding",
		filters={"sold": 0, "quantity": [">", 0]},
		fields=["ticker", "asset_class", "asset_name"],
	)
	out: set[str] = set()
	for r in rows:
		if not _holding_is_stock_or_etf(r.get("asset_class"), r.get("asset_name")):
			continue
		t = (r.ticker or "").upper().strip()
		if t:
			out.add(t)
	return out


def _sort_tickers_holdings_first(tickers: list) -> list:
	"""Stable order: portfolio tickers first, then the rest (alphabetical)."""
	held = _holding_ticker_set()
	uniq = list(dict.fromkeys((t or "").upper() for t in tickers if (t or "").strip()))
	return sorted(uniq, key=lambda t: (0 if t in held else 1, t))


def _ticker_cache_incomplete(ticker: str) -> bool:
	"""True if cache row is missing, has no usable price, or change_percent is NULL."""
	if not ticker:
		return True
	row = frappe.db.get_value(
		"Growe Price Cache",
		{"ticker": ticker},
		["price", "currency", "change_percent"],
		as_dict=True,
	)
	if not row:
		row = frappe.db.get_value(
			"Growe Price Cache",
			{"ticker": (ticker or "").upper()},
			["price", "currency", "change_percent"],
			as_dict=True,
		)
	if not row:
		return True
	price, ccy = _native_quote_from_cache_row(row)
	if price <= 0 or not ccy:
		return True
	if row.get("change_percent") is None:
		return True
	return False


def _cache_dict_is_complete_quote(cache: dict) -> bool:
	"""Markets API: include a stock only when cache has price + non-null change %."""
	if not cache:
		return False
	price, ccy = _native_quote_from_cache_row(cache)
	if price <= 0 or not ccy:
		return False
	return cache.get("change_percent") is not None


# ── Core orchestrator ─────────────────────────────────────────────────────────

def _provider_uses_alpha_vantage(provider: dict) -> bool:
	"""True only when api_provider select is exactly 'Alpha Vantage'."""
	
	return _provider_key(provider) == "alpha vantage"


def _api_symbol_maps_for_tickers(nse: list, global_: list) -> tuple[dict, dict]:
	"""
	Load Growe Stock api_symbol overrides per market.
	Global map → Finnhub / Alpha Vantage. NSE map → Alpha Vantage only (not passed to Finnhub).
	"""
	nse_map: dict = {}
	gmap: dict = {}
	uniq = {(t or "").upper() for t in (nse or []) + (global_ or []) if (t or "").strip()}
	if not uniq:
		return nse_map, gmap
	for s in frappe.get_all(
		"Growe Stock",
		filters={"ticker": ["in", list(uniq)]},
		fields=["ticker", "api_symbol", "exchange_platform"],
	):
		t = (s.ticker or "").upper()
		if not s.api_symbol:
			continue
		m = _price_fetch_bucket(s.exchange_platform)
		if m == "GLOBAL":
			gmap[t] = s.api_symbol
		else:
			# AV NSE suffixes (SCOM.NR) — only used when Alpha Vantage runs on NSE path
			nse_map[t] = s.api_symbol
	return nse_map, gmap


def _fetch_and_store(
	market: str,
	tickers: list,
	sym_map: dict | None = None,
	provider_name: str | None = None,
	stock_meta: dict | None = None,
) -> dict:
	if not tickers:
		return {}

	providers = _get_providers(market, provider_name=provider_name)
	remaining = list(
		dict.fromkeys((t or "").upper() for t in tickers if (t or "").strip())
	)

	prices: dict = {}
	if not providers:
		return prices

	usd_to_kes = _get_usd_to_kes()
	sym_map = sym_map or {}
	stock_meta = stock_meta or _stock_meta_for_tickers(tickers)

	for provider in providers:

		if not remaining:
			break
		if not _provider_ready(provider):
			continue

		# Try to get live KES rate from Mansa forex endpoint
		api_prov = (provider.get("api_provider") or "").lower()
		if "mansa" in api_prov or "mansa" in (provider.get("provider_name") or "").lower():
			live_rate = _mansa_kes_usd_rate(provider)
			if live_rate:
				usd_to_kes = live_rate
		eff_map = _symbol_map_for_provider(provider, sym_map, remaining, stock_meta)
		if _provider_uses_alpha_vantage(provider):
			fetched = _fetch_alpha_vantage(
				provider, remaining, market, symbol_override_map=eff_map
			)
		else:
			fetched = _fetch_from_provider(
				provider,
				remaining,
				market,
				symbol_override_map=eff_map,
				stock_meta=stock_meta,
			)

		for ticker, data in fetched.items():
			tu = (ticker or "").upper()
			if tu not in remaining:
				continue
			_upsert_cache(
				tu, market, data, usd_to_kes, provider["provider_name"], stock_meta=stock_meta
			)
			currency = (data.get("currency") or "KES").upper()
			price_kes = data["price"] if currency == "KES" else data["price"] * usd_to_kes
			prices[tu] = price_kes
			remaining.remove(tu)

	# One ticker at a time if batch did not return some symbols
	if remaining and providers:
		for provider in providers:
			if not remaining:
				break
			if not _provider_ready(provider):
				continue
			api_prov = (provider.get("api_provider") or "").lower()
			if "mansa" in api_prov or "mansa" in (provider.get("provider_name") or "").lower():
				live_rate = _mansa_kes_usd_rate(provider)
				if live_rate:
					usd_to_kes = live_rate
			for alone in list(remaining):
				eff_map = _symbol_map_for_provider(provider, sym_map, [alone], stock_meta)
				if _provider_uses_alpha_vantage(provider):
					fetched = _fetch_alpha_vantage(
						provider, [alone], market, symbol_override_map=eff_map
					)
				else:
					fetched = _fetch_from_provider(
						provider,
						[alone],
						market,
						symbol_override_map=eff_map,
						stock_meta=stock_meta,
					)
				for ticker, data in fetched.items():
					tu = (ticker or "").upper()
					if tu not in remaining:
						continue
					_upsert_cache(
						tu, market, data, usd_to_kes, provider["provider_name"], stock_meta=stock_meta
					)
					currency = (data.get("currency") or "KES").upper()
					price_kes = data["price"] if currency == "KES" else data["price"] * usd_to_kes
					prices[tu] = price_kes
					remaining.remove(tu)

	return prices


# ── Background price refresh ──────────────────────────────────────────────────

PRICE_REFRESH_QUEUE = "long"
PRICE_REFRESH_TIMEOUT = 3600
REFRESH_FETCH_CHUNK = 30


def _publish_price_refresh_progress(
	notify_user: str | None,
	*,
	provider_name: str | None = None,
	market: str | None = None,
	done: int = 0,
	total: int = 0,
	last_ticker: str | None = None,
) -> None:
	if not notify_user:
		return
	from growie_app.utils.market_labels import market_ui_label

	frappe.publish_realtime(
		"growie_price_refresh_progress",
		{
			"provider_name": provider_name,
			"market": market_ui_label(market) if market else None,
			"done": done,
			"total": total,
			"last_ticker": last_ticker,
		},
		user=notify_user,
	)


def _log_price_fetch_error(provider_label: str, symbol: str, exc: Exception) -> None:
	msg = str(exc)
	if "timed out" in msg.lower() or "timeout" in msg.lower():
		frappe.logger("growie.price").warning(
			"%s fetch timeout (%s): %s", provider_label, symbol, msg
		)
		return
	frappe.log_error(title=f"{provider_label} fetch error ({symbol})", message=msg)


def _enqueue_price_refresh(method: str, job_id: str, **kwargs) -> None:
	frappe.enqueue(
		method=method,
		queue=PRICE_REFRESH_QUEUE,
		timeout=PRICE_REFRESH_TIMEOUT,
		job_id=job_id,
		deduplicate=True,
		enqueue_after_commit=True,
		**kwargs,
	)


def _execute_refresh_prices(
	provider_name: str = None,
	show_user_messages: bool = False,
	notify_user: str | None = None,
) -> dict:
	"""
	Fetch fresh prices for stock/ETF tickers that appear in open Growe Holdings
	(not the full stock master). Upserts Growe Price Cache and recomputes holding values.

	If provider_name is passed (e.g. Growe Price API name from Desk), only that row is used.
	Otherwise all active providers for each market run in sequence.
	"""
	_begin_price_refresh_run()
	nse_tickers, global_tickers, nse_map, global_map, stock_meta = _collect_tickers_for_live_prices()
	nse_tickers = _sort_tickers_holdings_first(nse_tickers)
	global_tickers = _sort_tickers_holdings_first(global_tickers)
	all_tickers = list(dict.fromkeys((nse_tickers or []) + (global_tickers or [])))
	progress_total = len(all_tickers)
	progress_done = 0

	eligible: list = []
	if provider_name:
		p = _get_provider_by_name(provider_name)
		if not p:
			frappe.throw(_(f"Provider '{provider_name}' not found."))
		if not int(p.get("is_active") or 0):
			frappe.throw(_(f"Provider '{provider_name}' is not active."))

		eligible = _eligible_tickers_for_provider(p, nse_tickers, global_tickers)
		prov = [p]
		all_prices = {}
		nse_updated_count = 0
		global_updated_count = 0

		if _provider_supports_market(p, "NSE") and nse_tickers:
			nse_updated_count = _fetch_market_for_refresh(
				"NSE",
				nse_tickers,
				nse_map,
				providers=prov,
				stock_meta=stock_meta,
				notify_user=notify_user,
				provider_name=provider_name,
				progress_total=progress_total,
				progress_done=progress_done,
			)
			progress_done += nse_updated_count
			all_prices.update(_prices_from_cache_for_tickers(nse_tickers))
		if _provider_supports_market(p, "GLOBAL") and global_tickers:
			global_updated_count = _fetch_market_for_refresh(
				"Global",
				global_tickers,
				global_map,
				providers=prov,
				stock_meta=stock_meta,
				notify_user=notify_user,
				provider_name=provider_name,
				progress_total=progress_total,
				progress_done=progress_done,
			)
			all_prices.update(_prices_from_cache_for_tickers(global_tickers))

		if not eligible and (nse_tickers or global_tickers):
			warning = _(
				"{0} cannot refresh your tickers: you have {1} NSE and {2} Global symbol(s), "
				"but this provider only supports {3}. Use RapidAPI or Mansa for NSE, "
				"Finnhub or Alpha Vantage for Global, or run Refresh without picking one provider."
			).format(
				p.get("provider_name") or provider_name,
				len(nse_tickers),
				len(global_tickers),
				"NSE"
				if _is_rapidapi_nse_provider(p) or _provider_key(p) == "mansa markets"
				else "Global"
				if _provider_key(p) in ("finnhub", "alpha vantage")
				else "NSE and Global (FCS)",
			)
			if show_user_messages:
				frappe.msgprint(warning, alert=True, indicator="orange")
			else:
				frappe.logger("growie.price").warning(warning)
		elif (
			_provider_key(p) == "finnhub"
			and not global_tickers
			and nse_tickers
		):
			warning = _(
				"Finnhub only refreshes tickers whose Exchange platform is not NSE "
				"({0} symbol(s) are on NSE — use RapidAPI/Mansa for those). "
				"Set exchange on US/global Growe Stock rows (e.g. NYSE, NASDAQ), then refresh again."
			).format(len(nse_tickers))
			if show_user_messages:
				frappe.msgprint(warning, alert=True, indicator="orange")
			else:
				frappe.logger("growie.price").warning(warning)
	else:
		nse_updated_count = _fetch_market_for_refresh(
			"NSE",
			nse_tickers,
			nse_map,
			stock_meta=stock_meta,
			notify_user=notify_user,
			provider_name=provider_name,
			progress_total=progress_total,
			progress_done=progress_done,
		)
		progress_done += nse_updated_count
		global_updated_count = _fetch_market_for_refresh(
			"Global",
			global_tickers,
			global_map,
			stock_meta=stock_meta,
			notify_user=notify_user,
			provider_name=provider_name,
			progress_total=progress_total,
			progress_done=progress_done,
		)
		all_prices = {}
		for t in set(nse_tickers) | set(global_tickers):
			kes = _price_kes_from_cache(t)
			if kes:
				all_prices[t] = kes
		eligible = list(dict.fromkeys((nse_tickers or []) + (global_tickers or [])))

	for t in set(nse_tickers) | set(global_tickers):
		kes = _price_kes_from_cache(t)
		if kes:
			_update_holdings_for_ticker(t, kes)

	_backfill_price_cache_stock_links(all_tickers, stock_meta)

	frappe.db.commit()

	if not all_prices and eligible:
		hint = _(
			"No live prices were saved for the tickers this run can fetch. "
			"Check API key, RapidAPI quota, and Error Log. "
			"NSE tickers: {0}, Global tickers: {1}."
		).format(len(nse_tickers), len(global_tickers))
		if provider_name:
			p = _get_provider_by_name(provider_name) or {}
			if _is_rapidapi_nse_provider(p):
				hint = _(
					"RapidAPI returned no NSE prices (quota, key, or ticker mismatch). "
					"Global tickers ({0}) are skipped for this provider — use Finnhub/Mansa for those. "
					"NSE tickers requested: {1}."
				).format(len(global_tickers), len(nse_tickers))
		if show_user_messages:
			frappe.msgprint(hint, alert=True, indicator="orange")
		else:
			frappe.logger("growie.price").warning(hint)

	eligible_count = len(eligible) if provider_name else progress_total
	return {
		"nse_updated": nse_updated_count,
		"global_updated": global_updated_count,
		"prices": all_prices,
		"success": True,
		"provider_name": provider_name,
		"tickers_requested": progress_total,
		"tickers_eligible": eligible_count,
		"warnings": _price_refresh_warnings(),
	}


def _run_refresh_prices(provider_name: str = None, notify_user: str = None) -> dict:
	"""Background worker for refresh_prices."""
	if notify_user:
		frappe.set_user(notify_user)
	try:
		result = _execute_refresh_prices(
			provider_name=provider_name,
			notify_user=notify_user,
		)
		frappe.logger("growie.price").info(
			"Price refresh complete (provider=%s): NSE=%s Global=%s",
			provider_name or "all",
			result.get("nse_updated"),
			result.get("global_updated"),
		)
		if notify_user:
			frappe.publish_realtime(
				"growie_price_refresh_done",
				{**result, "success": True, "provider_name": provider_name},
				user=notify_user,
			)
		return result
	except Exception as exc:
		frappe.log_error(
			title=f"Price refresh job failed ({provider_name or 'all'})",
			message=frappe.get_traceback(),
		)
		if notify_user:
			frappe.publish_realtime(
				"growie_price_refresh_done",
				{
					"success": False,
					"error": str(exc),
					"provider_name": provider_name,
				},
				user=notify_user,
			)
		raise


def _execute_refresh_stock_prices() -> dict:
	_begin_price_refresh_run()
	nse_tickers, global_tickers, nse_map, gmap, stock_meta = _collect_tickers_for_live_prices()
	nse_tickers = _sort_tickers_holdings_first(nse_tickers)
	global_tickers = _sort_tickers_holdings_first(global_tickers)
	all_tickers = list(dict.fromkeys((nse_tickers or []) + (global_tickers or [])))

	nse_updated = _fetch_market_for_refresh(
		"NSE", nse_tickers, nse_map, stock_meta=stock_meta
	)
	global_updated = _fetch_market_for_refresh(
		"Global", global_tickers, gmap, stock_meta=stock_meta
	)
	for t in set(nse_tickers) | set(global_tickers):
		kes = _price_kes_from_cache(t)
		if kes:
			_update_holdings_for_ticker(t, kes)

	_backfill_price_cache_stock_links(all_tickers, stock_meta)

	frappe.db.commit()

	return {
		"nse_updated": nse_updated,
		"global_updated": global_updated,
		"total": nse_updated + global_updated,
		"warnings": _price_refresh_warnings(),
	}


def _run_refresh_stock_prices(notify_user: str = None) -> dict:
	"""Background worker for refresh_stock_prices."""
	if notify_user:
		frappe.set_user(notify_user)
	try:
		result = _execute_refresh_stock_prices()
		frappe.logger("growie.price").info(
			"Stock price refresh complete: NSE=%s Global=%s",
			result.get("nse_updated"),
			result.get("global_updated"),
		)
		if notify_user:
			frappe.publish_realtime(
				"growie_price_refresh_done",
				result,
				user=notify_user,
			)
		return result
	except Exception:
		frappe.log_error(
			title="Stock price refresh job failed",
			message=frappe.get_traceback(),
		)
		raise


# ── Public API endpoints ──────────────────────────────────────────────────────

@frappe.whitelist()
def refresh_prices(provider_name: str = None, sync: int = 0):
	"""
	Enqueue a background job to fetch fresh prices for open stock/ETF holdings only.

	Pass sync=1 to run inline (tests / debugging only).
	"""
	if provider_name:
		p = _get_provider_by_name(provider_name)
		if not p:
			frappe.throw(_(f"Provider '{provider_name}' not found."))
		if not int(p.get("is_active") or 0):
			frappe.throw(_(f"Provider '{provider_name}' is not active."))

	if int(sync or 0):
		return _execute_refresh_prices(
			provider_name=provider_name,
			show_user_messages=True,
			notify_user=frappe.session.user,
		)

	nse_tickers, global_tickers, _nse_map, _global_map, _stock_meta = _collect_tickers_for_live_prices()
	total_tickers = len(set(nse_tickers) | set(global_tickers))

	_enqueue_price_refresh(
		"growie_app.api.price._run_refresh_prices",
		f"growie_refresh_prices:{provider_name or 'all'}",
		provider_name=provider_name,
		notify_user=frappe.session.user,
	)
	return {
		"queued": True,
		"message": _(
			"Price refresh started in the background. Progress will appear on this form."
		),
		"provider_name": provider_name,
		"nse_tickers": len(nse_tickers),
		"global_tickers": len(global_tickers),
		"tickers_requested": total_tickers,
	}


@frappe.whitelist(allow_guest=True)
def get_price_cache():
	"""Return all cached prices."""
	return frappe.get_all(
		"Growe Price Cache",
		fields=["ticker", "stock", "market", "exchange_platform", "price", "currency", "change_percent", "source", "fetched_at"],
		order_by="market asc, ticker asc",
	)


@frappe.whitelist(allow_guest=True)
def get_market_indices():
	"""Return curated index tickers from the price cache."""
	index_tickers = ["NSE20", "NASI", "SP500", "FTSE100", "DAX", "BTC", "NGX"]
	return frappe.get_all(
		"Growe Price Cache",
		filters=[["ticker", "in", index_tickers]],
		fields=["ticker", "market", "price", "currency", "change_percent", "fetched_at"],
	)


@frappe.whitelist()
def test_provider(provider_name: str, test_ticker: str = "SCOM", market: str = None):
	"""
	Test a single Growe Price API provider with one ticker.
	Returns structured result so the Frappe form can display it.
	"""
	if not frappe.db.exists("Growe Price API", provider_name):
		frappe.throw(_(f"Provider '{provider_name}' not found."))

	provider = frappe.db.get_value(
		"Growe Price API",
		provider_name,
		["name", "provider_name", "api_provider", "market_type",
		 "api_base_url", "api_key", "endpoint_prices", "use_us_ticker"],
		as_dict=True,
	)

	ticker = (test_ticker or "AAPL").strip().upper()

	# Auto-detect NSE vs global from Growe Stock exchange_platform when not given.
	if not market:
		exchange = frappe.db.get_value("Growe Stock", {"ticker": ticker}, "exchange_platform")
		market = "Kenya" if _is_nse_exchange(exchange) else "Global"

	stock_meta = _stock_meta_for_tickers([ticker])
	sym_for_test = _symbol_map_for_provider(
		provider,
		{},
		[ticker],
		stock_meta=stock_meta,
	)
	# Fall back to api_symbol when not using US ticker and Stock has one.
	if not _provider_uses_us_ticker(provider):
		api_sym = (stock_meta.get(ticker) or {}).get("api_symbol") or ""
		if api_sym:
			sym_for_test[ticker] = api_sym

	try:
		results = _fetch_from_provider(
			dict(provider),
			[ticker],
			market,
			symbol_override_map=sym_for_test,
			stock_meta=stock_meta,
		)

	except Exception as e:
		_save_test_result(provider_name, f"ERROR: {e}")
		return {"success": False, "error": str(e)}

	if ticker in results:
		data = results[ticker]
		currency = (data.get("currency") or "KES").upper()
		price_raw = float(data["price"])
		change_pct = data.get("change_percent", 0)
		msg = (
			f"✅  {ticker}  {currency} {price_raw:,.6g}  "
			f"({'▲' if change_pct >= 0 else '▼'} {abs(change_pct):.2f}%)"
		)
		_save_test_result(provider_name, msg)
		return {
			"success": True,
			"ticker": ticker,
			"price": round(price_raw, 8),
			"currency": currency,
			"change_percent": change_pct,
			"message": msg,
		}
	else:
		msg = f"No data returned for {ticker} from {provider.provider_name}"
		_save_test_result(provider_name, msg)
		return {"success": False, "error": msg}


def _save_test_result(provider_name: str, message: str):
	"""Persist last test result on the Growe Price API record."""
	try:
		frappe.db.set_value(
			"Growe Price API",
			provider_name,
			{
				"last_test_result": message[:500],
				"last_test_at": now_datetime(),
			},
		)
		frappe.db.commit()
	except Exception:
		pass


@frappe.whitelist(allow_guest=True)
def get_stocks_with_prices(market: str = None, sector: str = None, limit: int = 500):
	"""
	Return active Growe Stock rows that have a **complete** cached quote: a positive
	price (KES or USD) and a non-null change_percent. Rows with missing/null cache
	data are omitted so the Markets page only lists instruments with live price + change.
	"""
	filters = {"is_active": 1, "verified": 1}
	if market:
		values = market_db_values(market)
		filters["market"] = values[0] if len(values) == 1 else ["in", values]
	if sector:
		filters["sector"] = sector

	stocks = frappe.get_all(
		"Growe Stock",
		filters=filters,
		fields=["name", "ticker", "company_name", "market", "sector", "currency", "api_symbol"],
		order_by="market asc, sector asc, ticker asc",
		limit=int(limit),
	)

	# Bulk-load all relevant cached prices (safe — table may not exist yet)
	tickers = [s.ticker for s in stocks if s.ticker]
	ticker_keys = set()
	for t in tickers:
		ticker_keys.add(t)
		ticker_keys.add((t or "").upper())
	price_map: dict = {}
	if tickers:
		try:
			cache_rows = frappe.get_all(
				"Growe Price Cache",
				filters=[["ticker", "in", list(ticker_keys)]],
				fields=["ticker", "price", "currency", "change_percent", "source", "fetched_at"],
			)
			for r in cache_rows:
				key = (r.ticker or "").upper()
				price_map[key] = r
		except Exception:
			pass  # Price Cache table may not exist yet; stocks will show without prices

	result = []
	for s in stocks:
		tk = (s.ticker or "").upper()
		cache = price_map.get(tk) or {}
		if not _cache_dict_is_complete_quote(cache):
			continue
		px, cache_ccy = _native_quote_from_cache_row(cache)
		price_kes = _convert_price_amount(px, cache_ccy, "KES") if px > 0 else 0.0
		price_usd = _convert_price_amount(px, cache_ccy, "USD") if px > 0 else 0.0
		result.append({
			"name":          s.name,
			"ticker":        s.ticker,
			"companyName":   s.company_name or s.ticker,
			"market":        s.market,
			"sector":        s.sector or "",
			"currency":      cache_ccy or s.currency or "KES",
			"apiSymbol":     s.api_symbol or "",
			"price":         px,
			"priceKES":      price_kes,
			"priceUSD":      price_usd,
			"changePercent": float(cache.get("change_percent") or 0),
			"source":        cache.get("source") or "",
			"fetchedAt":     str(cache.get("fetched_at") or ""),
			"hasPrice":      True,
			"hasCompleteQuote": True,
		})

	return result


def _is_nse_exchange(exchange_platform: str | None) -> bool:
	"""True when Growe Stock exchange_platform is Nairobi Securities Exchange."""
	raw = (exchange_platform or "").strip()
	if not raw:
		return False
	if raw.upper() in ("NSE", "KENYA_FUNDS"):
		return True
	if not frappe.db.exists("Growe Exchange Platform", raw):
		return False
	country = frappe.db.get_value("Growe Exchange Platform", raw, "country")
	if country == "Kenya":
		return True
	platform_name = (frappe.db.get_value("Growe Exchange Platform", raw, "platform_name") or "").upper()
	return platform_name == "NSE"


def _price_fetch_bucket(exchange_platform: str | None) -> str:
	"""
	NSE price APIs (RapidAPI, Mansa) only for exchange_platform = NSE.
	All other exchanges (NYSE, NASDAQ, LSE, …) use global providers (Finnhub, AV, …).
	"""
	return "NSE" if _is_nse_exchange(exchange_platform) else "GLOBAL"


def _collect_tickers_for_live_prices() -> tuple[list, list, dict, dict, dict]:
	"""
	Build NSE / Global ticker lists from open stock & ETF holdings only.

	Refresh prices never pulls the full Growe Stock master — only tickers that
	appear in open Growe Holding rows (sold=0, quantity>0) for stocks/ETFs.

	Returns stock_meta: {TICKER: {name, exchange_platform, us_ticker_number, api_symbol}}.
	"""
	nse: set = set()
	global_: set = set()
	nse_map: dict = {}
	global_map: dict = {}
	stock_meta: dict[str, dict] = {}

	holdings = frappe.get_all(
		"Growe Holding",
		filters={"sold": 0, "quantity": [">", 0]},
		fields=["ticker", "currency", "asset_class", "asset_name"],
	)

	tickers_needed: list[str] = []
	holding_by_ticker: dict[str, dict] = {}
	for h in holdings:
		if not _holding_is_stock_or_etf(h.get("asset_class"), h.get("asset_name")):
			continue
		t = (h.ticker or "").upper().strip()
		if not t:
			continue
		tickers_needed.append(t)
		holding_by_ticker.setdefault(t, h)

	tickers_needed = list(dict.fromkeys(tickers_needed))
	if not tickers_needed:
		return list(nse), list(global_), nse_map, global_map, stock_meta

	stock_rows = frappe.get_all(
		"Growe Stock",
		filters={"ticker": ["in", tickers_needed]},
		fields=[
			"name", "ticker", "api_symbol", "exchange_platform",
			"us_ticker_number", "is_active",
		],
		order_by="is_active desc, modified desc",
	)
	stock_by_ticker: dict[str, dict] = {}
	for s in stock_rows:
		t = (s.ticker or "").upper()
		if t and t not in stock_by_ticker:
			stock_by_ticker[t] = s

	for t in tickers_needed:
		s = stock_by_ticker.get(t)
		h = holding_by_ticker.get(t) or {}
		if s:
			stock_meta[t] = {
				"name": s.name,
				"exchange_platform": s.get("exchange_platform"),
				"us_ticker_number": (s.get("us_ticker_number") or "").strip(),
				"api_symbol": (s.get("api_symbol") or "").strip(),
			}
			bucket = _price_fetch_bucket(s.exchange_platform)
			if bucket == "NSE":
				nse.add(t)
				if s.api_symbol:
					nse_map[t] = s.api_symbol
			else:
				global_.add(t)
				if s.api_symbol:
					global_map[t] = s.api_symbol
		else:
			# Orphan held ticker: bucket by currency / asset_class.
			ac = (h.get("asset_class") or "").strip()
			from growie_app.utils.market_labels import is_kenya_market

			if is_kenya_market(ac) or (h.get("currency") or "USD").upper() == "KES":
				nse.add(t)
			else:
				# Global stocks and ETFs share the global provider path.
				global_.add(t)

	return list(nse), list(global_), nse_map, global_map, stock_meta


def _run_fetch_providers_round(
	market: str,
	remaining: list,
	sym_map: dict,
	providers: list,
	stock_meta: dict | None = None,
	notify_user: str | None = None,
	provider_name: str | None = None,
	progress_total: int = 0,
	progress_done: int = 0,
) -> set[str]:
	"""Mutates `remaining`; returns tickers upserted this round."""
	updated: set[str] = set()
	last_ticker: str | None = None

	for provider in providers:
		if not remaining:
			break
		if not _provider_ready(provider):
			continue

		while remaining:
			if not _provider_ready(provider):
				break
			count_before = len(updated)
			chunk = remaining[:REFRESH_FETCH_CHUNK]
			eff_map = _symbol_map_for_provider(provider, sym_map, chunk, stock_meta)

			if _provider_uses_alpha_vantage(provider):
				fetched = _fetch_alpha_vantage(
					provider, chunk, market, symbol_override_map=eff_map
				)
			else:
				fetched = _fetch_from_provider(
					provider,
					chunk,
					market,
					symbol_override_map=eff_map,
					stock_meta=stock_meta,
				)

			_usd = _get_usd_to_kes()
			for ticker, data in list(fetched.items()):
				tu = (ticker or "").upper()
				if tu not in remaining:
					continue
				_upsert_cache(
					tu, market, data, _usd, provider["provider_name"], stock_meta=stock_meta
				)
				updated.add(tu)
				remaining.remove(tu)
				last_ticker = tu

			if len(updated) == count_before and chunk and not _provider_fetches_per_symbol(provider):
				for lone in chunk:
					if lone not in remaining:
						continue
					lone_map = _symbol_map_for_provider(provider, sym_map, [lone], stock_meta)
					if _provider_uses_alpha_vantage(provider):
						fetched_one = _fetch_alpha_vantage(
							provider, [lone], market, symbol_override_map=lone_map
						)
					else:
						fetched_one = _fetch_from_provider(
							provider,
							[lone],
							market,
							symbol_override_map=lone_map,
							stock_meta=stock_meta,
						)
					for tk, data in list(fetched_one.items()):
						tu = (tk or "").upper()
						if tu in remaining:
							_upsert_cache(
								tu,
								market,
								data,
								_usd,
								provider["provider_name"],
								stock_meta=stock_meta,
							)
							updated.add(tu)
							remaining.remove(tu)
							last_ticker = tu

			if len(updated) > count_before:
				frappe.db.commit()
				_publish_price_refresh_progress(
					notify_user,
					provider_name=provider_name,
					market=market,
					done=progress_done + len(updated),
					total=progress_total,
					last_ticker=last_ticker,
				)
			elif chunk:
				if _provider_key_invalid(provider) or _provider_is_rate_limited(provider):
					break
				if _provider_fetches_per_symbol(provider):
					# Per-symbol APIs may 404 individual tickers; keep going.
					del remaining[: len(chunk)]
					continue
				break

	if remaining:
		for provider in providers:
			if not remaining:
				break
			if not _provider_ready(provider):
				continue
			for lone in list(remaining):
				lone_map = _symbol_map_for_provider(provider, sym_map, [lone], stock_meta)
				if _provider_uses_alpha_vantage(provider):
					fetched = _fetch_alpha_vantage(
						provider, [lone], market, symbol_override_map=lone_map
					)
				else:
					fetched = _fetch_from_provider(
						provider,
						[lone],
						market,
						symbol_override_map=lone_map,
						stock_meta=stock_meta,
					)
				_usd = _get_usd_to_kes()
				for tk, data in list(fetched.items()):
					tu = (tk or "").upper()
					if tu in remaining:
						_upsert_cache(
							tu,
							market,
							data,
							_usd,
							provider["provider_name"],
							stock_meta=stock_meta,
						)
						updated.add(tu)
						remaining.remove(tu)
						frappe.db.commit()
						_publish_price_refresh_progress(
							notify_user,
							provider_name=provider_name,
							market=market,
							done=progress_done + len(updated),
							total=progress_total,
							last_ticker=tu,
						)
	return updated


def _fetch_market_for_refresh(
	market: str,
	tickers: list,
	sym_map: dict,
	providers: list | None = None,
	stock_meta: dict | None = None,
	notify_user: str | None = None,
	provider_name: str | None = None,
	progress_total: int = 0,
	progress_done: int = 0,
) -> int:
	"""
	Fetch and upsert for one market. Each active provider runs in order (batch, then
	stragglers). A second pass retries every ticker that did not receive a fresh quote
	in the first pass (including rows that already had cache — refresh always overwrites
	when the API returns data). A third pass retries rows still missing a complete quote.

	providers: optional fixed list (Desk refresh using one Growe Price API row).

	Returns how many tickers received a fresh price upsert this run.
	"""
	if not tickers:
		return 0
	if providers is None:
		providers = _get_providers(market)
	original = list(dict.fromkeys((t or "").upper() for t in tickers if (t or "").strip()))
	if not original:
		return 0
	if not providers:
		frappe.log_error(
			title="Growe Price: no active API provider",
			message=f"Market {market!r} has no active Growe Price API with matching market (Kenya / Global / Both).",
		)
		return 0

	remaining = list(original)
	if stock_meta is None:
		stock_meta = _stock_meta_for_tickers(original)
	_publish_price_refresh_progress(
		notify_user,
		provider_name=provider_name,
		market=market,
		done=progress_done,
		total=progress_total,
	)
	updated = _run_fetch_providers_round(
		market,
		remaining,
		sym_map,
		providers,
		stock_meta=stock_meta,
		notify_user=notify_user,
		provider_name=provider_name,
		progress_total=progress_total,
		progress_done=progress_done,
	)

	not_refreshed = [t for t in original if t not in updated]
	if not_refreshed:
		retry_remaining = list(not_refreshed)
		updated |= _run_fetch_providers_round(
			market,
			retry_remaining,
			sym_map,
			providers,
			stock_meta=stock_meta,
			notify_user=notify_user,
			provider_name=provider_name,
			progress_total=progress_total,
			progress_done=progress_done + len(updated),
		)

	still_incomplete = [t for t in original if _ticker_cache_incomplete(t) and t not in updated]
	if still_incomplete:
		retry_remaining = list(still_incomplete)
		updated |= _run_fetch_providers_round(
			market,
			retry_remaining,
			sym_map,
			providers,
			stock_meta=stock_meta,
			notify_user=notify_user,
			provider_name=provider_name,
			progress_total=progress_total,
			progress_done=progress_done + len(updated),
		)

	return len(updated)


@frappe.whitelist()
def refresh_stock_prices(sync: int = 0):
	"""
	Enqueue a background job to fetch live prices for stock/ETF tickers in open holdings.

	Pass sync=1 to run inline (tests / debugging only).
	"""
	if int(sync or 0):
		return _execute_refresh_stock_prices()

	_enqueue_price_refresh(
		"growie_app.api.price._run_refresh_stock_prices",
		"growie_refresh_stock_prices",
		notify_user=frappe.session.user,
	)
	return {
		"queued": True,
		"message": _(
			"Price refresh started in the background. Updated prices will appear shortly."
		),
	}


# ── Historical prices (Marketstack / Mansa → Growe Price Cache child table) ───

def _monthly_interval_historical() -> int:
	"""Dates to keep per calendar month from Growe Settings (default 2 = first + last)."""
	try:
		raw = frappe.db.get_single_value("Growe Settings", "monthly_interval_historical")
	except Exception:
		raw = None
	try:
		n = int(raw or 2)
	except (TypeError, ValueError):
		n = 2
	return max(1, min(n, 8))


def _sample_dates_in_month(year: int, month: int, interval: int, through=None) -> list:
	"""Return ``interval`` calendar dates within a month (first/last when interval=2)."""
	from calendar import monthrange
	from frappe.utils import getdate

	last_day = monthrange(year, month)[1]
	interval = max(1, int(interval or 1))
	if interval <= 1:
		days = [last_day]
	else:
		days = []
		for i in range(interval):
			day = 1 + round(i * (last_day - 1) / (interval - 1))
			days.append(int(day))
		days = sorted(set(days))

	out = []
	cap = getdate(through) if through else None
	for day in days:
		d = getdate(f"{year:04d}-{month:02d}-{day:02d}")
		if cap and d > cap:
			continue
		out.append(d)
	return out


def _sample_target_dates(date_from, date_to, interval: int) -> list:
	"""All sample dates from earliest month through date_to."""
	from frappe.utils import getdate

	start = getdate(date_from)
	end = getdate(date_to)
	if not start or not end or start > end:
		return []

	targets = []
	y, m = start.year, start.month
	while (y < end.year) or (y == end.year and m <= end.month):
		month_start = getdate(f"{y:04d}-{m:02d}-01")
		# Skip samples before the holding start within the first month.
		for d in _sample_dates_in_month(y, m, interval, through=end):
			if d >= start:
				targets.append(d)
		if month_start > end:
			break
		m += 1
		if m > 12:
			m = 1
			y += 1
	return targets


def _earliest_holding_dates_by_ticker(tickers: list | None = None) -> dict[str, object]:
	"""Earliest open holding date_added per ticker (system-wide, for cache backfill)."""
	from frappe.utils import getdate

	filters = {"sold": 0, "quantity": [">", 0]}
	rows = frappe.get_all(
		"Growe Holding",
		filters=filters,
		fields=["ticker", "asset_class", "asset_name", "date_added"],
	)
	wanted = None
	if tickers:
		wanted = {(t or "").upper().strip() for t in tickers if (t or "").strip()}

	out: dict[str, object] = {}
	for r in rows:
		if not _holding_is_stock_or_etf(r.get("asset_class"), r.get("asset_name")):
			continue
		t = (r.ticker or "").upper().strip()
		if not t:
			continue
		if wanted is not None and t not in wanted:
			continue
		d = getdate(r.date_added) if r.date_added else None
		if not d:
			continue
		prev = out.get(t)
		if prev is None or d < prev:
			out[t] = d
	return out


def _closest_on_or_before(rows: list[dict], target) -> dict | None:
	"""Pick the latest EOD row on or before ``target``."""
	from frappe.utils import getdate

	target = getdate(target)
	best = None
	for row in rows:
		d = getdate(row.get("date"))
		if not d or d > target:
			continue
		if best is None or d > getdate(best["date"]):
			best = row
	return best


def _subsample_historical_rows(daily_rows: list[dict], targets: list) -> list[dict]:
	"""Keep one price per target sample date (nearest prior trading day)."""
	from frappe.utils import getdate

	if not daily_rows or not targets:
		return []
	sorted_rows = sorted(daily_rows, key=lambda r: getdate(r["date"]))
	picked: list[dict] = []
	seen = set()
	for target in targets:
		row = _closest_on_or_before(sorted_rows, target)
		if not row:
			continue
		key = (getdate(row["date"]), (row.get("currency") or "").upper())
		if key in seen:
			continue
		seen.add(key)
		picked.append(
			{
				"date": getdate(row["date"]),
				"price": float(row["price"]),
				"currency": (row.get("currency") or "KES").upper(),
			}
		)
	return picked


def _merge_historical_into_cache(ticker: str, rows: list[dict], source: str, stock_meta: dict | None = None) -> int:
	"""Upsert historical unit prices into Growe Price Cache child table. Returns rows written."""
	from frappe.utils import getdate

	ticker = (ticker or "").upper().strip()
	if not ticker or not rows:
		return 0

	stock_name = ""
	meta = (stock_meta or {}).get(ticker) if stock_meta else None
	if meta:
		stock_name = (meta.get("name") or "").strip()
	if not stock_name:
		stock_row = _stock_row_for_ticker(ticker)
		stock_name = (stock_row.get("name") if stock_row else "") or ""

	cache = _load_or_new_price_cache(ticker, stock_name=stock_name, stock_meta=stock_meta)
	_apply_stock_link_to_cache(cache, ticker, stock_meta)
	if stock_name:
		cache = _ensure_cache_named_by_stock(cache, stock_name)

	existing = {}
	for child in cache.get("growe_historical_price") or []:
		existing[(getdate(child.date), (child.currency or "").upper())] = child

	written = 0
	for row in rows:
		as_of = getdate(row["date"])
		ccy = (row.get("currency") or "KES").upper()
		price = float(row.get("price") or 0)
		if price <= 0 or not ccy:
			continue
		key = (as_of, ccy)
		if key in existing:
			if float(existing[key].price or 0) != round(price, 6):
				existing[key].price = round(price, 6)
				written += 1
			continue
		cache.append(
			"growe_historical_price",
			{"date": as_of, "currency": ccy, "price": round(price, 6)},
		)
		written += 1

	if cache.is_new() and not (cache.get("price") or 0):
		# New cache docs require a live price — seed from the latest historical row.
		latest = max(rows, key=lambda r: getdate(r["date"]))
		cache.ticker = ticker
		if stock_name:
			cache.stock = stock_name
		from growie_app.utils.market_labels import canonical_market_value

		bucket = _price_fetch_bucket((meta or {}).get("exchange_platform") if meta else None)
		cache.market = canonical_market_value("Kenya" if bucket == "NSE" else "Global")
		cache.currency = (latest.get("currency") or "KES").upper()
		cache.price = round(float(latest["price"]), 6)
		cache.source = source
		cache.fetched_at = now_datetime()

	if written or cache.is_new():
		if source and not cache.source:
			cache.source = source
		cache.flags.ignore_permissions = True
		if cache.is_new():
			cache.insert()
		else:
			cache.save()
	return written


def _provider_supports_historical(provider: dict) -> bool:
	key = _provider_key(provider)
	return key in ("marketstack", "mansa markets")


def _execute_fetch_historical_prices(
	provider_name: str,
	notify_user: str | None = None,
) -> dict:
	"""
	Fetch historical EOD for held tickers via Marketstack or Mansa, subsample by
	Growe Settings.monthly_interval_historical, and store in Growe Historical Price.
	"""
	from frappe.utils import getdate

	p = _get_provider_by_name(provider_name)
	if not p:
		frappe.throw(_("Provider '{0}' not found.").format(provider_name))
	if not int(p.get("is_active") or 0):
		frappe.throw(_("Provider '{0}' is not active.").format(provider_name))
	if not _provider_supports_historical(p):
		frappe.throw(
			_("Historical fetch is only supported for Marketstack and Mansa Markets.")
		)

	interval = _monthly_interval_historical()
	nse_tickers, global_tickers, nse_map, global_map, stock_meta = _collect_tickers_for_live_prices()
	eligible = _eligible_tickers_for_provider(p, nse_tickers, global_tickers)
	earliest = _earliest_holding_dates_by_ticker(eligible)
	eligible = [t for t in eligible if t in earliest]

	if not eligible:
		return {
			"success": True,
			"provider_name": provider_name,
			"tickers_requested": 0,
			"tickers_updated": 0,
			"rows_written": 0,
			"interval": interval,
			"message": _("No open stock/ETF holdings for this provider to backfill."),
		}

	today_d = getdate(today())
	key = _provider_key(p)
	provider = dict(p)
	tickers_updated = 0
	rows_written = 0
	errors: list[str] = []

	# Group by shared earliest date when possible; still fetch per-ticker from its own start.
	for i, ticker in enumerate(eligible):
		start = earliest[ticker]
		date_from = str(getdate(start))
		date_to = str(today_d)
		targets = _sample_target_dates(date_from, date_to, interval)
		if not targets:
			continue

		sym_map = _symbol_map_for_provider(
			provider,
			{**(nse_map or {}), **(global_map or {})},
			[ticker],
			stock_meta=stock_meta,
		)

		try:
			if key == "marketstack":
				from growie_app.utils.marketstack_prices import fetch_marketstack_historical

				fetched = fetch_marketstack_historical(
					provider,
					[ticker],
					date_from,
					date_to,
					market="Global",
					symbol_override_map=sym_map,
					stock_meta=stock_meta,
				)
			else:
				from growie_app.utils.mansa_prices import fetch_mansa_historical

				fetched = fetch_mansa_historical(
					provider,
					[ticker],
					date_from,
					date_to,
					market="NSE",
				)
		except Exception as exc:
			errors.append(f"{ticker}: {exc}")
			frappe.logger("growie.price").warning(
				"Historical fetch failed for %s: %s", ticker, exc
			)
			continue

		daily = fetched.get(ticker) or []
		sampled = _subsample_historical_rows(daily, targets)
		if not sampled:
			continue
		written = _merge_historical_into_cache(
			ticker,
			sampled,
			source=provider.get("provider_name") or provider_name,
			stock_meta=stock_meta,
		)
		if written:
			tickers_updated += 1
			rows_written += written

		if notify_user and (i % 3 == 0 or i == len(eligible) - 1):
			frappe.publish_realtime(
				"growie_historical_fetch_progress",
				{
					"provider_name": provider_name,
					"total": len(eligible),
					"done": i + 1,
					"last_ticker": ticker,
				},
				user=notify_user,
				after_commit=False,
			)

	frappe.db.commit()
	return {
		"success": True,
		"provider_name": provider_name,
		"tickers_requested": len(eligible),
		"tickers_updated": tickers_updated,
		"rows_written": rows_written,
		"interval": interval,
		"errors": errors[:10],
		"message": _(
			"Historical prices saved for {0}/{1} ticker(s) ({2} row(s), {3}/month)."
		).format(tickers_updated, len(eligible), rows_written, interval),
	}


def _run_fetch_historical_prices(provider_name: str, notify_user: str = None) -> dict:
	if notify_user:
		frappe.set_user(notify_user)
	try:
		result = _execute_fetch_historical_prices(
			provider_name=provider_name,
			notify_user=notify_user,
		)
		if notify_user:
			frappe.publish_realtime(
				"growie_historical_fetch_done",
				result,
				user=notify_user,
				after_commit=True,
			)
		return result
	except Exception as exc:
		frappe.db.rollback()
		frappe.log_error(title="Historical price fetch failed", message=frappe.get_traceback())
		if notify_user:
			frappe.publish_realtime(
				"growie_historical_fetch_done",
				{
					"success": False,
					"provider_name": provider_name,
					"error": str(exc),
				},
				user=notify_user,
				after_commit=True,
			)
		raise


@frappe.whitelist()
def fetch_historical_prices(provider_name: str, sync: int = 0):
	"""
	System Manager only: backfill Growe Historical Price from Marketstack or Mansa.

	Uses Growe Settings.monthly_interval_historical (e.g. 2 = first + last of each month)
	from each ticker's earliest open holding date through today.
	"""
	frappe.only_for("System Manager")
	if not provider_name:
		frappe.throw(_("provider_name is required."))

	p = _get_provider_by_name(provider_name)
	if not p:
		frappe.throw(_("Provider '{0}' not found.").format(provider_name))
	if not _provider_supports_historical(p):
		frappe.throw(
			_("Historical fetch is only supported for Marketstack and Mansa Markets.")
		)

	if int(sync or 0):
		return _execute_fetch_historical_prices(
			provider_name=provider_name,
			notify_user=frappe.session.user,
		)

	nse_tickers, global_tickers, *_rest = _collect_tickers_for_live_prices()
	eligible = _eligible_tickers_for_provider(p, nse_tickers, global_tickers)
	_enqueue_price_refresh(
		"growie_app.api.price._run_fetch_historical_prices",
		f"growie_fetch_historical:{provider_name}",
		provider_name=provider_name,
		notify_user=frappe.session.user,
	)
	return {
		"queued": True,
		"provider_name": provider_name,
		"tickers_requested": len(eligible),
		"interval": _monthly_interval_historical(),
		"message": _(
			"Historical price fetch queued for {0} ticker(s). Progress will appear on this form."
		).format(len(eligible)),
	}


@frappe.whitelist()
def get_historical_prices(tickers: str | list | None = None):
	"""
	Return stored Growe Historical Price rows for the given tickers (or the
	caller's open holdings). UI-only read — does not call market APIs.

	Each ticker maps to ``[{date, price, currency, priceKES}, …]`` sorted by date.
	"""
	import json

	if isinstance(tickers, str):
		raw = tickers.strip()
		if raw.startswith("["):
			try:
				tickers = json.loads(raw)
			except ValueError:
				tickers = [t.strip() for t in raw.split(",") if t.strip()]
		elif raw:
			tickers = [t.strip() for t in raw.split(",") if t.strip()]
		else:
			tickers = None

	wanted: list[str] = []
	if tickers:
		wanted = list(dict.fromkeys((t or "").upper().strip() for t in tickers if (t or "").strip()))
	else:
		# Default: tickers in the current member's open holdings.
		try:
			from growie_app.api.portfolio import _member_name

			member = _member_name()
			rows = frappe.get_all(
				"Growe Holding",
				filters={"investor": member, "sold": 0, "quantity": [">", 0]},
				fields=["ticker"],
			)
			wanted = list(
				dict.fromkeys((r.ticker or "").upper().strip() for r in rows if (r.ticker or "").strip())
			)
		except Exception:
			wanted = []

	if not wanted:
		return {}

	out: dict[str, list[dict]] = {t: [] for t in wanted}
	# Resolve cache parents by ticker (do not require a usable live quote).
	cache_names: dict[str, str] = {}
	for row in frappe.get_all(
		"Growe Price Cache",
		filters={"ticker": ["in", wanted]},
		fields=["name", "ticker"],
	):
		t = (row.ticker or "").upper().strip()
		if t and t not in cache_names:
			cache_names[t] = row.name

	for ticker in wanted:
		parent = cache_names.get(ticker)
		if not parent:
			# Fallback: cache named by stock / legacy ticker name.
			cache_row = _get_price_cache_row(ticker)
			parent = (cache_row or {}).get("name")
		if not parent:
			continue
		children = frappe.get_all(
			"Growe Historical Price",
			filters={
				"parent": parent,
				"parenttype": "Growe Price Cache",
				"parentfield": "growe_historical_price",
			},
			fields=["date", "currency", "price"],
			order_by="date asc",
		)
		series = []
		for c in children:
			price = float(c.price or 0)
			ccy = (c.currency or "KES").upper()
			if price <= 0:
				continue
			as_of = str(c.date)
			price_kes = _convert_price_amount(price, ccy, "KES", as_of)
			series.append(
				{
					"date": as_of,
					"price": price,
					"currency": ccy,
					"priceKES": round(float(price_kes or 0), 6),
				}
			)
		out[ticker] = series
	return out


@frappe.whitelist(allow_guest=True)
def get_nse_index():
	"""
	Fetch the current NSE index value from Mansa Markets.
	Returns the first active Mansa provider's index data.
	"""
	providers = frappe.get_all(
		"Growe Price API",
		filters={"is_active": 1, "market_type": ["in", ["Kenya", "NSE", "Both"]]},
		fields=["name", "provider_name", "api_provider", "api_base_url", "api_key"],
		order_by="creation asc",
		limit=5,
	)

	for provider in providers:
		api_prov = (provider.api_provider or "").lower()
		if "mansa" not in api_prov and "mansa" not in (provider.provider_name or "").lower():
			continue
		try:
			from growie_app.utils.mansa_prices import _service_base, _request_json

			base = _service_base(dict(provider))
			url = f"{base}/markets/exchanges/NSE"
			body = _request_json(dict(provider), url)
			if body and isinstance(body.get("data"), dict):
				data = body["data"]
				return {
					"exchange": data.get("code") or "NSE",
					"index_value": data.get("index_value") or data.get("value"),
					"change_pct": data.get("change_pct"),
					"currency": data.get("currency") or "KES",
					"name": data.get("name"),
				}
		except Exception as e:
			frappe.log_error(title="NSE index fetch error", message=str(e))

	return None
