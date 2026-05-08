"""
Price fetching service — Mansa Markets, FCS API, Alpha Vantage.

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


def _mansa_kes_usd_rate(provider: dict) -> float | None:
	"""Fetch live KES-USD rate from Mansa forex endpoint."""
	try:
		base = provider["api_base_url"].rstrip("/")
		url = f"{base}/forex/KES-USD"
		resp = _requests.get(url, params={"api_key": provider.get("api_key", "")}, timeout=8)
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
	api_key = provider.get("api_key", "")
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
	access_key = provider.get("api_key", "")

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
	api_key = provider.get("api_key", "")
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


# ── Generic dispatcher (uses api_provider field) ───────────────────────────────

def _fetch_from_provider(provider: dict, symbols: list, market: str = "NSE") -> dict:
	api_prov = _provider_key(provider)

	if api_prov == "mansa markets":
		return _fetch_mansa(provider, symbols, market)
	if api_prov == "fcs api":
		return _fetch_fcs(provider, symbols, market)
	if api_prov == "alpha vantage":
		if str(market).upper() != "GLOBAL":
			return {}
		return _fetch_alpha_vantage(provider, symbols, market)

	# Unknown — skip with a warning
	frappe.log_error(
		title="Unknown price provider",
		message=(
			f"No parser for provider '{provider.get('provider_name')}' "
			f"(api_provider='{provider.get('api_provider')}'). "
			"Supported: Mansa Markets, FCS API, Alpha Vantage."
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
		print("Nikoia")
		if _provider_uses_alpha_vantage(provider):
			
			fetched = _fetch_alpha_vantage(
				provider, remaining, market, symbol_override_map=sym_map
			)
		else:
			fetched = _fetch_from_provider(provider, remaining, market)

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
					fetched = _fetch_from_provider(provider, [alone], market)
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
	Fetch fresh prices for all tickers in Growe Holdings.
	Upserts Growe Price Cache and recomputes holding values.
	If provider_name is passed, only that active Growe Price API row is used.
	"""
	all_holdings = frappe.get_all(
		"Growe Holding",
		filters=[["ticker", "!=", ""]],
		fields=["ticker", "asset_class"],
	)

	nse_tickers: set = set()
	global_tickers: set = set()

	for h in all_holdings:
		if not h.ticker:
			continue
		ac = (h.asset_class or "").lower()
		if "nse" in ac:
			nse_tickers.add(h.ticker.upper())
		else:
			global_tickers.add(h.ticker.upper())

	nse_map, global_map = _api_symbol_maps_for_tickers(list(nse_tickers), list(global_tickers))
	nse_prices = _fetch_and_store("NSE", list(nse_tickers), nse_map, provider_name=provider_name)
	global_prices = _fetch_and_store("Global", list(global_tickers), global_map, provider_name=provider_name)
	all_prices = {**nse_prices, **global_prices}
  
	for ticker, price_kes in all_prices.items():
		_update_holdings_for_ticker(ticker, price_kes)

	frappe.db.commit()

	if not all_prices and (nse_tickers or global_tickers):
		frappe.msgprint(
			_(
				"No live prices were saved. Check: (1) Growe Price API records are Active, "
				"(2) Market Type matches your holdings (NSE vs Global), "
				"(3) API Provider is Mansa Markets, FCS API, or Alpha Vantage, "
				"(4) Error Log for provider errors."
			),
			alert=True,
			indicator="orange",
		)

	return {
		"nse_updated": len(nse_prices),
		"global_updated": len(global_prices),
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
	usd_to_kes = _get_usd_to_kes()

	try:
		results = _fetch_from_provider(dict(provider), [ticker], market)
		
	except Exception as e:
		_save_test_result(provider_name, f"ERROR: {e}")
		return {"success": False, "error": str(e)}

	if ticker in results:
		data = results[ticker]
		currency = (data.get("currency") or "KES").upper()
		price_kes = data["price"] if currency == "KES" else data["price"] * usd_to_kes
		change_pct = data.get("change_percent", 0)
		msg = (
			f"✅  {ticker}  KES {price_kes:,.2f}  "
			f"({'▲' if change_pct >= 0 else '▼'} {abs(change_pct):.2f}%)  "
			f"[{data.get('currency', '?')}]"
		)
		_save_test_result(provider_name, msg)
		return {
			"success": True,
			"ticker": ticker,
			"price_kes": round(price_kes, 2),
			"change_percent": change_pct,
			"currency": currency,
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
def get_stocks_with_prices(market: str = None, sector: str = None, limit: int = 200):
	"""
	Return all active Growe Stock records joined with their cached prices.
	Used by the Markets page to display the full stock list with live prices.
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
	price_map: dict = {}
	if tickers:
		try:
			cache_rows = frappe.get_all(
				"Growe Price Cache",
				filters=[["ticker", "in", tickers]],
				fields=["ticker", "price_kes", "price_usd", "change_percent", "source", "fetched_at"],
			)
			price_map = {r.ticker: r for r in cache_rows}
		except Exception:
			pass  # Price Cache table may not exist yet; stocks will show without prices

	result = []
	for s in stocks:
		cache = price_map.get(s.ticker) or {}
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
			"hasPrice":      bool(cache.get("price_kes")),
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


def _fetch_market_for_refresh(market: str, tickers: list, sym_map: dict) -> int:
	"""
	Fetch and upsert for one market. Batch first, then one symbol per call for stragglers
	(helps FCS and providers that drop symbols in multi-symbol calls).
	"""
	if not tickers:
		return 0
	providers = _get_providers(market)
	remaining = list(dict.fromkeys((t or "").upper() for t in tickers if (t or "").strip()))
	if not remaining:
		return 0
	if not providers:
		frappe.log_error(
			title="Growe Price: no active API provider",
			message=f"Market {market!r} has no active Growe Price API with matching market (NSE / Global / Both).",
		)
		return 0

	started = len(remaining)

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
			fetched = _fetch_from_provider(provider, remaining, market)
		_usd = _get_usd_to_kes()
		for ticker, data in list(fetched.items()):
			tu = (ticker or "").upper()
			if tu not in remaining:
				continue
			_upsert_cache(tu, market, data, _usd, provider["provider_name"])
			remaining.remove(tu)

	# One ticker at a time: improves hit rate for Alpha (already per-symbol) and flaky batch APIs
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
					fetched = _fetch_from_provider(provider, [lone], market)
				_usd = _get_usd_to_kes()
				for tk, data in list(fetched.items()):
					tu = (tk or "").upper()
					if tu in remaining:
						_upsert_cache(tu, market, data, _usd, provider["provider_name"])
						remaining.remove(tu)
	return started - len(remaining)


@frappe.whitelist()
def refresh_stock_prices():
	"""
	Fetch live prices for every active Growe Stock ticker **and** any ticker held in
		Growe Holding that is not in the stock master, so the cache is populated even
		if you only have portfolio positions. Uses `api_symbol` for Alpha Vantage.
	"""
	nse_tickers, global_tickers, nse_map, gmap = _collect_tickers_for_live_prices()

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
				params={"api_key": provider.api_key or ""},
				timeout=8,
			)
			if resp.ok:
				return resp.json()
		except Exception as e:
			frappe.log_error(title="NSE index fetch error", message=str(e))

	return None
