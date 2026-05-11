"""
Price fetching service — Mansa Markets, FCS API, Finnhub, Alpha Vantage.

Mansa Markets (mansaapi.com):
  Base: https://www.mansaapi.com/api/v1
  Auth: ?api_key={key}
  Bulk:   GET /stocks?exchange=NSE&api_key={key}
  Single: GET /stocks/{ticker}?api_key={key}
  Forex:  GET /forex/KES-USD?api_key={key}
  Response: {"stocks":[{"ticker":"SCOM","price":19.50,"change_pct":0.77}],"count":56}

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
  Growe Price Cache still stores price_usd and price_kes using your USD/KES setting when syncing.

Dispatch is determined by the "api_provider" Select field on the Growe Price API record.
"""

import frappe
from frappe import _
from frappe.utils import now_datetime
import requests as _requests
import time


# ── KES/USD fallback rate ─────────────────────────────────────────────────────

_USD_TO_KES_DEFAULT = 130.0


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
	"""
	name = provider.get("name")
	details = frappe.get_doc("Growe Price API", name)
	key =  details.get_password("api_key")
	if key:
		return str(key).strip()
	doc_name = provider.get("name")
	if doc_name:
		try:
			doc = frappe.get_doc("Growe Price API", doc_name)
			pw = doc.get_password("api_key")
			if pw:
				return str(pw).strip()
		except Exception:
			pass
	return ""


def _mansa_kes_usd_rate(provider: dict) -> float | None:
	"""Fetch live KES-USD rate from Mansa forex endpoint."""
	try:
		base = provider["api_base_url"].rstrip("/")
		url = f"{base}/forex/KES-USD"
		resp = _requests.get(url, params={"api_key": _price_api_key(provider)}, timeout=8)
		if resp.ok:
			data = resp.json()
			# Mansa returns the pair rate
			rate = data.get("rate") or data.get("close") or data.get("price")
			if rate:
				return 1.0 / float(rate)   # KES-USD rate → USD per KES → invert to get KES per USD
	except Exception:
		pass
	return None


# ── Provider loader ───────────────────────────────────────────────────────────

def _provider_key(provider: dict) -> str:
	"""Normalized key from Growe Price API.api_provider select."""
	return str(provider.get("api_provider") or "").strip().lower()


def _get_providers(market_type: str, provider_name: str | None = None) -> list:
	"""
	Load active providers for a market. If provider_name is passed, return only that row
	(if active and market-compatible) so refresh can be forced to a specific provider.
	"""
	if provider_name:
		p = frappe.db.get_value(
			"Growe Price API",
			provider_name,
			[
				"name", "provider_name", "api_provider", "market_type",
				"api_base_url", "api_key", "endpoint_prices", "calls_per_month", "is_active",
			],
			as_dict=True,
		)
		if not p:
			frappe.throw(_(f"Provider '{provider_name}' not found."))
		if not int(p.get("is_active") or 0):
			frappe.throw(_(f"Provider '{provider_name}' is not active."))
		if p.market_type not in (market_type, "Both"):
			return []
		if str(market_type).upper() == "NSE" and _provider_key(p) == "alpha vantage":
			return []
		return [p]

	providers = frappe.get_all(
		"Growe Price API",
		filters={"is_active": 1},
		fields=[
			"name", "provider_name", "api_provider", "market_type",
			"api_base_url", "api_key", "endpoint_prices", "calls_per_month",
		],
		order_by="creation asc",
	)
	filtered = [p for p in providers if p.market_type in (market_type, "Both")]
	# Business rule: Alpha Vantage is Global-only.
	if str(market_type).upper() == "NSE":
		filtered = [p for p in filtered if _provider_key(p) != "alpha vantage"]
	return filtered


# ── Mansa Markets ─────────────────────────────────────────────────────────────

def _fetch_mansa(provider: dict, symbols: list, market: str = "NSE") -> dict:
	"""
	Fetch prices from Mansa Markets API.
	Strategy:
	  1. Bulk fetch all stocks for the exchange (one call, very efficient).
	  2. Filter to the tickers we need.
	"""
	base = provider["api_base_url"].rstrip("/")
	api_key = _price_api_key(provider)
	results: dict = {}

	# Map our internal market → Mansa exchange code
	exchange_map = {"NSE": "NSE", "Global": None}
	exchange = exchange_map.get(market)

	try:
		if exchange:
			# Bulk fetch entire exchange
			url = f"{base}/stocks"
			params = {"exchange": exchange, "api_key": api_key}
			resp = _requests.get(url, params=params, timeout=15)
			resp.raise_for_status()
			body = resp.json()

			wanted = {s.upper() for s in symbols}
			for item in body.get("stocks", []):
				ticker = (item.get("ticker") or "").upper()
				if ticker not in wanted:
					continue
				price = float(item.get("price", 0) or 0)
				change_pct = float(item.get("change_pct", 0) or 0)
				if ticker and price:
					results[ticker] = {
						"price": price,
						"change_percent": change_pct,
						"currency": "KES",
					}
		else:
			# For non-NSE, try individual lookups
			for symbol in symbols:
				url = f"{base}/stocks/{symbol.upper()}"
				params = {"api_key": api_key}
				resp = _requests.get(url, params=params, timeout=10)
				if not resp.ok:
					continue
				item = resp.json()
				price = float(item.get("price", 0) or 0)
				change_pct = float(item.get("change_pct", 0) or 0)
				currency = item.get("currency", "USD") or "USD"
				if price:
					results[symbol.upper()] = {
						"price": price,
						"change_percent": change_pct,
						"currency": currency,
					}

	except Exception as e:
		frappe.log_error(title="Mansa price fetch error", message=str(e))

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

	prefix = _FCS_EXCHANGE_PREFIX.get(market, "")

	# Build symbol list with optional exchange prefix
	sym_list = []
	for s in symbols:
		sym_list.append(f"{prefix}:{s.upper()}" if prefix else s.upper())

	results: dict = {}
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
			resp.raise_for_status()
			body = resp.json()

			if not body.get("status"):
				frappe.log_error(
					title="FCS API error",
					message=f"status=false: {body.get('msg', body)}",
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
			resp.raise_for_status()
			body = resp.json()

			# Alpha Vantage returns a plaintext "Information" or "Note" key when rate-limited
			if "Information" in body or "Note" in body:
				limit_msg = body.get("Information") or body.get("Note", "")
				provider["_alpha_rate_limited"] = 1
				frappe.log_error(
					title="Alpha Vantage rate limit hit",
					message=limit_msg,
				)
				frappe.msgprint(
					f"Alpha Vantage rate limit: {limit_msg}",
					alert=True,
					indicator="orange",
				)
				break  # stop burning quota once we hit the limit

			quote = body.get("Global Quote") or {}

			if not quote:
				frappe.log_error(
					title=f"Alpha Vantage: no data for {av_symbol}",
					message=str(body),
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
	base = (provider.get("api_base_url") or "").strip().rstrip("/") or _FINNHUB_DEFAULT_BASE
	endpoint = (provider.get("endpoint_prices") or "/quote").strip()
	if not endpoint.startswith("/"):
		endpoint = "/" + endpoint
	token = _price_api_key(provider)
	
	symbol_override_map = symbol_override_map or {}
	results: dict = {}

	if not token:
		frappe.log_error(
			title="Finnhub: missing API token",
			message="Growe Price API.api_key is empty for Finnhub.",
		)
		return {}

	url = f"{base}{endpoint}"

	for idx, symbol in enumerate(symbols):
		if idx > 0:
			time.sleep(1.05)

		sym_u = (symbol or "").upper().strip()
		if not sym_u:
			continue

		if sym_u in symbol_override_map:
			fh_symbol = symbol_override_map[sym_u].strip()
		else:
			fh_symbol = sym_u

		params = {"symbol": fh_symbol, "token": token}
		try:
			resp = _requests.get(url, params=params, timeout=12)
			resp.raise_for_status()
			body = resp.json()

			if isinstance(body, dict) and body.get("error"):
				frappe.log_error(
					title=f"Finnhub API error ({fh_symbol})",
					message=str(body.get("error")),
				)
				continue

			c = float(body.get("c") or 0)
			pc = float(body.get("pc") or 0)

			if not c:
				frappe.log_error(
					title=f"Finnhub: no price for {fh_symbol}",
					message=str(body),
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
			frappe.log_error(
				title=f"Finnhub fetch error ({fh_symbol})",
				message=str(e),
			)

	return results


# ── Generic dispatcher (uses api_provider field) ───────────────────────────────

def _fetch_from_provider(
	provider: dict,
	symbols: list,
	market: str = "NSE",
	symbol_override_map: dict | None = None,
) -> dict:
	api_prov = _provider_key(provider)
	symbol_override_map = symbol_override_map or {}

	if api_prov == "mansa markets":
		return _fetch_mansa(provider, symbols, market)
	if api_prov == "fcs api":
		return _fetch_fcs(provider, symbols, market)
	if api_prov == "finnhub":
		return _fetch_finnhub(provider, symbols, market, symbol_override_map=symbol_override_map)
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
			"Supported: Mansa Markets, FCS API, Finnhub, Alpha Vantage."
		),
	)
	return {}


# ── Price cache upsert ────────────────────────────────────────────────────────

def _upsert_cache(ticker: str, market: str, price_data: dict, usd_to_kes: float, source: str):
	price = price_data["price"]
	currency = (price_data.get("currency") or "KES").upper()
	change_pct = float(price_data.get("change_percent", 0) or 0)

	price_kes = price if currency == "KES" else price * usd_to_kes
	price_usd = price if currency == "USD" else price / usd_to_kes

	if frappe.db.exists("Growe Price Cache", ticker):
		cache = frappe.get_doc("Growe Price Cache", ticker)
	else:
		cache = frappe.new_doc("Growe Price Cache")
		cache.ticker = ticker

	cache.market = market
	cache.price_kes = round(price_kes, 4)
	cache.price_usd = round(price_usd, 6)
	cache.change_percent = change_pct
	cache.source = source
	cache.fetched_at = now_datetime()
	cache.flags.ignore_permissions = True
	cache.save()


# ── Holding value updater ─────────────────────────────────────────────────────

def _update_holdings_for_ticker(ticker: str, price_kes: float):
	holdings = frappe.get_all(
		"Growe Holding",
		filters={"ticker": ticker},
		fields=["name", "quantity"],
	)
	for h in holdings:
		qty = float(h.quantity or 0)
		if qty <= 0:
			continue
		doc = frappe.get_doc("Growe Holding", h.name)
		doc.value_kes = round(qty * price_kes, 2)
		doc.last_updated = now_datetime()
		doc.flags.ignore_permissions = True
		doc.save()


# ── Ticker ordering & cache completeness (Markets + multi-provider refresh) ───

def _holding_ticker_set() -> set[str]:
	"""Uppercase tickers that appear in any Growe Holding (for fetch priority)."""
	rows = frappe.get_all(
		"Growe Holding",
		filters=[["ticker", "!=", ""]],
		pluck="ticker",
	)
	return {(t or "").upper() for t in rows if t}


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
		["price_kes", "price_usd", "change_percent"],
		as_dict=True,
	)
	if not row:
		row = frappe.db.get_value(
			"Growe Price Cache",
			{"ticker": (ticker or "").upper()},
			["price_kes", "price_usd", "change_percent"],
			as_dict=True,
		)
	if not row:
		return True
	pk = float(row.get("price_kes") or 0)
	pusd = float(row.get("price_usd") or 0)
	if not (pk > 0 or pusd > 0):
		return True
	if row.get("change_percent") is None:
		return True
	return False


def _cache_dict_is_complete_quote(cache: dict) -> bool:
	"""Markets API: include a stock only when cache has price + non-null change %."""
	if not cache:
		return False
	pk = float(cache.get("price_kes") or 0)
	pusd = float(cache.get("price_usd") or 0)
	if not (pk > 0 or pusd > 0):
		return False
	return cache.get("change_percent") is not None


# ── Core orchestrator ─────────────────────────────────────────────────────────

def _provider_uses_alpha_vantage(provider: dict) -> bool:
	"""True only when api_provider select is exactly 'Alpha Vantage'."""
	
	return _provider_key(provider) == "alpha vantage"


def _api_symbol_maps_for_tickers(nse: list, global_: list) -> tuple[dict, dict]:
	"""Load Growe Stock api_symbol for held tickers (required for correct Alpha Vantage symbols)."""
	nse_map: dict = {}
	gmap: dict = {}
	uniq = {(t or "").upper() for t in (nse or []) + (global_ or []) if (t or "").strip()}
	if not uniq:
		return nse_map, gmap
	for s in frappe.get_all(
		"Growe Stock",
		filters={"ticker": ["in", list(uniq)]},
		fields=["ticker", "api_symbol", "market"],
	):
		t = (s.ticker or "").upper()
		if not s.api_symbol:
			continue
		m = (s.market or "NSE").strip().upper()
		if m == "GLOBAL":
			gmap[t] = s.api_symbol
		else:
			nse_map[t] = s.api_symbol
	return nse_map, gmap


def _fetch_and_store(
	market: str,
	tickers: list,
	sym_map: dict | None = None,
	provider_name: str | None = None,
) -> dict:
	if not tickers:
		return {}

	providers = _get_providers(market, provider_name=provider_name)
	remaining = list(
		dict.fromkeys((t or "").upper() for t in tickers if (t or "").strip())
	)
 
	prices: dict = {}
	usd_to_kes = _get_usd_to_kes()
	sym_map = sym_map or {}
	
	for provider in providers:
		
		if not remaining:
			break
		if provider.get("_alpha_rate_limited"):
			continue
		
		# Try to get live KES rate from Mansa forex endpoint
		api_prov = (provider.get("api_provider") or "").lower()
		if "mansa" in api_prov or "mansa" in (provider.get("provider_name") or "").lower():
			live_rate = _mansa_kes_usd_rate(provider)
			if live_rate:
				usd_to_kes = live_rate
		if _provider_uses_alpha_vantage(provider):
			fetched = _fetch_alpha_vantage(
				provider, remaining, market, symbol_override_map=sym_map
			)
		else:
			fetched = _fetch_from_provider(
				provider, remaining, market, symbol_override_map=sym_map
			)

		for ticker, data in fetched.items():
			tu = (ticker or "").upper()
			if tu not in remaining:
				continue
			_upsert_cache(tu, market, data, usd_to_kes, provider["provider_name"])
			currency = (data.get("currency") or "KES").upper()
			price_kes = data["price"] if currency == "KES" else data["price"] * usd_to_kes
			prices[tu] = price_kes
			remaining.remove(tu)
	
	# One ticker at a time if batch did not return some symbols
	if remaining and providers:
		for provider in providers:
			if not remaining:
				break
			if provider.get("_alpha_rate_limited"):
				continue
			api_prov = (provider.get("api_provider") or "").lower()
			if "mansa" in api_prov or "mansa" in (provider.get("provider_name") or "").lower():
				live_rate = _mansa_kes_usd_rate(provider)
				if live_rate:
					usd_to_kes = live_rate
			for alone in list(remaining):
				if _provider_uses_alpha_vantage(provider):
					fetched = _fetch_alpha_vantage(
						provider, [alone], market, symbol_override_map=sym_map
					)
				else:
					fetched = _fetch_from_provider(
						provider, [alone], market, symbol_override_map=sym_map
					)
				for ticker, data in fetched.items():
					tu = (ticker or "").upper()
					if tu not in remaining:
						continue
					_upsert_cache(tu, market, data, usd_to_kes, provider["provider_name"])
					currency = (data.get("currency") or "KES").upper()
					price_kes = data["price"] if currency == "KES" else data["price"] * usd_to_kes
					prices[tu] = price_kes
					remaining.remove(tu)
    
	return prices


# ── Public API endpoints ──────────────────────────────────────────────────────

@frappe.whitelist()
def refresh_prices(provider_name: str = None):
	"""
	Fetch fresh prices for every active Growe Stock ticker (and any held ticker not in
	the stock master), same universe as refresh_stock_prices. Holdings tickers are
	fetched first. Upserts Growe Price Cache and recomputes holding values.

	If provider_name is passed (e.g. Growe Price API name from Desk), only that row is used.
	Otherwise all active providers for each market run in sequence.
	"""
	nse_tickers, global_tickers, nse_map, global_map = _collect_tickers_for_live_prices()
	nse_tickers = _sort_tickers_holdings_first(nse_tickers)
	global_tickers = _sort_tickers_holdings_first(global_tickers)

	if provider_name:
		nse_prices = _fetch_and_store("NSE", list(nse_tickers), nse_map, provider_name=provider_name)
		global_prices = _fetch_and_store("Global", list(global_tickers), global_map, provider_name=provider_name)
		all_prices = {**nse_prices, **global_prices}
		nse_updated_count = len(nse_prices)
		global_updated_count = len(global_prices)
	else:
		nse_updated_count = _fetch_market_for_refresh("NSE", nse_tickers, nse_map)
		global_updated_count = _fetch_market_for_refresh("Global", global_tickers, global_map)
		all_prices = {}
		for t in set(nse_tickers) | set(global_tickers):
			cache = frappe.db.get_value("Growe Price Cache", t, "price_kes")
			if cache:
				all_prices[t] = float(cache)

	for t in set(nse_tickers) | set(global_tickers):
		cache = frappe.db.get_value("Growe Price Cache", t, "price_kes")
		if cache:
			_update_holdings_for_ticker(t, float(cache))

	frappe.db.commit()

	if not all_prices and (nse_tickers or global_tickers):
		frappe.msgprint(
			_(
				"No live prices were saved. Check: (1) Growe Price API records are Active, "
				"(2) Market Type matches your holdings (NSE vs Global), "
				"(3) API Provider is Mansa Markets, FCS API, Finnhub, or Alpha Vantage, "
				"(4) Error Log for provider errors."
			),
			alert=True,
			indicator="orange",
		)

	return {
		"nse_updated": nse_updated_count,
		"global_updated": global_updated_count,
		"prices": all_prices,
	}


@frappe.whitelist(allow_guest=True)
def get_price_cache():
	"""Return all cached prices."""
	return frappe.get_all(
		"Growe Price Cache",
		fields=["ticker", "market", "price_kes", "price_usd", "change_percent", "source", "fetched_at"],
		order_by="market asc, ticker asc",
	)


@frappe.whitelist(allow_guest=True)
def get_market_indices():
	"""Return curated index tickers from the price cache."""
	index_tickers = ["NSE20", "NASI", "SP500", "FTSE100", "DAX", "BTC", "NGX"]
	return frappe.get_all(
		"Growe Price Cache",
		filters=[["ticker", "in", index_tickers]],
		fields=["ticker", "market", "price_kes", "price_usd", "change_percent", "fetched_at"],
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
		 "api_base_url", "api_key", "endpoint_prices"],
		as_dict=True,
	)

	# Auto-detect market from provider if not given
	if not market:
		market = "NSE" if provider.market_type in ("NSE", "Both") else "Global"

	ticker = test_ticker.strip().upper()

	sym_for_test: dict = {}
	row = frappe.db.get_value(
		"Growe Stock",
		{"ticker": ticker},
		"api_symbol",
	)
	if row:
		sym_for_test[ticker] = row

	try:
		results = _fetch_from_provider(
			dict(provider), [ticker], market, symbol_override_map=sym_for_test
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
	filters = {"is_active": 1}
	if market:
		filters["market"] = market
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
				fields=["ticker", "price_kes", "price_usd", "change_percent", "source", "fetched_at"],
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
		result.append({
			"name":          s.name,
			"ticker":        s.ticker,
			"companyName":   s.company_name or s.ticker,
			"market":        s.market,
			"sector":        s.sector or "",
			"currency":      s.currency or "KES",
			"apiSymbol":     s.api_symbol or "",
			"priceKES":      float(cache.get("price_kes") or 0),
			"priceUSD":      float(cache.get("price_usd") or 0),
			"changePercent": float(cache.get("change_percent") or 0),
			"source":        cache.get("source") or "",
			"fetchedAt":     str(cache.get("fetched_at") or ""),
			"hasPrice":      True,
			"hasCompleteQuote": True,
		})

	return result


def _collect_tickers_for_live_prices() -> tuple[list, list, dict, dict]:
	"""
	Build NSE / Global ticker lists from:
	1) Active Growe Stock (with api_symbol map for AV)
	2) Growe Holding — any ticker in a portfolio that is not already covered by
	   the stock master, so "Refresh all prices" still works without a row in Growe Stock.
	"""
	
	nse: set = set()
	global_: set = set()
	nse_map: dict = {}
	global_map: dict = {}

	for s in frappe.get_all(
		"Growe Stock",
		filters={"is_active": 1},
		fields=["ticker", "api_symbol", "market"],
	):
		t = (s.ticker or "").upper()
		if not t:
			continue
		raw = (s.market or "NSE").strip().upper()
		if raw not in ("NSE", "GLOBAL"):
			raw = "NSE"
		if raw == "NSE":
			nse.add(t)
			if s.api_symbol:
				nse_map[t] = s.api_symbol
		else:
			global_.add(t)
			if s.api_symbol:
				global_map[t] = s.api_symbol

	for h in frappe.get_all(
		"Growe Holding",
		filters=[["ticker", "!=", ""]],
		fields=["ticker", "asset_class"],
	):
		t = (h.ticker or "").upper()
		if not t:
			continue
		if t in nse or t in global_:
			continue
		ac = (h.asset_class or "").lower()
		if "nse" in ac:
			nse.add(t)
		else:
			global_.add(t)

	return list(nse), list(global_), nse_map, global_map


def _run_fetch_providers_round(
	market: str,
	remaining: list,
	sym_map: dict,
	providers: list,
) -> None:
	"""Mutates `remaining`: batch fetch per provider, then per-symbol stragglers."""
	for provider in providers:
		if not remaining:
			break
		if provider.get("_alpha_rate_limited"):
			continue
		if _provider_uses_alpha_vantage(provider):
			fetched = _fetch_alpha_vantage(
				provider, remaining, market, symbol_override_map=sym_map
			)
		else:
			fetched = _fetch_from_provider(
				provider, remaining, market, symbol_override_map=sym_map
			)
		_usd = _get_usd_to_kes()
		for ticker, data in list(fetched.items()):
			tu = (ticker or "").upper()
			if tu not in remaining:
				continue
			_upsert_cache(tu, market, data, _usd, provider["provider_name"])
			remaining.remove(tu)

	if remaining:
		for provider in providers:
			if not remaining:
				break
			if provider.get("_alpha_rate_limited"):
				continue
			for lone in list(remaining):
				if _provider_uses_alpha_vantage(provider):
					fetched = _fetch_alpha_vantage(
						provider, [lone], market, symbol_override_map=sym_map
					)
				else:
					fetched = _fetch_from_provider(
						provider, [lone], market, symbol_override_map=sym_map
					)
				_usd = _get_usd_to_kes()
				for tk, data in list(fetched.items()):
					tu = (tk or "").upper()
					if tu in remaining:
						_upsert_cache(tu, market, data, _usd, provider["provider_name"])
						remaining.remove(tu)


def _fetch_market_for_refresh(market: str, tickers: list, sym_map: dict) -> int:
	"""
	Fetch and upsert for one market. Each active provider runs in order (batch, then
	stragglers). A second pass repeats the same for tickers still missing a complete
	quote so later APIs can fill gaps the first pass missed.

	Returns how many tickers gained a complete quote (price + change %) vs before this run.
	"""
	if not tickers:
		return 0
	providers = _get_providers(market)
	original = list(dict.fromkeys((t or "").upper() for t in tickers if (t or "").strip()))
	if not original:
		return 0
	if not providers:
		frappe.log_error(
			title="Growe Price: no active API provider",
			message=f"Market {market!r} has no active Growe Price API with matching market (NSE / Global / Both).",
		)
		return 0

	before_complete = sum(1 for t in original if not _ticker_cache_incomplete(t))

	remaining = list(original)
	_run_fetch_providers_round(market, remaining, sym_map, providers)

	still_incomplete = [t for t in original if _ticker_cache_incomplete(t)]
	if still_incomplete:
		remaining = list(still_incomplete)
		_run_fetch_providers_round(market, remaining, sym_map, providers)

	after_complete = sum(1 for t in original if not _ticker_cache_incomplete(t))
	return max(0, after_complete - before_complete)


@frappe.whitelist()
def refresh_stock_prices():
	"""
	Fetch live prices for every active Growe Stock ticker **and** any ticker held in
		Growe Holding that is not in the stock master, so the cache is populated even
		if you only have portfolio positions. Uses `api_symbol` for Alpha Vantage.
	"""
	nse_tickers, global_tickers, nse_map, gmap = _collect_tickers_for_live_prices()
	nse_tickers = _sort_tickers_holdings_first(nse_tickers)
	global_tickers = _sort_tickers_holdings_first(global_tickers)

	nse_updated = _fetch_market_for_refresh("NSE", nse_tickers, nse_map)
	global_updated = _fetch_market_for_refresh("Global", global_tickers, gmap)
	# Recompute holding values for any price we have for these tickers
	for t in set(nse_tickers) | set(global_tickers):
		cache = frappe.db.get_value("Growe Price Cache", t, "price_kes")
		if cache:
			_update_holdings_for_ticker(t, float(cache))

	frappe.db.commit()

	return {
		"nse_updated": nse_updated,
		"global_updated": global_updated,
		"total": nse_updated + global_updated,
	}


@frappe.whitelist(allow_guest=True)
def get_nse_index():
	"""
	Fetch the current NSE index value from Mansa Markets.
	Returns the first active Mansa provider's index data.
	"""
	providers = frappe.get_all(
		"Growe Price API",
		filters={"is_active": 1, "market_type": ["in", ["NSE", "Both"]]},
		fields=["name", "provider_name", "api_provider", "api_base_url", "api_key"],
		order_by="creation asc",
		limit=5,
	)

	for provider in providers:
		api_prov = (provider.api_provider or "").lower()
		if "mansa" not in api_prov and "mansa" not in (provider.provider_name or "").lower():
			continue
		try:
			base = provider.api_base_url.rstrip("/")
			resp = _requests.get(
				f"{base}/index/NSE",
				params={"api_key": _price_api_key(dict(provider))},
				timeout=8,
			)
			if resp.ok:
				return resp.json()
		except Exception as e:
			frappe.log_error(title="NSE index fetch error", message=str(e))

	return None
