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
	_holding_to_dict,
	_member_name,
	_to_kes,
	add_holding,
	search_stocks,
)
from growie_app.investment_app.holding_ledger import create_holding_transaction


def _asset_class_from_market(market: str) -> str:
	m = (market or "").strip()
	if m == "NSE":
		return "nse-stocks"
	if m == "Global":
		return "global-stocks"
	return ""


def _market_tag_for_holding(holding_doc) -> str:
	ac = holding_doc.asset_class or ""
	if ac == "NSE":
		return "NSE"
	if ac == "Global":
		return "Global"
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
		return kes_px / _to_kes(1, ccy, on_date)
	return 0.0


def _stack_holding_row(h) -> dict:
	row = _holding_to_dict(h)
	qty = float(row.get("quantity") or 0)
	cost = float(row.get("costBasisKES") or 0)
	value = float(row.get("valueKES") or 0)
	currency = (row.get("currency") or "USD").upper()
	# Mark-to-market / UI uses today's rate — not purchase date (stale_days often excludes old dates).
	rate_date = str(today())
	purchase_date = str(row.get("dateAdded") or today())

	avg_buy_kes = (cost / qty) if qty > 0 else 0
	current_kes = (value / qty) if qty > 0 else float(row.get("currentPriceKES") or 0)

	# Prefer stored buying_price on doc when set
	if isinstance(h, dict):
		bp = flt(h.get("buying_price"))
	else:
		bp = flt(getattr(h, "buying_price", None))
	if bp > 0:
		avg_buy_native = bp
	else:
		kes_per_unit_foreign = _to_kes(1, currency, purchase_date) if currency != "KES" else 1.0
		if currency == "KES":
			avg_buy_native = avg_buy_kes
		elif kes_per_unit_foreign > 0:
			avg_buy_native = avg_buy_kes / kes_per_unit_foreign
		else:
			avg_buy_native = 0

	current_native = _price_in_currency(row.get("ticker") or "", currency, rate_date)
	if current_native <= 0 and qty > 0:
		kes_per_unit_foreign = _to_kes(1, currency, rate_date) if currency != "KES" else 1.0
		current_native = current_kes / kes_per_unit_foreign if kes_per_unit_foreign > 0 else current_kes

	gain_pct = ((value - cost) / cost * 100) if cost > 0 else 0
	market = ""
	if row.get("stockName"):
		market = frappe.db.get_value("Growe Stock", row["stockName"], "market") or ""

	row.update(
		{
			"marketTag": market or _market_tag_for_holding(
				frappe._dict(asset_class=_ASSET_CLASS_REVERSE.get(row.get("assetClass"), ""))
			),
			"avgBuyPrice": round(avg_buy_native, 4),
			"currentPrice": round(current_native, 4),
			"gainPercent": round(gain_pct, 2),
			"unrealizedGainKES": round(value - cost, 2),
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
def get_stack_overview():
	"""Per asset-class aggregates for My Stack landing."""
	member = _member_name()
	rows = frappe.get_all(
		"Growe Holding",
		filters={"investor": member, "sold": 0},
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
		],
	)

	classes = {
		"nse-stocks": {"assetClass": "nse-stocks", "label": "NSE Stocks", "positions": 0, "valueKES": 0, "costKES": 0},
		"global-stocks": {"assetClass": "global-stocks", "label": "Global Stocks", "positions": 0, "valueKES": 0, "costKES": 0},
		"mmf": {"assetClass": "mmf", "label": "Money Market Funds", "positions": 0, "valueKES": 0, "costKES": 0},
		"real-estate": {"assetClass": "real-estate", "label": "Real Estate", "positions": 0, "valueKES": 0, "costKES": 0},
	}

	for r in rows:
		ac = _ASSET_CLASS_MAP.get(r.asset_class, "mmf")
		if ac not in classes:
			continue
		classes[ac]["positions"] += 1
		classes[ac]["valueKES"] += flt(r.value_kes)
		classes[ac]["costKES"] += flt(r.cost_basis_kes)

	out = []
	for ac in ("nse-stocks", "global-stocks", "mmf", "real-estate"):
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
	ac_label = _ASSET_CLASS_REVERSE.get(asset_class, asset_class)
	if ac_label not in _ASSET_CLASS_MAP:
		frappe.throw(_("Unknown asset class."))

	rows = frappe.get_all(
		"Growe Holding",
		filters={"investor": member, "asset_class": ac_label, "sold": 0},
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
		],
		order_by="date_added desc",
	)

	holdings = [_stack_holding_row(r) for r in rows]
	total_value = sum(h["valueKES"] for h in holdings)
	total_cost = sum(h["costBasisKES"] for h in holdings)
	gain = total_value - total_cost

	return {
		"assetClass": asset_class,
		"label": {
			"nse-stocks": "NSE stocks",
			"global-stocks": "Global stocks",
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
):
	"""Create a Growe Stock (e.g. when user adds a new listing)."""
	_member_name()
	clean = (ticker or "").strip().upper()
	if not clean:
		frappe.throw(_("Ticker is required."))
	mkt = (market or "Global").strip()
	if mkt not in ("NSE", "Global"):
		frappe.throw(_("Market must be NSE or Global."))

	existing = frappe.db.get_value("Growe Stock", {"ticker": clean, "market": mkt}, "name")
	if existing:
		return {
			"name": existing,
			"ticker": clean,
			"company_name": frappe.db.get_value("Growe Stock", existing, "company_name"),
			"market": mkt,
			"currency": frappe.db.get_value("Growe Stock", existing, "currency") or currency,
			"assetClass": _asset_class_from_market(mkt),
			"created": False,
		}

	doc = frappe.get_doc(
		{
			"doctype": "Growe Stock",
			"ticker": clean,
			"company_name": (company_name or clean).strip()[:240],
			"market": mkt,
			"currency": (currency or "USD").upper(),
			"is_active": 1,
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
		"assetClass": _asset_class_from_market(doc.market),
		"created": True,
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
	return {"assetClass": ac, "market": market, "marketTag": market}


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
		if asset_class not in _ASSET_CLASS_REVERSE:
			frappe.throw(_("Please select an asset class for this investment."))

		if unit <= 0:
			created = add_holding(
				asset_class=asset_class,
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
			ac_label = _ASSET_CLASS_REVERSE.get(asset_class, asset_class)
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
			kpu = _to_kes(1, ccy, str(use_date)) if ccy != "KES" else 1
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


# Re-export stock search for frontend
get_stocks = search_stocks
