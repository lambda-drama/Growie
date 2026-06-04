"""
Portfolio API — CRUD for Growe Holding + portfolio summary + stock search.
All endpoints require an authenticated session unless noted.
"""

import frappe
from frappe import _
from frappe.utils import add_days, flt, get_datetime_str, get_first_day, getdate, now_datetime, today

_USD_TO_KES_FALLBACK = 130.0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _member_name() -> str:
	"""Return the Growe Member name for the current user, or raise."""
	email = frappe.session.user
	if email == "Guest":
		frappe.throw(_("Please log in to access your portfolio."), frappe.AuthenticationError)
	member = frappe.db.get_value("Growe Member", {"user": email}, "name")
	if not member:
		frappe.throw(_("Growe Member profile not found."))
	return member


_ASSET_CLASS_MAP = {
	"MMF": "mmf",
	"Real Estate": "real-estate",
	"NSE": "nse-stocks",
	"Global": "global-stocks",
	"ETF": "etf",
}

_ASSET_CLASS_REVERSE = {v: k for k, v in _ASSET_CLASS_MAP.items()}


def open_holding_db_filters(investor: str, asset_class_label: str | None = None) -> list:
	"""Frappe filters for open positions (shown in UI totals and lists)."""
	filters = [
		["investor", "=", investor],
		["sold", "=", 0],
		["quantity", ">", 0],
	]
	if asset_class_label:
		filters.append(["asset_class", "=", asset_class_label])
	return filters


def is_open_holding(doc) -> bool:
	"""True when the position is not fully sold and still has quantity."""
	if isinstance(doc, dict):
		sold = int(doc.get("sold") or 0)
		qty = flt(doc.get("quantity"))
	else:
		sold = int(getattr(doc, "sold", None) or 0)
		qty = flt(getattr(doc, "quantity", None))
	return sold == 0 and qty > 0


def _load_growe_stock_meta(stock_name: str, ticker: str, asset_class_label: str = None) -> dict:
	"""
	Load Growe Stock metadata for a holding.
	If the linked stock's ticker disagrees with the holding ticker, resolve by holding ticker instead
	(avoid classifying SCOM as an ETF when asset_name points at the wrong stock).
	"""
	fields = [
		"ticker",
		"company_name",
		"market",
		"instrument_type",
		"region",
		"exchange_platform",
		"sector",
		"industry",
		"instrument_type",
	]
	stock_name = (stock_name or "").strip()
	ticker = (ticker or "").strip().upper()
	stock = None

	if stock_name:
		stock = frappe.db.get_value("Growe Stock", stock_name, fields, as_dict=True)
		if stock and ticker and (stock.get("ticker") or "").strip().upper() != ticker:
			stock = None

	if not stock and ticker:
		filters = {"ticker": ticker, "is_active": 1}
		if asset_class_label == "NSE Stocks":
			filters["market"] = "NSE"
		elif asset_class_label == "Global Stocks":
			filters["market"] = "Global"
		elif asset_class_label == "ETF":
			filters["market"] = "ETF"
		stock = frappe.db.get_value("Growe Stock", filters, fields, as_dict=True)
		if not stock:
			stock = frappe.db.get_value("Growe Stock", {"ticker": ticker, "is_active": 1}, fields, as_dict=True)

	return stock or {}


def _instrument_type_slug(stock: dict) -> str:
	"""Frontend slug: stock | etf (from Growe Stock instrument_type)."""
	if not stock:
		return "stock"
	it = (stock.get("instrument_type") or "").strip()
	if it == "ETF":
		return "etf"
	if it == "Stock":
		return "stock"
	if (stock.get("market") or "").strip() == "ETF":
		return "etf"
	return "stock"


def previous_calendar_month_end(on_date=None) -> str:
	"""ISO date string for the last day of the calendar month before ``on_date``."""
	ref = getdate(on_date or today())
	first_of_month = get_first_day(ref)
	return str(add_days(first_of_month, -1))


def _holding_value_kes(h: dict) -> float:
	return float(h.get("valueInKES") or h.get("valueKES") or 0)


def _holding_cost_kes(h: dict) -> float:
	return float(h.get("costAtAvgKES") or h.get("costBasisKES") or 0)


