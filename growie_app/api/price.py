"""
Price fetching service.

Flow:
  1. Gather all distinct tickers that have holdings (NSE or Global).
  2. For NSE tickers  → try Mansa Market API first, fall back to FCS API.
  3. For Global tickers → try FCS API first, fall back to Mansa (if configured).
  4. Store results in Growe Price Cache (upsert).
  5. For any holding with a ticker + quantity, recompute value_kes and save.

Mansa Market API docs use:
  GET  {base_url}{endpoint_prices}?symbols=SCOM,KCB&api_key={key}
  Response:  {"data": [{"symbol": "SCOM", "close": 19.50, "change_percent": 0.51}]}

FCS API (fcsapi.com) docs:
  GET  {base_url}{endpoint_prices}?symbol=AAPL,MSFT&access_key={key}
  Response:  {"response": [{"s": "AAPL", "c": "182.12", "cp": "0.43"}]}
"""

import frappe
from frappe import _
from frappe.utils import now_datetime
import json
import requests as _requests  # noqa: S401 – server-side only


# ── KES exchange rate (used when price is in USD) ─────────────────────────────
# In production, consider fetching this dynamically from a forex provider
_USD_TO_KES = 130.0


def _get_usd_to_kes() -> float:
	"""Return the current USD→KES rate from settings or a safe default."""
	try:
		settings = frappe.get_single("Growe Settings")
		rate = getattr(settings, "usd_to_kes_rate", None)
		if rate and float(rate) > 0:
			return float(rate)
	except Exception:
		pass
	return _USD_TO_KES


# ── Provider loader ───────────────────────────────────────────────────────────

def _get_providers(market_type: str) -> list:
	"""
	Return active Growe Price API providers for the given market_type,
	ordered so 'Both' entries are included.
	"""
	providers = frappe.get_all(
		"Growe Price API",
		filters={"is_active": 1},
		fields=[
			"name", "provider_name", "market_type",
			"api_base_url", "api_key", "endpoint_prices",
			"calls_per_month",
		],
		order_by="creation asc",
	)
	return [
		p for p in providers
		if p.market_type in (market_type, "Both")
	]


# ── Mansa Market API ─────────────────────────────────────────────────────────

def _fetch_mansa(provider: dict, symbols: list) -> dict:
	"""
	Returns {ticker: {"price": float, "change_percent": float, "currency": "KES"}}
	"""
	url = f"{provider['api_base_url'].rstrip('/')}{provider.get('endpoint_prices', '/stocks/prices')}"
	params = {
		"symbols": ",".join(symbols),
		"api_key": provider.get("api_key", ""),
	}
	try:
		resp = _requests.get(url, params=params, timeout=10)
		resp.raise_for_status()
		body = resp.json()
		results = {}
		for item in body.get("data", []):
			ticker = item.get("symbol", "").upper()
			price = float(item.get("close", item.get("price", 0)) or 0)
			change_pct = float(item.get("change_percent", item.get("cp", 0)) or 0)
			if ticker and price:
				results[ticker] = {
					"price": price,
					"change_percent": change_pct,
					"currency": "KES",
				}
		return results
	except Exception as e:
		frappe.log_error(title="Mansa price fetch error", message=str(e))
		return {}


# ── FCS API ───────────────────────────────────────────────────────────────────

def _fetch_fcs(provider: dict, symbols: list) -> dict:
	"""
	Returns {ticker: {"price": float, "change_percent": float, "currency": "USD"}}
	FCS response schema: {"response": [{"s": "AAPL", "c": "182.12", "cp": "0.43"}]}
	"""
	url = f"{provider['api_base_url'].rstrip('/')}{provider.get('endpoint_prices', '/stock/latest')}"
	params = {
		"symbol": ",".join(symbols),
		"access_key": provider.get("api_key", ""),
	}
	try:
		resp = _requests.get(url, params=params, timeout=10)
		resp.raise_for_status()
		body = resp.json()
		results = {}
		for item in body.get("response", []):
			ticker = (item.get("s") or item.get("symbol", "")).upper()
			price = float(item.get("c", item.get("close", 0)) or 0)
			change_pct = float(item.get("cp", item.get("change_percent", 0)) or 0)
			if ticker and price:
				results[ticker] = {
					"price": price,
					"change_percent": change_pct,
					"currency": "USD",
				}
		return results
	except Exception as e:
		frappe.log_error(title="FCS price fetch error", message=str(e))
		return {}


