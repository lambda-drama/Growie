"""
My Stack API — holdings drill-down, buy/sell ledger, stock creation.
Portfolio updates happen here (buy/sell and new positions).
"""

import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime, today

from growie_app.api.portfolio import (
	_ASSET_CLASS_MAP,
	_ASSET_CLASS_REVERSE,
	_holding_asset_class_slug,
	_load_growe_stock_meta,
	_resolve_asset_category_label,
	_cost_at_avg_kes,
	_holding_to_dict,
	is_open_holding,
	_member_name,
	open_holding_db_filters,
	_price_gain_percent,
	kes_per_unit_foreign,
	_to_kes,
	add_holding,
	search_stocks,
)
from growie_app.investment_app.holding_ledger import create_holding_transaction
from growie_app.api.price import (
	_api_symbol_maps_for_tickers,
	_backfill_price_cache_stock_links,
	_begin_price_refresh_run,
	_enqueue_price_refresh,
	_fetch_market_for_refresh,
	_price_refresh_warnings,
	_stock_meta_for_tickers,
	_update_holdings_for_ticker,
)


def _member_holding_tickers_by_market(
	member: str,
	asset_class: str = None,
	holding_name: str = None,
) -> tuple[list, list]:
	"""
	Split the member's open holdings into NSE vs Global ticker lists for live price fetch.
	Optional asset_class (frontend slug) or holding_name scopes the set.
	"""
	filters = open_holding_db_filters(member)
	if holding_name:
		filters.append(["name", "=", holding_name])

	rows = frappe.get_all(
		"Growe Holding",
		filters=filters,
		fields=["ticker", "asset_class", "asset_name"],
	)
	nse: list = []
	global_: list = []
	seen_nse: set = set()
	seen_global: set = set()

	for r in rows:
		if asset_class:
			row_ac = _holding_asset_class_slug(
				r.asset_class,
				_load_growe_stock_meta(r.asset_name or "", r.ticker or "", r.asset_class),
			)
			if row_ac != asset_class:
				continue
		t = (r.ticker or "").upper().strip()
		if not t:
			continue
		ac = (r.asset_class or "").strip()
		market = ac
		if ac not in ("NSE", "Global", "ETF") and r.asset_name:
			market = frappe.db.get_value("Growe Stock", r.asset_name, "market") or ac
		if market == "NSE":
			if t not in seen_nse:
				seen_nse.add(t)
				nse.append(t)
		elif market in ("Global", "ETF"):
			if t not in seen_global:
				seen_global.add(t)
				global_.append(t)

	return nse, global_


def _asset_class_from_market(market: str) -> str:
	m = (market or "").strip()
	if m == "NSE":
		return "nse-stocks"
	if m == "Global":
		return "global-stocks"
	if m == "ETF":
		return "etf"
	return ""


def _instrument_type_for_market(market: str) -> str:
	m = (market or "").strip()
	return "ETF" if m == "ETF" else "Stock"


def _market_tag_for_holding(holding_doc) -> str:
	ac = holding_doc.asset_class or ""
	if ac == "NSE":
		return "NSE"
	if ac == "Global":
		return "Global"
	if ac == "ETF":
		return "ETF"
	return ""


def _price_in_currency(ticker: str, currency: str, on_date: str) -> float:
	cache = (
		frappe.db.get_value(
			"Growe Price Cache",
			ticker,
			["price_kes", "price_usd"],
			as_dict=True,
		)
		if ticker
		else None
	)
	if not cache:
		return 0.0
	ccy = (currency or "USD").upper()
	if ccy == "KES":
		return float(cache.price_kes or 0)
	if ccy == "USD":
		return float(cache.price_usd or 0)
	kes_px = float(cache.price_kes or 0)
	if kes_px > 0:
		kpu = kes_per_unit_foreign(ccy, on_date, strict=False)
		return kes_px / kpu if kpu > 0 else 0.0
	return 0.0