def _portfolio_value_at_date(holdings: list, as_of) -> float:
	"""
	Estimate total portfolio market value (KES) on ``as_of`` using each lot's
	purchase date, cost, and today's refreshed value (linear in time).
	Used when no stored snapshot exists for that date.
	"""
	as_of_d = getdate(as_of)
	as_of_ts = as_of_d.toordinal()
	now_d = getdate(today())
	now_ts = now_d.toordinal()
	total = 0.0
	for h in holdings:
		added = getdate(h.get("dateAdded") or today())
		if added.toordinal() > as_of_ts:
			continue
		market_now = _holding_value_kes(h)
		cost = _holding_cost_kes(h)
		if market_now <= 0 and cost <= 0:
			continue
		if now_ts <= added.toordinal():
			total += cost if cost > 0 else market_now
			continue
		if as_of_ts >= now_ts:
			total += market_now
			continue
		span = max(1, now_ts - added.toordinal())
		frac = min(1.0, max(0.0, (as_of_ts - added.toordinal()) / span))
		total += cost + (market_now - cost) * frac
	return total


def record_portfolio_snapshot(
	member: str,
	holdings: list,
	snapshot_date=None,
	total_value_kes: float = None,
	total_cost_kes: float = None,
):
	"""Upsert a daily portfolio total for month-over-month comparisons."""
	snap_date = getdate(snapshot_date or today())
	val = flt(total_value_kes)
	if val <= 0 and holdings:
		val = sum(_holding_value_kes(h) for h in holdings)
	cost = flt(total_cost_kes)
	if cost <= 0 and holdings:
		cost = sum(_holding_cost_kes(h) for h in holdings)
	positions = len(holdings) if holdings else 0

	existing = frappe.db.get_value(
		"Growe Portfolio Snapshot",
		{"member": member, "snapshot_date": snap_date},
		"name",
	)
	payload = {
		"member": member,
		"snapshot_date": snap_date,
		"total_value_kes": round(val, 2),
		"total_cost_kes": round(cost, 2),
		"positions": positions,
	}
	if existing:
		frappe.db.set_value("Growe Portfolio Snapshot", existing, payload, update_modified=True)
	else:
		doc = frappe.get_doc({"doctype": "Growe Portfolio Snapshot", **payload})
		doc.flags.ignore_permissions = True
		doc.insert()
	frappe.db.commit()


def compute_monthly_growth(member: str, holdings: list) -> dict:
	"""
	Month-over-month: portfolio value on the last calendar day of the prior month vs today.
	Uses a stored snapshot when available; otherwise estimates value at that date.
	"""
	value_now = sum(_holding_value_kes(h) for h in holdings)
	as_of = previous_calendar_month_end()
	value_then = frappe.db.get_value(
		"Growe Portfolio Snapshot",
		{"member": member, "snapshot_date": as_of},
		"total_value_kes",
	)
	source = "snapshot"
	if value_then is None:
		value_then = _portfolio_value_at_date(holdings, as_of)
		source = "estimated"
	value_then = flt(value_then)
	growth_kes = value_now - value_then
	growth_pct = (growth_kes / value_then * 100) if value_then > 0 else (100.0 if value_now > 0 else 0.0)
	return {
		"monthlyGrowthKES": round(growth_kes, 2),
		"monthlyGrowthPercent": round(growth_pct, 2),
		"monthlyGrowthCompareDate": as_of,
		"monthlyGrowthValueThenKES": round(value_then, 2),
		"monthlyGrowthValueNowKES": round(value_now, 2),
		"monthlyGrowthSource": source,
	}


def record_all_member_portfolio_snapshots():
	"""Daily job: snapshot open-holding totals for every member with positions."""
	from growie_app.api.stack import _stack_holding_row

	members = frappe.get_all("Growe Member", pluck="name")
	for member in members:
		rows = frappe.get_all(
			"Growe Holding",
			filters=open_holding_db_filters(member),
			fields=[
				"name",
				"asset_class",
				"asset_name",
				"value_kes",
				"cost_basis_kes",
				"quantity",
				"ticker",
				"date_added",
				"currency",
				"buying_price",
				"sold",
			],
		)
		if not rows:
			continue
		holdings = [_stack_holding_row(r) for r in rows]
		record_portfolio_snapshot(member, holdings)