# ── Generic dispatcher ────────────────────────────────────────────────────────

def _fetch_from_provider(provider: dict, symbols: list) -> dict:
	name = (provider.get("provider_name") or "").lower()
	if "mansa" in name:
		return _fetch_mansa(provider, symbols)
	if "fcs" in name:
		return _fetch_fcs(provider, symbols)
	# Unknown provider — skip
	frappe.log_error(
		title="Unknown price provider",
		message=f"No parser for provider: {provider.get('provider_name')}",
	)
	return {}


# ── Price cache upsert ────────────────────────────────────────────────────────

def _upsert_cache(ticker: str, market: str, price_data: dict, usd_to_kes: float, source: str):
	price = price_data["price"]
	currency = price_data.get("currency", "KES")
	change_pct = price_data.get("change_percent", 0.0)

	price_kes = price if currency == "KES" else price * usd_to_kes
	price_usd = price if currency == "USD" else price / usd_to_kes

	if frappe.db.exists("Growe Price Cache", ticker):
		cache = frappe.get_doc("Growe Price Cache", ticker)
	else:
		cache = frappe.new_doc("Growe Price Cache")
		cache.ticker = ticker

	cache.market = market
	cache.price_kes = price_kes
	cache.price_usd = price_usd
	cache.change_percent = change_pct
	cache.source = source
	cache.fetched_at = now_datetime()
	cache.flags.ignore_permissions = True
	cache.save()


# ── Holding value updater ─────────────────────────────────────────────────────

def _update_holdings_for_ticker(ticker: str, price_kes: float):
	"""
	Find all Growe Holding records that reference this ticker with a quantity set,
	and recompute value_kes = quantity * price_kes.
	"""
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
		doc.value_kes = qty * price_kes
		doc.last_updated = now_datetime()
		doc.flags.ignore_permissions = True
		doc.save()


# ── Core fetch & update orchestrator ─────────────────────────────────────────

def _fetch_and_store(market: str, tickers: list) -> dict:
	"""
	Try each active provider for the given market in order.
	Returns a dict of ticker → cached price_kes.
	"""
	if not tickers:
		return {}

	providers = _get_providers(market)
	remaining = list(tickers)
	prices: dict = {}
	usd_to_kes = _get_usd_to_kes()

	for provider in providers:
		if not remaining:
			break
		fetched = _fetch_from_provider(provider, remaining)
		for ticker, data in fetched.items():
			_upsert_cache(ticker, market, data, usd_to_kes, provider["provider_name"])
			prices[ticker] = data["price"] if data.get("currency") == "KES" \
				else data["price"] * usd_to_kes
			if ticker in remaining:
				remaining.remove(ticker)

	return prices


# ── Public API endpoints ──────────────────────────────────────────────────────

@frappe.whitelist()
def refresh_prices():
	"""
	Fetch fresh prices for all tickers referenced in any Growe Holding.
	Upserts Growe Price Cache and recomputes holding values.
	Called by the frontend Refresh button or a scheduled task.
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

	nse_prices = _fetch_and_store("NSE", list(nse_tickers))
	global_prices = _fetch_and_store("Global", list(global_tickers))
	all_prices = {**nse_prices, **global_prices}

	# Update holding values
	for ticker, price_kes in all_prices.items():
		_update_holdings_for_ticker(ticker, price_kes)

	frappe.db.commit()

	return {
		"nse_updated": len(nse_prices),
		"global_updated": len(global_prices),
		"prices": all_prices,
	}


@frappe.whitelist(allow_guest=True)
def get_price_cache():
	"""
	Return all cached prices (public — guest can view market data).
	"""
	records = frappe.get_all(
		"Growe Price Cache",
		fields=["ticker", "market", "price_kes", "price_usd", "change_percent", "source", "fetched_at"],
		order_by="ticker asc",
	)
	return records


@frappe.whitelist(allow_guest=True)
def get_market_indices():
	"""
	Return a curated list of market indices from the price cache.
	These are synthetic tickers like NSE20, SP500, etc.
	Admins should add holdings with those special tickers to populate the cache.
	"""
	index_tickers = ["NSE20", "SP500", "FTSE100", "DAX", "BTC"]
	records = frappe.get_all(
		"Growe Price Cache",
		filters=[["ticker", "in", index_tickers]],
		fields=["ticker", "market", "price_kes", "price_usd", "change_percent", "fetched_at"],
	)
	return records