def _stack_holding_row(h) -> dict:
	row = _holding_to_dict(h)
	qty = float(row.get("quantity") or 0)
	# Legacy field names: amounts follow ``holding.currency`` (often USD from Excel import).
	cost_native = float(row.get("costBasisKES") or 0)
	value_native = float(row.get("valueKES") or 0)
	currency = (row.get("currency") or "USD").upper()
	rate_date = str(today())
	purchase_date = str(row.get("dateAdded") or today())

	if isinstance(h, dict):
		bp = flt(h.get("buying_price"))
		stored_current = flt(h.get("current_price"))
	else:
		bp = flt(getattr(h, "buying_price", None))
		stored_current = flt(getattr(h, "current_price", None))

	avg_buy_native = (cost_native / qty) if qty > 0 else 0
	if bp > 0:
		avg_buy_native = bp

	current_native = _price_in_currency(row.get("ticker") or "", currency, rate_date)
	if current_native <= 0 and stored_current > 0:
		current_native = stored_current
	if current_native <= 0 and qty > 0 and value_native > 0:
		current_native = value_native / qty

	# Prefer market value in holding currency (stored value_kes may be KES after price refresh).
	if current_native > 0 and qty > 0:
		value_native = current_native * qty
	elif value_native <= 0 and qty > 0:
		if current_native > 0:
			value_native = current_native * qty
		elif stored_current > 0:
			value_native = stored_current * qty
			if current_native <= 0:
				current_native = stored_current
		elif avg_buy_native > 0:
			value_native = avg_buy_native * qty

	value_in_kes = (
		value_native
		if currency == "KES"
		else _to_kes(value_native, currency, rate_date, strict=False)
	)

	gain_pct = _price_gain_percent(avg_buy_native, current_native)
	cost_at_avg = _cost_at_avg_kes(qty, avg_buy_native, currency, purchase_date)
	unrealized_kes = value_in_kes - cost_at_avg if cost_at_avg > 0 else value_in_kes - (
		_to_kes(cost_native, currency, rate_date, strict=False) if currency != "KES" else cost_native
	)

	market = row.get("marketTag") or ""
	region = row.get("region") or ""
	exchange_platform = row.get("exchangePlatform") or ""
	sector = row.get("sector") or ""

	if currency != "KES" and value_in_kes <= 0 and value_native > 0:
		from growie_app.api.portfolio import _growe_usd_to_kes_fallback

		if currency == "USD":
			value_in_kes = value_native * _growe_usd_to_kes_fallback()

	row.update(
		{
			"marketTag": market or _market_tag_for_holding(
				frappe._dict(asset_class=_ASSET_CLASS_REVERSE.get(row.get("assetClass"), ""))
			),
			"region": region,
			"exchangePlatform": exchange_platform,
			"sector": sector,
			"instrumentType": row.get("instrumentType") or "stock",
			"broker": (row.get("broker") or "").strip(),
			"avgBuyPrice": round(avg_buy_native, 4),
			"currentPrice": round(current_native, 4),
			"valueNative": round(value_native, 2),
			"valueInKES": round(value_in_kes, 2),
			"valueKES": round(value_native, 2),
			"costAtAvgKES": round(cost_at_avg, 2),
			"gainPercent": round(gain_pct, 2),
			"unrealizedGainKES": round(unrealized_kes, 2),
		}
	)
	return row


def _transaction_to_dict(r) -> dict:
	return {
		"id": r.name,
		"holdingId": r.holding,
		"type": r.transaction_type,
		"quantity": flt(r.quantity),
		"unitPrice": flt(r.unit_price),
		"amount": flt(r.amount),
		"amountKES": flt(r.amount_kes),
		"currency": (r.currency or "USD").upper(),
		"transactionDate": str(r.transaction_date or ""),
		"marketTag": r.market_tag or "",
		"ticker": r.ticker or "",
		"reference": r.reference or "",
		"notes": r.notes or "",
	}


def _assert_holding_owner(holding_name: str, member: str):
	if not frappe.db.exists("Growe Holding", holding_name):
		frappe.throw(_("Holding not found."))
	owner = frappe.db.get_value("Growe Holding", holding_name, "investor")
	if owner != member:
		frappe.throw(_("You are not authorised to access this holding."), frappe.PermissionError)


def _revalue_holding(doc, on_date: str = None):
	"""Refresh value_kes from price cache × quantity."""
	on_date = on_date or str(doc.date_added or today())
	ticker = doc.ticker or ""
	qty = flt(doc.quantity)
	ccy = (doc.currency or "USD").upper()
	if not ticker or qty <= 0:
		return
	px = _price_in_currency(ticker, ccy, on_date)
	if px > 0:
		doc.value_kes = _to_kes(qty * px, ccy, on_date)
		doc.current_price = px
	doc.last_updated = now_datetime()


@frappe.whitelist()
def refresh_stack_prices(asset_class: str = None, holding_name: str = None, sync: int = 0):
	"""
	Fetch live prices for the current member's stack holdings (not the full stock master).

	Uses active Growe Price API providers in order (NSE: RapidAPI first, then Mansa, etc.):
	each provider fills what it can; a second pass retries tickers still missing from cache.
	Upserts Growe Price Cache and recomputes Growe Holding.value_kes for those tickers.

	asset_class: optional frontend slug (nse-stocks, global-stocks, …).
	holding_name: optional single holding — refresh only that position's ticker (runs inline).
	"""
	member = _member_name()
	if holding_name:
		_assert_holding_owner(holding_name, member)
		return _execute_refresh_stack_prices(
			member, asset_class=asset_class, holding_name=holding_name
		)

	if int(sync or 0):
		return _execute_refresh_stack_prices(
			member, asset_class=asset_class, holding_name=holding_name
		)

	job_key = f"{member}:{asset_class or 'all'}"
	_enqueue_price_refresh(
		"growie_app.api.stack._run_refresh_stack_prices",
		f"growie_refresh_stack_prices:{job_key}",
		member=member,
		asset_class=asset_class,
		holding_name=holding_name,
		notify_user=frappe.session.user,
	)
	return {
		"queued": True,
		"message": _(
			"Price refresh started in the background. Updated prices will appear shortly."
		),
	}