def _holding_to_dict(h) -> dict:
	"""Convert a Frappe Growe Holding row to the frontend shape."""
	stock_name = h.get("asset_name") or ""
	display_name = stock_name
	ticker = h.get("ticker") or ""
	stock = _load_growe_stock_meta(stock_name, ticker, h.get("asset_class"))
	if stock:
		display_name = stock.get("company_name") or stock_name
		ticker = ticker or stock.get("ticker") or ""

	# Latest cached price for this ticker
	price_kes = None
	change_percent = None
	if ticker:
		cache = frappe.db.get_value(
			"Growe Price Cache",
			ticker,
			["price_kes", "change_percent"],
			as_dict=True,
		)
		if cache:
			price_kes = cache.price_kes
			change_percent = cache.change_percent

	return {
		"id": h.get("name"),
		"name": display_name,
		"stockName": stock_name,           # the Link value (Growe Stock name)
		"assetClass": _ASSET_CLASS_MAP.get(h.get("asset_class"), "mmf"),
		"valueKES": float(h.get("value_kes") or 0),
		"value": float(h.get("value_kes") or 0),  # forward-compatible alias
		"costBasisKES": float(h.get("cost_basis_kes") or 0),
		"costBasis": float(h.get("cost_basis_kes") or 0),  # forward-compatible alias
		"quantity": float(h.get("quantity") or 0),
		"ticker": ticker,
		"marketTag": (stock.get("market") if stock else "") or "",
		"region": (stock.get("region") if stock else "") or "",
		"exchangePlatform": (stock.get("exchange_platform") if stock else "") or "",
		"sector": (stock.get("sector") if stock else "") or "",
		"industry": (stock.get("industry") if stock else "") or "",
		"assetCategory": (stock.get("instrument_type") if stock else "") or "",
		"instrumentType": _instrument_type_slug(stock),
		"broker": (h.get("broker") or "").strip(),
		"dateAdded": str(h.get("date_added") or today()),
		"lastUpdated": str(h.get("last_updated") or ""),
		"notes": h.get("notes") or "",
		"currentPriceKES": float(price_kes or 0),
		"changePercent": float(change_percent or 0),
		"currency": h.get("currency") or "USD",
	}


def _price_gain_percent(avg_buy: float, current: float) -> float:
	"""Unrealized % from average buy price vs current price per share."""
	if avg_buy <= 0:
		return 0.0
	return (current - avg_buy) / avg_buy * 100.0


def _cost_at_avg_kes(
	qty: float,
	avg_buy_native: float,
	currency: str,
	purchase_date: str,
) -> float:
	"""Total cost in KES at average buy price (qty × avg buy), for P&L vs current value."""
	if qty <= 0 or avg_buy_native <= 0:
		return 0.0
	amount_native = qty * avg_buy_native
	currency = (currency or "USD").upper()
	if currency == "KES":
		return flt(amount_native)
	kpu = kes_per_unit_foreign(currency, purchase_date, strict=False)
	return flt(amount_native * kpu) if kpu > 0 else 0.0


def _growe_usd_to_kes_fallback() -> float:
	"""Last-resort USD→KES when ERPNext has no row for the requested date."""
	try:
		settings = frappe.get_single("Growe Settings")
		rate = flt(getattr(settings, "usd_to_kes_rate", None))
		if rate > 0:
			return rate
	except Exception:
		pass
	return _USD_TO_KES_FALLBACK


def _erpnext_currency_exchange_available() -> bool:
	"""True when ERPNext Currency Exchange doctype exists on this site."""
	return bool(frappe.db.table_exists("Currency Exchange"))


def _accounts_settings_exchange_prefs() -> tuple[bool, int]:
	"""(allow_stale, stale_days) from ERPNext Accounts Settings, with safe defaults."""
	if not frappe.db.table_exists("Accounts Settings"):
		return True, 365
	try:
		currency_settings = frappe.get_cached_doc("Accounts Settings")
		allow_stale = bool(currency_settings.get("allow_stale"))
		stale_days = int(flt(currency_settings.get("stale_days")) or 365)
		return allow_stale, max(stale_days, 1)
	except Exception:
		return True, 365


