"""
Portfolio API — CRUD for Growe Holding + portfolio summary + stock search.
All endpoints require an authenticated session unless noted.
"""

import frappe
from frappe import _
from frappe.utils import now_datetime, today, getdate


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
}

_ASSET_CLASS_REVERSE = {v: k for k, v in _ASSET_CLASS_MAP.items()}


def _holding_to_dict(h) -> dict:
	"""Convert a Frappe Growe Holding row to the frontend shape."""
	# Resolve ticker and display name from the linked Growe Stock
	stock_name = h.get("asset_name") or ""
	display_name = stock_name
	ticker = h.get("ticker") or ""

	if stock_name:
		stock = frappe.db.get_value(
			"Growe Stock",
			stock_name,
			["ticker", "company_name", "market"],
			as_dict=True,
		)
		if stock:
			display_name = stock.company_name or stock_name
			ticker = ticker or stock.ticker or ""

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
		"dateAdded": str(h.get("date_added") or today()),
		"lastUpdated": str(h.get("last_updated") or ""),
		"notes": h.get("notes") or "",
		"currentPriceKES": float(price_kes or 0),
		"changePercent": float(change_percent or 0),
		"currency": h.get("currency") or "USD",
	}


def _to_kes(amount: float, from_currency: str, on_date: str = None) -> float:
	"""Convert amount from from_currency to KES via ERPNext exchange rates."""
	src = (from_currency or "KES").upper().strip()
	val = float(amount or 0)
	if not val:
		return 0.0
	if src == "KES":
		return val

	try:
		from erpnext.setup.utils import get_exchange_rate
		rate = float(get_exchange_rate(src, "KES", on_date or today()) or 0)
		if rate <= 0:
			frappe.throw(
				_("No exchange rate configured from {0} to KES on {1}. Please configure Currency Exchange in ERPNext.")
				.format(src, on_date or today())
			)
		return val * rate
	except ImportError:
		frappe.throw(_("ERPNext exchange rate utilities are not available on this site."))


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
			SELECT name, ticker, company_name, market, currency
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
			fields=["name", "ticker", "company_name", "market", "currency"],
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
	Return how many KES equal 1 unit of foreign_currency (using ERPNext exchange rates).

	If only KES→foreign exists, use it directly (multiply amount_kes by it for foreign amount).
	If only foreign→KES exists with rate R meaning 1 foreign = R KES, then 1 KES = 1/R foreign.
	"""
	d = transaction_date or today()
	f = (foreign_currency or "").upper().strip()
	if not f or f == "KES":
		return 1.0

	try:
		from erpnext.setup.utils import get_exchange_rate
	except ImportError:
		return 0.0

	direct = float(get_exchange_rate("KES", f, d) or 0)
	if direct > 0:
		return direct

	inverse = float(get_exchange_rate(f, "KES", d) or 0)
	if inverse > 0:
		return 1.0 / inverse

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
	member = _member_name()
	rows = frappe.get_all(
		"Growe Holding",
		filters={"investor": member},
		fields=[
			"name", "asset_class", "asset_name", "value_kes",
			"cost_basis_kes", "quantity", "ticker",
			"date_added", "last_updated", "notes", "currency",
		],
		order_by="date_added desc",
	)
	return [_holding_to_dict(r) for r in rows]


@frappe.whitelist()
def get_portfolio_summary():
	"""
	Return total portfolio value, allocation breakdown, and gain/loss vs cost basis.
	"""
	member = _member_name()
	rows = frappe.get_all(
		"Growe Holding",
		filters={"investor": member},
		fields=["asset_class", "value_kes", "cost_basis_kes"],
	)

	total_value = 0.0
	total_cost = 0.0
	allocation: dict = {"mmf": 0.0, "real-estate": 0.0, "nse-stocks": 0.0, "global-stocks": 0.0}

	for r in rows:
		val = float(r.value_kes or 0)
		cost = float(r.cost_basis_kes or 0)
		total_value += val
		total_cost += cost
		key = _ASSET_CLASS_MAP.get(r.asset_class, "mmf")
		allocation[key] += val

	gain = total_value - total_cost
	gain_percent = (gain / total_cost * 100) if total_cost > 0 else 0.0

	alloc_pct = {
		k: round(v / total_value * 100, 1) if total_value > 0 else 0
		for k, v in allocation.items()
	}

	return {
		"totalValueKES": round(total_value, 2),
		"totalValue": round(total_value, 2),  # forward-compatible alias
		"totalCostKES": round(total_cost, 2),
		"totalCost": round(total_cost, 2),  # forward-compatible alias
		"gainKES": round(gain, 2),
		"gain": round(gain, 2),  # forward-compatible alias
		"gainPercent": round(gain_percent, 2),
		"holdingsCount": len(rows),
		"allocation": allocation,
		"allocationPercent": alloc_pct,
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
				price_in_currency = kes_px / _to_kes(1, ccy, use_date)

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
	doc.flags.ignore_permissions = True
	doc.insert()
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
			price_in_currency = kes_px / _to_kes(1, ccy, str(doc.date_added))
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