def _execute_refresh_stack_prices(
	member: str,
	asset_class: str = None,
	holding_name: str = None,
) -> dict:
	_begin_price_refresh_run()
	nse_tickers, global_tickers = _member_holding_tickers_by_market(
		member, asset_class=asset_class, holding_name=holding_name
	)
	nse_map, global_map = _api_symbol_maps_for_tickers(nse_tickers, global_tickers)
	stock_meta = _stock_meta_for_tickers(list(set(nse_tickers) | set(global_tickers)))

	nse_updated = (
		_fetch_market_for_refresh(
			"NSE", nse_tickers, nse_map, stock_meta=stock_meta
		)
		if nse_tickers
		else 0
	)
	global_updated = (
		_fetch_market_for_refresh(
			"Global", global_tickers, global_map, stock_meta=stock_meta
		)
		if global_tickers
		else 0
	)

	for t in set(nse_tickers) | set(global_tickers):
		cache = frappe.db.get_value("Growe Price Cache", t, "price_kes")
		if cache:
			_update_holdings_for_ticker(t, float(cache))

	_backfill_price_cache_stock_links(
		list(set(nse_tickers) | set(global_tickers)), stock_meta
	)

	frappe.db.commit()

	warnings = _price_refresh_warnings()
	total_updated = nse_updated + global_updated
	result = {
		"nse_updated": nse_updated,
		"global_updated": global_updated,
		"tickers_requested": len(nse_tickers) + len(global_tickers),
		"nse_tickers": nse_tickers,
		"global_tickers": global_tickers,
		"warnings": warnings,
		"success": total_updated > 0 or not (nse_tickers or global_tickers),
	}
	if warnings and total_updated == 0 and (nse_tickers or global_tickers):
		result["error"] = warnings[0]
	return result