def _currency_exchange_db_rate(
	from_currency: str, to_currency: str, transaction_date, args: str = None
) -> float:
	"""
	Look up Currency Exchange in the database only (no Frankfurt API — avoids msgprint noise).

	Works without importing erpnext.setup.utils (avoids ImportError on sites missing ERPNext).
	"""
	if not (from_currency and to_currency):
		return 0.0
	if from_currency == to_currency:
		return 1.0
	if not _erpnext_currency_exchange_available():
		return 0.0

	tx_date = getdate(transaction_date or today())
	allow_stale, stale_days = _accounts_settings_exchange_prefs()

	filters = [
		["date", "<=", get_datetime_str(tx_date)],
		["from_currency", "=", from_currency],
		["to_currency", "=", to_currency],
	]
	if args == "for_buying":
		filters.append(["for_buying", "=", 1])
	elif args == "for_selling":
		filters.append(["for_selling", "=", 1])

	if not allow_stale:
		checkpoint = add_days(tx_date, -stale_days)
		filters.append(["date", ">", get_datetime_str(checkpoint)])

	try:
		entries = frappe.get_all(
			"Currency Exchange",
			fields=["exchange_rate"],
			filters=filters,
			order_by="date desc",
			limit=1,
		)
		if entries:
			return flt(entries[0].exchange_rate)
	except Exception:
		pass
	return 0.0


def _resolve_rate_to_kes(from_currency: str, on_date: str = None) -> float:
	"""
	Return how many KES equal 1 unit of from_currency.

	Tries direct and inverse Currency Exchange rows, multiple date fallbacks, then Growe Settings for USD.
	Does not call ERPNext's get_exchange_rate API path (which msgprints when Frankfurt fails).
	"""
	src = (from_currency or "KES").upper().strip()
	if src == "KES":
		return 1.0

	requested = str(getdate(on_date or today()))
	dates_to_try = [requested]
	if requested != str(today()):
		dates_to_try.append(str(today()))

	for date_str in dates_to_try:
		for args in (None, "for_buying", "for_selling"):
			direct = _currency_exchange_db_rate(src, "KES", date_str, args)
			if direct > 0:
				return direct
			inverse = _currency_exchange_db_rate("KES", src, date_str, args)
			if inverse > 0:
				return 1.0 / inverse

	if src == "USD":
		return _growe_usd_to_kes_fallback()

	# Bridge via USD using DB rows when available (e.g. EUR→USD × USD→KES).
	usd_kes = _growe_usd_to_kes_fallback()
	for date_str in dates_to_try:
		for args in (None, "for_buying", "for_selling"):
			to_usd = _currency_exchange_db_rate(src, "USD", date_str, args)
			if to_usd > 0:
				return to_usd * usd_kes
			from_usd = _currency_exchange_db_rate("USD", src, date_str, args)
			if from_usd > 0:
				return usd_kes / from_usd

	return 0.0


def kes_per_unit_foreign(from_currency: str, on_date: str = None, *, strict: bool = False) -> float:
	"""
	How many KES equal 1 unit of from_currency.

	strict=False: never throw; use Growe Settings USD rate as last resort (for UI display).
	strict=True: throw if no rate (for trades / accounting).
	"""
	src = (from_currency or "KES").upper().strip()
	if src == "KES":
		return 1.0

	rate = _resolve_rate_to_kes(src, on_date)
	if rate > 0:
		return rate

	if strict:
		frappe.throw(
			_("No exchange rate configured from {0} to KES on {1}. Please configure Currency Exchange in ERPNext or set USD to KES in Growe Settings.")
			.format(src, on_date or today())
		)

	# Display / read paths: show holdings even when Currency Exchange is empty on this server.
	frappe.logger("growie.portfolio").warning(
		"Using USD→KES fallback for %s on %s (no Currency Exchange row)",
		src,
		on_date or today(),
	)
	return _growe_usd_to_kes_fallback()


def _to_kes(amount: float, from_currency: str, on_date: str = None, strict: bool = True) -> float:
	"""Convert amount from from_currency to KES via Currency Exchange (with sensible fallbacks)."""
	src = (from_currency or "KES").upper().strip()
	val = float(amount or 0)
	if not val:
		return 0.0
	if src == "KES":
		return val

	rate = kes_per_unit_foreign(src, on_date, strict=strict)
	return val * rate


# ── Stock search ──────────────────────────────────────────────────────────────

