"""
Portfolio API — CRUD for Growe Holding + portfolio summary + stock search.
All endpoints require an authenticated session unless noted.
"""

import frappe
from frappe import _
from frappe.utils import now_datetime, today


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
		"costBasisKES": float(h.get("cost_basis_kes") or 0),
		"quantity": float(h.get("quantity") or 0),
		"ticker": ticker,
		"dateAdded": str(h.get("date_added") or today()),
		"lastUpdated": str(h.get("last_updated") or ""),
		"notes": h.get("notes") or "",
		"currentPriceKES": float(price_kes or 0),
		"changePercent": float(change_percent or 0),
	}


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
			"date_added", "last_updated", "notes",
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
		"totalCostKES": round(total_cost, 2),
		"gainKES": round(gain, 2),
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
	value_kes: float,
	cost_basis_kes: float = None,
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

	doc = frappe.get_doc({
		"doctype": "Growe Holding",
		"investor": member,
		"asset_class": ac_label,
		"asset_name": asset_name,
		"ticker": ticker,
		"value_kes": float(value_kes),
		"cost_basis_kes": float(cost_basis_kes or value_kes),
		"quantity": float(quantity or 0),
		"notes": notes or "",
		"date_added": date_added or today(),
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
	value_kes: float = None,
	cost_basis_kes: float = None,
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

	if value_kes is not None:
		doc.value_kes = float(value_kes)
	if cost_basis_kes is not None:
		doc.cost_basis_kes = float(cost_basis_kes)
	if quantity is not None:
		doc.quantity = float(quantity)
	if notes is not None:
		doc.notes = notes

	doc.last_updated = now_datetime()
	doc.flags.ignore_permissions = True
	doc.save()
	frappe.db.commit()
	return _holding_to_dict(doc)


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