def _run_refresh_stack_prices(
	member: str,
	asset_class: str = None,
	holding_name: str = None,
	notify_user: str = None,
) -> dict:
	if notify_user:
		frappe.set_user(notify_user)
	try:
		result = _execute_refresh_stack_prices(
			member, asset_class=asset_class, holding_name=holding_name
		)
		frappe.logger("growie.price").info(
			"Stack price refresh complete (member=%s): NSE=%s Global=%s",
			member,
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
	except Exception as exc:
		frappe.log_error(
			title=f"Stack price refresh job failed ({member})",
			message=frappe.get_traceback(),
		)
		result = {
			"success": False,
			"error": str(exc),
			"warnings": _price_refresh_warnings(),
			"nse_updated": 0,
			"global_updated": 0,
			"member": member,
		}
		if notify_user:
			frappe.publish_realtime(
				"growie_price_refresh_done",
				result,
				user=notify_user,
			)
		return result


@frappe.whitelist()
def get_stack_overview():
	"""Per asset-class aggregates for My Stack landing."""
	member = _member_name()
	rows = frappe.get_all(
		"Growe Holding",
		filters=open_holding_db_filters(member),
		fields=[
			"name",
			"asset_class",
			"asset_name",
			"ticker",
			"value_kes",
			"cost_basis_kes",
			"quantity",
			"currency",
			"date_added",
			"buying_price",
			"sold",
		],
	)

	classes = {
		"nse-stocks": {"assetClass": "nse-stocks", "label": "Stock", "positions": 0, "valueKES": 0, "costKES": 0},
		"global-stocks": {"assetClass": "global-stocks", "label": "Stock", "positions": 0, "valueKES": 0, "costKES": 0},
		"mmf": {"assetClass": "mmf", "label": "Money Market Funds", "positions": 0, "valueKES": 0, "costKES": 0},
		"real-estate": {"assetClass": "real-estate", "label": "Real Estate", "positions": 0, "valueKES": 0, "costKES": 0},
		"etf": {"assetClass": "etf", "label": "ETFs", "positions": 0, "valueKES": 0, "costKES": 0},
	}

	for r in rows:
		row = _stack_holding_row(r)
		ac = row.get("assetClass", "mmf")
		if ac not in classes:
			continue
		classes[ac]["positions"] += 1
		classes[ac]["valueKES"] += flt(row.get("valueInKES") or row.get("valueKES"))
		classes[ac]["costKES"] += flt(row.get("costAtAvgKES") or row.get("costBasisKES"))

	out = []
	for ac in ("nse-stocks", "global-stocks", "etf", "mmf", "real-estate"):
		c = classes[ac]
		cost = c["costKES"]
		val = c["valueKES"]
		c["gainKES"] = val - cost
		c["gainPercent"] = round((c["gainKES"] / cost * 100), 2) if cost > 0 else 0
		out.append(c)
	return out


@frappe.whitelist()
def get_stack_class(asset_class: str):
	"""Holdings for one asset class with summary."""
	member = _member_name()
	if asset_class not in _ASSET_CLASS_REVERSE:
		frappe.throw(_("Unknown asset class."))

	rows = frappe.get_all(
		"Growe Holding",
		filters=open_holding_db_filters(member),
		fields=[
			"name",
			"asset_class",
			"asset_name",
			"ticker",
			"value_kes",
			"cost_basis_kes",
			"quantity",
			"currency",
			"date_added",
			"last_updated",
			"notes",
			"buying_price",
			"broker",
		],
		order_by="date_added desc",
	)

	holdings = [
		h
		for r in rows
		if (h := _stack_holding_row(r)).get("assetClass") == asset_class
	]
	total_value = sum(h.get("valueInKES") or h["valueKES"] for h in holdings)
	total_cost = sum(h.get("costAtAvgKES") or h["costBasisKES"] for h in holdings)
	gain = total_value - total_cost

	return {
		"assetClass": asset_class,
		"label": {
			"nse-stocks": "Stock",
			"global-stocks": "Stock",
			"etf": "ETFs",
			"mmf": "Money market funds",
			"real-estate": "Real estate",
		}.get(asset_class, asset_class),
		"summary": {
			"totalValueKES": round(total_value, 2),
			"totalCostKES": round(total_cost, 2),
			"unrealizedGainKES": round(gain, 2),
			"gainPercent": round((gain / total_cost * 100), 2) if total_cost > 0 else 0,
			"positions": len(holdings),
		},
		"holdings": holdings,
	}


@frappe.whitelist()
def get_stack_position(holding_name: str):
	member = _member_name()
	_assert_holding_owner(holding_name, member)
	row = frappe.db.get_value(
		"Growe Holding",
		holding_name,
		[
			"name",
			"asset_class",
			"asset_name",
			"ticker",
			"value_kes",
			"cost_basis_kes",
			"quantity",
			"currency",
			"date_added",
			"last_updated",
			"notes",
			"buying_price",
			"broker",
			"sold",
			"sold_date",
		],
		as_dict=True,
	)
	if not row or not is_open_holding(row):
		frappe.throw(_("This position has been fully sold."), frappe.DoesNotExistError)
	holding = _stack_holding_row(row)
	txns = frappe.get_all(
		"Growe Holding Transaction",
		filters={"holding": holding_name, "member": member},
		fields=[
			"name",
			"holding",
			"transaction_type",
			"quantity",
			"unit_price",
			"amount",
			"amount_kes",
			"currency",
			"transaction_date",
			"market_tag",
			"ticker",
			"reference",
			"notes",
		],
		order_by="transaction_date desc, creation desc",
	)
	return {
		"holding": holding,
		"transactions": [_transaction_to_dict(t) for t in txns],
	}


@frappe.whitelist()
def create_stock(
	ticker: str,
	company_name: str,
	market: str = "Global",
	currency: str = "USD",
	region: str = None,
	exchange_platform: str = None,
	instrument_type: str = None,
):
	"""
	Create a Growe Stock. Portal users cannot self-create listings — use bulk upload instead.
	System Managers may create verified master records from Desk.
	"""
	from growie_app.utils.stock_verification import member_is_subscribed

	member = _member_name()
	is_admin = "System Manager" in frappe.get_roles(frappe.session.user)

	if not is_admin:
		if not member_is_subscribed(member):
			frappe.throw(
				_(
					"This asset is not supported yet. Upgrade to Pro or Coached to request "
					"missing assets via bulk upload."
				)
			)
		frappe.throw(
			_(
				"This asset is not in the Growe master yet. Use bulk upload to import your "
				"positions — we will verify new tickers and notify you when they are available."
			)
		)

	clean = (ticker or "").strip().upper()
	if not clean:
		frappe.throw(_("Ticker is required."))
	mkt = (market or "Global").strip()
	if mkt not in ("NSE", "Global", "ETF"):
		frappe.throw(_("Market must be NSE, Global, or ETF."))
	if mkt == "NSE":
		region_val = (region or "Kenya").strip()
	elif mkt == "ETF":
		region_val = (region or "USA").strip()
	else:
		region_val = (region or "Global").strip()
	exchange_val = (exchange_platform or mkt).strip()
	instrument_val = (instrument_type or "").strip() or _instrument_type_for_market(mkt)
	if instrument_val and not frappe.db.exists("Growe Asset Category", instrument_val):
		instrument_val = _instrument_type_for_market(mkt)

	existing = frappe.db.get_value("Growe Stock", {"ticker": clean, "market": mkt}, "name")
	if existing:
		return {
			"name": existing,
			"ticker": clean,
			"company_name": frappe.db.get_value("Growe Stock", existing, "company_name"),
			"market": mkt,
			"currency": frappe.db.get_value("Growe Stock", existing, "currency") or currency,
			"region": frappe.db.get_value("Growe Stock", existing, "region") or region_val,
			"exchange_platform": frappe.db.get_value("Growe Stock", existing, "exchange_platform") or exchange_val,
			"instrument_type": frappe.db.get_value("Growe Stock", existing, "instrument_type") or instrument_val,
			"assetClass": _asset_class_from_market(mkt),
			"created": False,
		}

	doc = frappe.get_doc(
		{
			"doctype": "Growe Stock",
			"ticker": clean,
			"company_name": (company_name or clean).strip()[:240],
			"market": mkt,
			"instrument_type": instrument_val,
			"currency": (currency or "USD").upper(),
			"region": region_val,
			"exchange_platform": exchange_val,
			"is_active": 1,
			"verified": 1,
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()
	frappe.db.commit()
	return {
		"name": doc.name,
		"ticker": doc.ticker,
		"company_name": doc.company_name,
		"market": doc.market,
		"currency": doc.currency,
		"region": doc.region,
		"exchange_platform": doc.exchange_platform,
		"assetClass": _asset_class_from_market(doc.market),
		"created": True,
	}


@frappe.whitelist()
def get_regions(query: str = "", limit: int = 50):
	filters = {}
	if query:
		return frappe.db.sql(
			"""
			SELECT name
			FROM `tabGrowe Region`
			WHERE name LIKE %(q)s
			ORDER BY name ASC
			LIMIT %(limit)s
			""",
			{"q": f"%{query}%", "limit": int(limit)},
			as_dict=True,
		)
	return frappe.get_all("Growe Region", filters=filters, fields=["name"], order_by="name asc", limit=int(limit))


@frappe.whitelist()
def get_exchange_platforms(query: str = "", limit: int = 50):
	filters = {}
	if query:
		return frappe.db.sql(
			"""
			SELECT name
			FROM `tabGrowe Exchange Platform`
			WHERE name LIKE %(q)s
			ORDER BY name ASC
			LIMIT %(limit)s
			""",
			{"q": f"%{query}%", "limit": int(limit)},
			as_dict=True,
		)
	return frappe.get_all(
		"Growe Exchange Platform",
		filters=filters,
		fields=["name"],
		order_by="name asc",
		limit=int(limit),
	)


@frappe.whitelist()
def seed_region_exchange_masters():
	"""Create baseline Region + Exchange master rows if missing."""
	regions = ["USA", "Africa", "Asia", "Europe", "Middle East"]
	exchanges = ["NSE", "NYSE", "NASDAQ", "LSE", "Euronext", "JPX", "HKEX", "JSE"]

	for name in regions:
		if not frappe.db.exists("Growe Region", name):
			doc = frappe.get_doc({"doctype": "Growe Region", "region_name": name})
			doc.flags.ignore_permissions = True
			doc.insert()

	for name in exchanges:
		if not frappe.db.exists("Growe Exchange Platform", name):
			doc = frappe.get_doc(
				{"doctype": "Growe Exchange Platform", "platform_name": name}
			)
			doc.flags.ignore_permissions = True
			doc.insert()

	frappe.db.commit()
	return {"regions_seeded": len(regions), "exchanges_seeded": len(exchanges)}


@frappe.whitelist()
def migrate_etf_market_and_asset_class(dry_run: int = 0):
	"""
	Move legacy ETF listings from sector=ETF under Global market to market=ETF + asset class ETF.
	Run: bench --site SITE execute growie_app.api.stack.migrate_etf_market_and_asset_class
	"""
	stocks = frappe.get_all(
		"Growe Stock",
		filters={"sector": "ETF"},
		fields=["name", "ticker", "market"],
	)
	stock_updates = 0
	holding_updates = 0
	for row in stocks:
		if (row.market or "").strip() != "ETF":
			if not dry_run:
				frappe.db.set_value("Growe Stock", row.name, "market", "ETF", update_modified=False)
			stock_updates += 1
		count = frappe.db.count("Growe Holding", {"asset_name": row.name, "sold": 0})
		if count:
			if not dry_run:
				frappe.db.sql(
					"""
					UPDATE `tabGrowe Holding`
					SET asset_class = 'ETF'
					WHERE asset_name = %s AND IFNULL(sold, 0) = 0
					""",
					(row.name,),
				)
			holding_updates += count

	if not dry_run:
		frappe.db.commit()

	return {
		"stocks_updated": stock_updates,
		"holdings_updated": holding_updates,
		"dry_run": bool(dry_run),
	}


@frappe.whitelist()
def migrate_growe_stock_instrument_type(dry_run: int = 0):
	"""
	Set Growe Stock instrument_type (Stock | ETF) from market / legacy sector.
	bench --site SITE execute growie_app.api.stack.migrate_growe_stock_instrument_type
	"""
	rows = frappe.get_all(
		"Growe Stock",
		fields=["name", "market", "sector", "instrument_type"],
		limit=0,
	)
	updated = 0
	for row in rows:
		market = (row.get("market") or "").strip()
		sector = (row.get("sector") or "").strip().upper()
		want = "ETF" if market == "ETF" or sector == "ETF" else "Stock"
		cur = (row.get("instrument_type") or "").strip()
		if cur == want:
			continue
		if not dry_run:
			frappe.db.set_value(
				"Growe Stock", row["name"], "instrument_type", want, update_modified=False
			)
		updated += 1
	if not dry_run:
		frappe.db.commit()
	return {"updated": updated, "dry_run": bool(dry_run)}


def _infer_region_exchange_for_stock(stock: dict) -> tuple[str, str]:
	"""Infer region/exchange for a Growe Stock using market + api symbol hints."""
	market = (stock.get("market") or "").strip()
	api_symbol = (stock.get("api_symbol") or "").strip().upper()
	ticker = (stock.get("ticker") or "").strip().upper()
	sector = (stock.get("sector") or "").strip().upper()

	if market == "NSE":
		return "Africa", "NSE"

	instrument = (stock.get("instrument_type") or "").strip()
	if market == "ETF" or instrument == "ETF" or sector == "ETF":
		if api_symbol and ":" in api_symbol:
			pfx = api_symbol.split(":", 1)[0]
			if pfx in ("NASDAQ", "NYSE", "AMEX"):
				return "USA", pfx
		return "USA", "NYSE"

	for sym in (api_symbol, ticker):
		if sym and (sym.endswith(".NR") or sym.endswith(".NBO")):
			return "Africa", "NSE"

	if api_symbol:
		if ":" in api_symbol:
			pfx = api_symbol.split(":", 1)[0]
			if pfx in ("NASDAQ", "NYSE", "AMEX"):
				return "USA", pfx
			if pfx in ("LSE", "EURONEXT", "XETRA"):
				return "Europe", pfx
			if pfx in ("JSE",):
				return "Africa", pfx
			if pfx in ("HKEX", "JPX", "TSE"):
				return "Asia", "JPX" if pfx == "TSE" else pfx

		if api_symbol.endswith(".L"):
			return "Europe", "LSE"
		if api_symbol.endswith(".PA"):
			return "Europe", "Euronext"
		if api_symbol.endswith(".AS"):
			return "Europe", "Euronext"
		if api_symbol.endswith(".DE"):
			return "Europe", "XETRA"
		if api_symbol.endswith(".TO"):
			return "USA", "NYSE"
		if api_symbol.endswith(".HK"):
			return "Asia", "HKEX"
		if api_symbol.endswith(".JO"):
			return "Africa", "JSE"

	if ticker.endswith(".L"):
		return "Europe", "LSE"
	if ticker.endswith(".HK"):
		return "Asia", "HKEX"
	if ticker.endswith(".JO"):
		return "Africa", "JSE"

	# Default for Global/unknown market stocks.
	return "USA", "NASDAQ"


@frappe.whitelist()
def backfill_stock_region_exchange(dry_run: int = 0, force: int = 0):
	"""
	Backfill region + exchange_platform for all Growe Stock records.

	bench --site SITE execute growie_app.api.stack.backfill_stock_region_exchange
	bench --site SITE execute growie_app.api.stack.backfill_stock_region_exchange --kwargs '{"force": 1}'
	"""
	rows = frappe.get_all(
		"Growe Stock",
		fields=["name", "market", "ticker", "api_symbol", "sector", "region", "exchange_platform"],
		limit=0,
	)
	changed = 0
	unchanged = 0
	skipped = 0
	updates = []
	do_commit = int(dry_run or 0) == 0
	reapply = int(force or 0) == 1

	for row in rows:
		cur_region = (row.get("region") or "").strip()
		cur_exchange = (row.get("exchange_platform") or "").strip()
		region, exchange = _infer_region_exchange_for_stock(row)
		if not region or not exchange:
			skipped += 1
			continue

		new_region = region if reapply else (cur_region or region)
		new_exchange = exchange if reapply else (cur_exchange or exchange)

		if cur_region == new_region and cur_exchange == new_exchange:
			unchanged += 1
			continue

		if do_commit:
			frappe.db.set_value("Growe Stock", row["name"], "region", new_region, update_modified=False)
			frappe.db.set_value(
				"Growe Stock",
				row["name"],
				"exchange_platform",
				new_exchange,
				update_modified=False,
			)
		changed += 1
		if len(updates) < 50:
			updates.append(
				{
					"name": row["name"],
					"ticker": row.get("ticker"),
					"region": new_region,
					"exchange_platform": new_exchange,
				}
			)

	if do_commit:
		frappe.db.commit()

	return {
		"dry_run": not do_commit,
		"force": reapply,
		"total": len(rows),
		"changed": changed,
		"unchanged": unchanged,
		"skipped": skipped,
		"sample_updates": updates,
	}


def _infer_asset_class_from_stock(asset_name: str) -> tuple[str, str]:
	market = frappe.db.get_value("Growe Stock", asset_name, "market") or ""
	return _asset_class_from_market(market), market


def _native_unit_price_from_kes(cost_kes: float, qty: float, currency: str, on_date: str) -> float:
	if qty <= 0:
		return 0.0
	ccy = (currency or "KES").upper()
	if ccy == "KES":
		return cost_kes / qty
	kpu = _to_kes(1, ccy, on_date)
	return (cost_kes / qty) / kpu if kpu > 0 else 0.0


@frappe.whitelist()
def infer_asset_class(asset_name: str):
	"""Return frontend asset class slug from Growe Stock market."""
	_member_name()
	if not frappe.db.exists("Growe Stock", asset_name):
		frappe.throw(_("Stock not found."))
	ac, market = _infer_asset_class_from_stock(asset_name)
	meta = frappe.db.get_value(
		"Growe Stock",
		asset_name,
		["region", "exchange_platform"],
		as_dict=True,
	) or {}
	return {
		"assetClass": ac,
		"market": market,
		"marketTag": market,
		"region": meta.get("region") or "",
		"exchangePlatform": meta.get("exchange_platform") or "",
	}


@frappe.whitelist()
def record_buy(
	quantity: float,
	unit_price: float = None,
	asset_class: str = None,
	asset_name: str = None,
	holding_name: str = None,
	currency: str = "USD",
	transaction_date: str = None,
	notes: str = None,
	reference: str = None,
):
	member = _member_name()
	qty = flt(quantity)
	if qty <= 0:
		frappe.throw(_("Quantity must be greater than zero."))

	use_date = getdate(transaction_date or today())
	date_str = str(use_date)
	ccy = (currency or "USD").upper()
	unit = flt(unit_price)
	add_to_existing = bool(holding_name)

	if add_to_existing:
		_assert_holding_owner(holding_name, member)
		doc = frappe.get_doc("Growe Holding", holding_name)
	else:
		if not asset_name:
			frappe.throw(_("Select a stock or fund for this buy."))
		if not asset_class:
			asset_class, _m = _infer_asset_class_from_stock(asset_name)
		ac_label = _resolve_asset_category_label(asset_class)

		if unit <= 0:
			created = add_holding(
				asset_class=ac_label,
				asset_name=asset_name,
				currency=ccy,
				quantity=qty,
				notes=notes or "",
				date_added=date_str,
			)
			holding_name = created["id"]
			doc = frappe.get_doc("Growe Holding", holding_name)
		else:
			cost_kes = _to_kes(qty * unit, ccy, date_str)
			ticker = frappe.db.get_value("Growe Stock", asset_name, "ticker") or ""
			doc = frappe.get_doc(
				{
					"doctype": "Growe Holding",
					"investor": member,
					"asset_class": ac_label,
					"asset_name": asset_name,
					"ticker": ticker,
					"quantity": qty,
					"currency": ccy,
					"cost_basis_kes": cost_kes,
					"value_kes": cost_kes,
					"buying_price": unit,
					"date_added": use_date,
					"notes": notes or "",
					"last_updated": now_datetime(),
				}
			)
			doc.flags.ignore_permissions = True
			doc.insert()
			_revalue_holding(doc, date_str)
			doc.flags.ignore_permissions = True
			doc.save()
			holding_name = doc.name

	if add_to_existing:
		if unit <= 0:
			unit = flt(doc.buying_price) or _native_unit_price_from_kes(
				flt(doc.cost_basis_kes), flt(doc.quantity), ccy, date_str
			)
		if unit <= 0:
			unit = _price_in_currency(doc.ticker or "", ccy, date_str)
		add_cost_kes = _to_kes(qty * unit, ccy, date_str)
		doc.quantity = flt(doc.quantity) + qty
		doc.cost_basis_kes = flt(doc.cost_basis_kes) + add_cost_kes
		doc.buying_price = _native_unit_price_from_kes(doc.cost_basis_kes, doc.quantity, ccy, date_str)
		doc.sold = 0
		doc.sold_date = None
		_revalue_holding(doc, date_str)
		doc.flags.ignore_permissions = True
		doc.save()

	if unit <= 0:
		unit = _native_unit_price_from_kes(flt(doc.cost_basis_kes), flt(doc.quantity), ccy, date_str)

	txn = create_holding_transaction(
		member=member,
		holding_name=holding_name,
		transaction_type="Buy",
		quantity=qty,
		unit_price=unit,
		currency=ccy,
		transaction_date=use_date,
		holding_doc=doc,
		reference=reference or "",
		notes=notes or "",
	)
	frappe.db.commit()

	return {
		"transaction": _transaction_to_dict(txn),
		"holding": _stack_holding_row(
			frappe.db.get_value("Growe Holding", holding_name, "*", as_dict=True)
		),
	}


@frappe.whitelist()
def record_sell(
	holding_name: str,
	quantity: float,
	unit_price: float = None,
	transaction_date: str = None,
	notes: str = None,
	reference: str = None,
):
	member = _member_name()
	_assert_holding_owner(holding_name, member)
	doc = frappe.get_doc("Growe Holding", holding_name)
	if not is_open_holding(doc):
		frappe.throw(_("This position is already fully sold."))

	qty = flt(quantity)
	if qty <= 0:
		frappe.throw(_("Quantity must be greater than zero."))
	if qty > flt(doc.quantity):
		frappe.throw(_("Cannot sell more than your current quantity."))

	use_date = getdate(transaction_date or today())
	ccy = (doc.currency or "USD").upper()
	unit = flt(unit_price)
	if unit <= 0:
		unit = _price_in_currency(doc.ticker or "", ccy, str(use_date))

	old_qty = flt(doc.quantity)
	old_cost = flt(doc.cost_basis_kes)
	cost_removed = (old_cost / old_qty * qty) if old_qty > 0 else 0

	doc.quantity = old_qty - qty
	doc.cost_basis_kes = max(old_cost - cost_removed, 0)

	if doc.quantity <= 0:
		doc.quantity = 0
		doc.cost_basis_kes = 0
		doc.sold = 1
		doc.sold_date = use_date
		doc.value_kes = 0
	else:
		doc.sold = 0
		doc.sold_date = None
		_revalue_holding(doc, str(use_date))
		if doc.quantity > 0 and doc.buying_price:
			pass
		elif doc.quantity > 0:
			kpu = kes_per_unit_foreign(ccy, str(use_date), strict=False) if ccy != "KES" else 1
			doc.buying_price = (flt(doc.cost_basis_kes) / flt(doc.quantity)) / kpu if ccy != "KES" else flt(doc.cost_basis_kes) / flt(doc.quantity)

	doc.flags.ignore_permissions = True
	doc.save()

	txn = create_holding_transaction(
		member=member,
		holding_name=holding_name,
		transaction_type="Sell",
		quantity=qty,
		unit_price=unit,
		currency=ccy,
		transaction_date=use_date,
		holding_doc=doc,
		reference=reference or "",
		notes=notes or "",
	)
	frappe.db.commit()

	return {
		"transaction": _transaction_to_dict(txn),
		"holding": _stack_holding_row(frappe.db.get_value("Growe Holding", holding_name, "*", as_dict=True)),
	}


def _recompute_holding_from_transactions(holding_name: str):
	"""Rebuild holding qty/cost/sold state from remaining ledger rows."""
	doc = frappe.get_doc("Growe Holding", holding_name)
	txns = frappe.get_all(
		"Growe Holding Transaction",
		filters={"holding": holding_name},
		fields=["transaction_type", "quantity", "amount_kes", "transaction_date"],
		order_by="transaction_date asc, creation asc",
	)

	qty = 0.0
	cost = 0.0
	last_sell_date = None
	for t in txns:
		q = flt(t.quantity)
		if (t.transaction_type or "").strip() == "Buy":
			qty += q
			cost += flt(t.amount_kes)
		else:
			if qty > 0:
				cost_removed = (cost / qty) * q
				cost = max(cost - cost_removed, 0)
			qty -= q
			last_sell_date = t.transaction_date

	ccy = (doc.currency or "USD").upper()
	date_str = str(today())

	if qty <= 0:
		doc.quantity = 0
		doc.cost_basis_kes = 0
		doc.value_kes = 0
		doc.buying_price = 0
		doc.sold = 1
		doc.sold_date = last_sell_date or doc.sold_date
	else:
		doc.quantity = qty
		doc.cost_basis_kes = cost
		doc.sold = 0
		doc.sold_date = None
		_revalue_holding(doc, date_str)
		doc.buying_price = _native_unit_price_from_kes(cost, qty, ccy, date_str)

	doc.last_updated = now_datetime()
	doc.flags.ignore_permissions = True
	doc.save()
	return doc


@frappe.whitelist()
def delete_holding_transaction(transaction_name: str):
	"""Delete a buy/sell ledger row and recalculate the linked holding."""
	member = _member_name()
	if not transaction_name or not frappe.db.exists("Growe Holding Transaction", transaction_name):
		frappe.throw(_("Transaction not found."))

	txn = frappe.get_doc("Growe Holding Transaction", transaction_name)
	if txn.member != member:
		frappe.throw(_("You are not authorised to delete this transaction."), frappe.PermissionError)

	holding_name = txn.holding
	_assert_holding_owner(holding_name, member)

	frappe.delete_doc("Growe Holding Transaction", transaction_name, force=1)
	doc = _recompute_holding_from_transactions(holding_name)
	frappe.db.commit()

	holding_row = None
	fully_removed = False
	if frappe.db.exists("Growe Holding", holding_name):
		row = frappe.db.get_value("Growe Holding", holding_name, "*", as_dict=True)
		if row and is_open_holding(row):
			holding_row = _stack_holding_row(row)
		else:
			fully_removed = True
	else:
		fully_removed = True

	return {
		"deleted": transaction_name,
		"holding": holding_row,
		"fullyRemoved": fully_removed,
	}


# Re-export stock search for frontend
get_stocks = search_stocks