@frappe.whitelist()
def search_stocks(query: str = "", market: str = None, limit: int = 20):
	"""
	Search Growe Stock by ticker or company name.
	Used by the frontend searchable combobox on the Add Holding dialog.
	"""
	filters = {"is_active": 1}
	if market:
		filters["market"] = market

	# Build OR conditions for ticker + company_name search
	if query:
		results = frappe.db.sql(
			"""
			SELECT name, ticker, company_name, market, currency, region, exchange_platform
			FROM `tabGrowe Stock`
			WHERE is_active = 1
			  AND (
			        ticker       LIKE %(q)s
			     OR company_name LIKE %(q)s
			  )
			  {market_clause}
			ORDER BY ticker ASC
			LIMIT %(limit)s
			""".format(
				market_clause=f"AND market = %(market)s" if market else ""
			),
			{"q": f"%{query}%", "market": market, "limit": int(limit)},
			as_dict=True,
		)
	else:
		results = frappe.get_all(
			"Growe Stock",
			filters=filters,
			fields=["name", "ticker", "company_name", "market", "currency", "region", "exchange_platform"],
			order_by="ticker asc",
			limit=int(limit),
		)

	return results


@frappe.whitelist()
def get_currencies(query: str = "", limit: int = 100):
	"""Return currencies from ERPNext/Frappe Currency doctype for searchable dropdowns."""
	has_enabled = frappe.get_meta("Currency").has_field("enabled")
	where_enabled = "AND enabled = 1" if has_enabled else ""
	base_filters = {"enabled": 1} if has_enabled else {}
	if query:
		return frappe.db.sql(
			"""
			SELECT name
			FROM `tabCurrency`
			WHERE name LIKE %(q)s
			  {where_enabled}
			ORDER BY name ASC
			LIMIT %(limit)s
			""".format(where_enabled=where_enabled),
			{"q": f"%{query}%", "limit": int(limit)},
			as_dict=True,
		)
	return frappe.get_all(
		"Currency",
		filters=base_filters,
		fields=["name"],
		order_by="name asc",
		limit=int(limit),
	)


def _kes_per_unit_of_foreign(foreign_currency: str, transaction_date=None) -> float:
	"""
	Return multiplier for: amount_in_foreign = amount_kes * multiplier (display conversion).

	Uses the same DB + fallback resolver as _to_kes, inverted: 1 / (KES per 1 foreign).
	"""
	f = (foreign_currency or "").upper().strip()
	if not f or f == "KES":
		return 1.0

	kes_per_foreign = _resolve_rate_to_kes(f, transaction_date)
	if kes_per_foreign > 0:
		return 1.0 / kes_per_foreign
	return 0.0


@frappe.whitelist()
def get_kes_to_currency_multiplier(to_currency: str = "KES"):
	"""
	Return multiplier such that: amount_in_display_currency = amount_kes * multiplier.

	ERPNext Currency Exchange rows may list USD→KES only; we resolve via inverse when needed.
	"""
	c = (to_currency or "KES").upper().strip()
	if c == "KES":
		return {"multiplier": 1.0, "currency": c}

	try:
		mult = _kes_per_unit_of_foreign(c, today())
		if mult <= 0:
			frappe.throw(
				_("No exchange rate between KES and {0} on {1}. Configure Currency Exchange in ERPNext.")
				.format(c, today())
			)
		return {"multiplier": mult, "currency": c}
	except ImportError:
		return {"multiplier": 1.0, "currency": c, "fallback": True}


# ── Read ──────────────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_holdings():
	"""Return all holdings for the current user."""
	from growie_app.api.stack import _stack_holding_row

	member = _member_name()
	rows = frappe.get_all(
		"Growe Holding",
		filters=open_holding_db_filters(member),
		fields=[
			"name",
			"asset_class",
			"asset_name",
			"value_kes",
			"cost_basis_kes",
			"quantity",
			"ticker",
			"date_added",
			"last_updated",
			"notes",
			"currency",
			"buying_price",
			"broker",
			"sold",
		],
		order_by="date_added desc",
	)
	return [_stack_holding_row(r) for r in rows]


@frappe.whitelist()
def get_portfolio_summary():
	"""
	Return total portfolio value, allocation breakdown, and gain/loss vs cost at avg buy.
	"""
	from growie_app.api.stack import _stack_holding_row

	member = _member_name()
	rows = frappe.get_all(
		"Growe Holding",
		filters=open_holding_db_filters(member),
		fields=[
			"name",
			"asset_class",
			"asset_name",
			"value_kes",
			"cost_basis_kes",
			"quantity",
			"ticker",
			"date_added",
			"currency",
			"buying_price",
			"sold",
		],
	)

	holdings = [_stack_holding_row(r) for r in rows]
	total_value = 0.0
	total_cost = 0.0
	allocation: dict = {
		"mmf": 0.0,
		"real-estate": 0.0,
		"nse-stocks": 0.0,
		"global-stocks": 0.0,
		"etf": 0.0,
	}

	for h in holdings:
		val = float(h.get("valueInKES") or h.get("valueKES") or 0)
		cost = float(h.get("costAtAvgKES") or h.get("costBasisKES") or 0)
		total_value += val
		total_cost += cost
		key = h.get("assetClass", "mmf")
		allocation[key] += val

	gain = total_value - total_cost
	gain_percent = (gain / total_cost * 100) if total_cost > 0 else 0.0

	alloc_pct = {
		k: round(v / total_value * 100, 1) if total_value > 0 else 0
		for k, v in allocation.items()
	}

	record_portfolio_snapshot(member, holdings, total_value_kes=total_value, total_cost_kes=total_cost)
	monthly = compute_monthly_growth(member, holdings)

	return {
		"totalValueKES": round(total_value, 2),
		"totalValue": round(total_value, 2),  # forward-compatible alias
		"totalCostKES": round(total_cost, 2),
		"totalCost": round(total_cost, 2),  # forward-compatible alias
		"gainKES": round(gain, 2),
		"gain": round(gain, 2),  # forward-compatible alias
		"gainPercent": round(gain_percent, 2),
		"holdingsCount": len(holdings),
		"allocation": allocation,
		"allocationPercent": alloc_pct,
		**monthly,
	}


# ── Create ────────────────────────────────────────────────────────────────────

@frappe.whitelist()
def add_holding(
	asset_class: str,
	asset_name: str,           # Growe Stock name (Link field value)
	currency: str = "USD",
	quantity: float = None,
	notes: str = None,
	date_added: str = None,
):
	member = _member_name()

	# Validate the stock exists and resolve ticker
	if not frappe.db.exists("Growe Stock", asset_name):
		frappe.throw(_(f"Stock '{asset_name}' not found. Please select a valid stock."))

	ticker = frappe.db.get_value("Growe Stock", asset_name, "ticker") or ""
	ac_label = _ASSET_CLASS_REVERSE.get(asset_class, asset_class)
	use_date = date_added or today()
	qty = float(quantity or 0)

	# Use cached market price to compute current and original values.
	cache = frappe.db.get_value(
		"Growe Price Cache",
		ticker,
		["price_kes", "price_usd"],
		as_dict=True,
	) if ticker else None
	price_in_currency = 0.0
	ccy = (currency or "USD").upper()
	if cache:
		if ccy == "KES":
			price_in_currency = float(cache.price_kes or 0)
		elif ccy == "USD":
			price_in_currency = float(cache.price_usd or 0)
		else:
			kes_px = float(cache.price_kes or 0)
			if kes_px > 0:
				kpu = kes_per_unit_foreign(ccy, use_date, strict=False)
				price_in_currency = kes_px / kpu if kpu > 0 else 0.0

	value_in_currency = qty * price_in_currency
	value_kes = _to_kes(value_in_currency, ccy, use_date) if value_in_currency else 0

	doc = frappe.get_doc({
		"doctype": "Growe Holding",
		"investor": member,
		"asset_class": ac_label,
		"asset_name": asset_name,
		"ticker": ticker,
		"value_kes": float(value_kes),
		"cost_basis_kes": float(value_kes),
		"quantity": qty,
		"currency": ccy,
		"notes": notes or "",
		"date_added": use_date,
		"last_updated": now_datetime(),
	})
	if price_in_currency > 0:
		doc.buying_price = price_in_currency
	doc.flags.ignore_permissions = True
	doc.insert()

	if qty > 0:
		from growie_app.investment_app.holding_ledger import create_holding_transaction

		unit = price_in_currency if price_in_currency > 0 else (
			(value_kes / qty) / kes_per_unit_foreign(ccy, use_date, strict=False)
			if ccy != "KES" and qty > 0
			else (value_kes / qty if qty > 0 else 0)
		)
		create_holding_transaction(
			member=member,
			holding_name=doc.name,
			transaction_type="Buy",
			quantity=qty,
			unit_price=unit,
			currency=ccy,
			transaction_date=use_date,
			holding_doc=doc,
			notes=notes or "",
		)

	frappe.db.commit()
	return _holding_to_dict(doc)


# ── Update ────────────────────────────────────────────────────────────────────

@frappe.whitelist()
def update_holding(
	holding_name: str,
	asset_name: str = None,    # Growe Stock name
	currency: str = None,
	date_added: str = None,
	quantity: float = None,
	notes: str = None,
):
	member = _member_name()
	doc = frappe.get_doc("Growe Holding", holding_name)

	if doc.investor != member:
		frappe.throw(_("You are not authorised to edit this holding."), frappe.PermissionError)

	if asset_name is not None:
		if not frappe.db.exists("Growe Stock", asset_name):
			frappe.throw(_(f"Stock '{asset_name}' not found."))
		doc.asset_name = asset_name
		doc.ticker = frappe.db.get_value("Growe Stock", asset_name, "ticker") or ""

	if currency is not None:
		doc.currency = (currency or "USD").upper()
	if date_added is not None:
		doc.date_added = getdate(date_added)
	if quantity is not None:
		doc.quantity = float(quantity)
	if notes is not None:
		doc.notes = notes

	# Recompute derived values from current cache and entered quantity.
	ticker = doc.ticker or ""
	cache = frappe.db.get_value(
		"Growe Price Cache",
		ticker,
		["price_kes", "price_usd"],
		as_dict=True,
	) if ticker else None
	ccy = (doc.currency or "USD").upper()
	qty = float(doc.quantity or 0)
	if cache and qty > 0:
		if ccy == "KES":
			price_in_currency = float(cache.price_kes or 0)
		elif ccy == "USD":
			price_in_currency = float(cache.price_usd or 0)
		else:
			kes_px = float(cache.price_kes or 0)
			kpu = kes_per_unit_foreign(ccy, str(doc.date_added), strict=False)
			price_in_currency = kes_px / kpu if kpu > 0 else 0.0
		value_in_currency = qty * price_in_currency
		doc.value_kes = _to_kes(value_in_currency, ccy, str(doc.date_added))
		doc.cost_basis_kes = doc.value_kes

	doc.last_updated = now_datetime()
	doc.flags.ignore_permissions = True
	doc.save()
	frappe.db.commit()
	return _holding_to_dict(doc)


@frappe.whitelist()
def get_holding_movement(holding_name: str, period: str = "1y"):
	"""Return a simple two-point movement series for a selected holding."""
	member = _member_name()
	doc = frappe.get_doc("Growe Holding", holding_name)
	if doc.investor != member:
		frappe.throw(_("You are not authorised to view this holding."), frappe.PermissionError)

	start_value = float(doc.cost_basis_kes or 0)
	current_value = float(doc.value_kes or 0)
	start_date = str(doc.date_added or today())
	end_date = str(today())

	return {
		"holdingId": doc.name,
		"holdingName": doc.asset_name,
		"period": period,
		"points": [
			{"label": "Start", "date": start_date, "valueKES": start_value},
			{"label": "Now", "date": end_date, "valueKES": current_value},
		],
	}


# ── Excel import (Growe web app) ───────────────────────────────────────────────

@frappe.whitelist()
def import_holdings_excel(file_url: str):
	"""
	Import the Scope / global stocks Excel template for the logged-in member only.

	Upload the file first via POST ``/api/method/upload_file``, then pass ``file_url`` from the response.
	"""
	member = _member_name()
	from growie_app.utils.holdings_excel_import import import_scope_template_excel

	return import_scope_template_excel(file_url=file_url, investor=member)


@frappe.whitelist()
def import_holdings_csv(file_url: str):
	"""Import Scope / global stocks template from CSV (.csv upload via ``upload_file``)."""
	member = _member_name()
	from growie_app.utils.holdings_excel_import import import_scope_template_csv

	return import_scope_template_csv(file_url=file_url, investor=member)


@frappe.whitelist()
def import_holdings_spreadsheet(spreadsheet_url: str):
	"""Import Scope template from a public Google Sheets link."""
	member = _member_name()
	from growie_app.utils.holdings_excel_import import import_scope_template_spreadsheet

	return import_scope_template_spreadsheet(
		spreadsheet_url=spreadsheet_url, investor=member
	)


# ── Delete ────────────────────────────────────────────────────────────────────

@frappe.whitelist()
def delete_holding(holding_name: str):
	member = _member_name()
	doc = frappe.get_doc("Growe Holding", holding_name)

	if doc.investor != member:
		frappe.throw(_("You are not authorised to delete this holding."), frappe.PermissionError)

	doc.flags.ignore_permissions = True
	doc.delete()
	frappe.db.commit()
	return {"success": True}
