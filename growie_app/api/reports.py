"""
Member reports — HTML preview and PDF download.
"""

import frappe
from frappe import _
from frappe.utils import flt, formatdate, format_datetime, getdate, now_datetime, today

from growie_app.api.portfolio import (
	_ASSET_CLASS_MAP,
	_holding_to_dict,
	_kes_per_unit_of_foreign,
	_member_name,
	get_portfolio_summary,
	open_holding_db_filters,
)
from growie_app.api.goals import get_goals


CURRENCY_SYMBOLS = {
	"KES": "KSh",
	"USD": "$",
	"EUR": "€",
	"GBP": "£",
}

REPORT_LABELS = {
	"dashboard": "Overall Dashboard Report",
	"portfolio": "Portfolio Performance Report",
	"goals": "Goals Report",
	"tax": "Tax Summary Report",
	"sold": "Sold Transactions Report",
}

_ASSET_LABELS = {
	"mmf": "Money Market Funds",
	"real-estate": "Real Estate",
	"nse-stocks": "NSE Stocks",
	"global-stocks": "Global Stocks",
}


def _resolve_report_currency(member: str, display_currency: str = None) -> dict:
	"""Match app display: amounts stored in KES, shown in member preferred currency."""
	cur = (
		(display_currency or "").strip().upper()
		or (frappe.db.get_value("Growe Member", member, "preferred_currency") or "USD")
	).upper()
	if cur not in CURRENCY_SYMBOLS:
		cur = "USD"
	mult = 1.0
	if cur != "KES":
		mult = _kes_per_unit_of_foreign(cur, today())
		if mult <= 0:
			mult = 1.0 / 130.0 if cur == "USD" else 1.0
	return {"currency": cur, "multiplier": mult, "symbol": CURRENCY_SYMBOLS[cur]}


def _fmt_money(amount_kes: float, ctx: dict, *, decimals: int = 0) -> str:
	"""Format a KES-denominated amount in the report display currency."""
	val = flt(amount_kes) * flt(ctx.get("multiplier") or 1)
	cur = ctx.get("currency") or "KES"
	if decimals <= 0:
		formatted = f"{val:,.0f}"
	else:
		formatted = f"{val:,.{decimals}f}"
	try:
		return frappe.utils.fmt_money(val, currency=cur, precision=decimals)
	except Exception:
		sym = ctx.get("symbol") or cur
		if cur == "USD":
			return f"{sym}{formatted}"
		return f"{sym} {formatted}"


def _report_styles() -> str:
	return """
	<style>
	  body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.5; margin: 0; padding: 24px; }
	  h1 { font-size: 20px; margin: 0 0 4px; color: #1e3a5f; }
	  .meta { color: #666; font-size: 11px; margin-bottom: 20px; }
	  h2 { font-size: 14px; color: #1e3a5f; margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
	  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
	  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
	  th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
	  .summary-grid { display: table; width: 100%; margin: 12px 0; }
	  .summary-cell { display: table-cell; width: 25%; padding: 10px; background: #f8fafc; border: 1px solid #e5e7eb; }
	  .summary-cell strong { display: block; font-size: 16px; color: #1e3a5f; }
	  .summary-cell span { font-size: 10px; color: #666; text-transform: uppercase; }
	  .footer { margin-top: 28px; font-size: 10px; color: #888; }
	  .positive { color: #15803d; }
	  .negative { color: #b91c1c; }
	</style>
	"""


def _exchange_label_for_holding(h: dict) -> str:
	"""Exchange bucket for allocation (Growe Stock exchange_platform, with fallbacks)."""
	ex = (h.get("exchangePlatform") or "").strip()
	if ex:
		return ex
	ac = (h.get("assetClass") or "").strip()
	if ac in ("nse-stocks", "mmf", "real-estate"):
		return "NSE"
	if ac == "etf":
		return (h.get("exchangePlatform") or "").strip() or "NYSE"
	tag = (h.get("marketTag") or "").strip().upper()
	if tag in ("NSE", "NYSE", "NASDAQ", "AMEX", "LSE", "EURONEXT", "HKEX", "JPX", "JSE"):
		return tag
	if tag:
		return tag
	return "Other"


def _fetch_sold_transaction_rows(member: str, limit: int = 200) -> list:
	return frappe.get_all(
		"Growe Holding Transaction",
		filters={"member": member, "transaction_type": "Sell"},
		fields=[
			"name",
			"ticker",
			"asset_name",
			"asset_class",
			"market_tag",
			"quantity",
			"unit_price",
			"amount_kes",
			"currency",
			"transaction_date",
			"reference",
			"notes",
			"holding",
		],
		order_by="transaction_date desc, creation desc",
		limit=int(limit),
	)


def _serialize_sold_transaction(r) -> dict:
	ticker = (r.ticker or "").strip()
	asset_name = (r.asset_name or "").strip()
	return {
		"id": r.name,
		"holdingId": r.holding or "",
		"source": "transaction",
		"sourceLabel": "Sell trade",
		"ticker": ticker,
		"assetName": asset_name,
		"assetClass": r.asset_class or "",
		"assetClassLabel": _ASSET_LABELS.get(r.asset_class, r.asset_class or ""),
		"marketTag": r.market_tag or "",
		"quantity": flt(r.quantity),
		"unitPrice": flt(r.unit_price),
		"proceedsKES": flt(r.amount_kes),
		"currency": (r.currency or "USD").upper(),
		"transactionDate": str(r.transaction_date or ""),
		"reference": r.reference or "",
		"notes": r.notes or "",
	}


def _fetch_sold_holding_rows(member: str) -> list:
	"""Holdings marked sold (e.g. Excel import) — not shown in open portfolio lists."""
	return frappe.get_all(
		"Growe Holding",
		filters={"investor": member, "sold": 1},
		fields=[
			"name",
			"asset_class",
			"asset_name",
			"ticker",
			"value_kes",
			"cost_basis_kes",
			"quantity",
			"share_breakdown",
			"currency",
			"date_added",
			"buying_price",
			"current_price",
			"sold_date",
			"broker",
			"notes",
		],
		order_by="sold_date desc, date_added desc, last_updated desc",
	)


def _serialize_sold_holding(r) -> dict:
	"""Closed position with sold=1 and no separate ledger rows (typical after Excel import)."""
	from growie_app.api.stack import _stack_holding_row

	d = _stack_holding_row(r)
	qty = flt(r.quantity)
	if qty <= 0:
		qty = flt(r.share_breakdown) or flt(d.get("quantity"))
	ccy = (r.currency or "USD").upper()
	unit = flt(r.buying_price) or flt(d.get("avgBuyPrice"))
	proceeds_kes = flt(d.get("valueInKES"))
	if proceeds_kes <= 0:
		val_native = flt(r.value_kes)
		if ccy == "KES":
			proceeds_kes = val_native
		elif val_native > 0:
			rate = _kes_per_unit_of_foreign(ccy, str(r.sold_date or r.date_added or today()))
			proceeds_kes = val_native * rate if rate > 0 else val_native

	notes = (r.notes or "").strip()
	if "imported" in notes.lower():
		source_label = "Imported as sold"
	elif notes:
		source_label = "Marked sold"
	else:
		source_label = "Marked sold on holding"
		if not notes:
			notes = source_label

	return {
		"id": f"holding:{r.name}",
		"holdingId": r.name,
		"source": "holding",
		"sourceLabel": source_label,
		"ticker": (r.ticker or "").strip(),
		"assetName": (r.asset_name or "").strip(),
		"assetClass": r.asset_class or "",
		"assetClassLabel": _ASSET_LABELS.get(r.asset_class, r.asset_class or ""),
		"marketTag": d.get("marketTag") or "",
		"quantity": qty,
		"unitPrice": unit,
		"proceedsKES": proceeds_kes,
		"currency": ccy,
		"transactionDate": str(r.sold_date or r.date_added or ""),
		"reference": (r.broker or "").strip(),
		"notes": notes,
	}


def _get_unified_sold_items(member: str, limit: int = 200) -> list[dict]:
	"""
	Merge sell ledger rows with holdings flagged sold=1.
	When a holding already has Sell transactions, only those ledger rows are shown (no duplicate).
	"""
	tx_rows = _fetch_sold_transaction_rows(member, limit=500)
	holding_ids_with_sells = {r.holding for r in tx_rows if r.holding}

	items: list[dict] = [_serialize_sold_transaction(r) for r in tx_rows]

	for r in _fetch_sold_holding_rows(member):
		if r.name in holding_ids_with_sells:
			continue
		items.append(_serialize_sold_holding(r))

	items.sort(key=lambda x: x.get("transactionDate") or "", reverse=True)
	return items[: int(limit)]


def _sold_transactions_section_html(member: str, ctx: dict, *, limit: int = 200) -> str:
	"""HTML block: sell ledger + holdings marked sold."""
	items = _get_unified_sold_items(member, limit)

	intro = (
		"<p>These are <strong>sold positions</strong> — sell trades recorded in My Stack "
		"<em>and</em> holdings marked as sold (for example rows imported from Excel under "
		'Sold Stocks). Subscription or deposit payments are not included.</p>'
	)

	if not items:
		return f"""
	<h2>Sold transactions</h2>
	{intro}
	<table>
	  <thead><tr><th>Date</th><th>Source</th><th>Asset</th><th>Class</th><th>Qty sold</th><th>Unit price</th><th>Proceeds</th><th>Notes</th></tr></thead>
	  <tbody><tr><td colspan="8">No sold transactions or closed holdings recorded yet.</td></tr></tbody>
	</table>
	"""

	total_proceeds_kes = 0.0
	table_rows = ""
	for item in items:
		proceeds_kes = flt(item.get("proceedsKES"))
		total_proceeds_kes += proceeds_kes
		ccy = (item.get("currency") or "USD").upper()
		unit = flt(item.get("unitPrice"))
		unit_display = f"{ccy} {unit:,.2f}" if unit > 0 else "—"
		tx_date = item.get("transactionDate") or ""
		if tx_date:
			try:
				tx_date = formatdate(getdate(tx_date), "dd MMM yyyy")
			except Exception:
				pass
		else:
			tx_date = "—"
		asset_label = (item.get("ticker") or "").strip() or (item.get("assetName") or "").strip() or "—"
		market_tag = item.get("marketTag") or ""
		if market_tag and asset_label != "—":
			asset_label = f"{asset_label} ({market_tag})"
		note_bits = [x for x in (item.get("reference"), item.get("notes")) if (x or "").strip()]
		notes_cell = frappe.utils.escape_html(" · ".join(note_bits)) if note_bits else "—"
		table_rows += f"""<tr>
		  <td>{tx_date}</td>
		  <td>{frappe.utils.escape_html(item.get("sourceLabel") or "")}</td>
		  <td>{frappe.utils.escape_html(asset_label)}</td>
		  <td>{frappe.utils.escape_html(item.get("assetClassLabel") or item.get("assetClass") or "—")}</td>
		  <td>{flt(item.get("quantity")):,.2f}</td>
		  <td>{frappe.utils.escape_html(unit_display)}</td>
		  <td>{_fmt_money(proceeds_kes, ctx)}</td>
		  <td>{notes_cell}</td>
		</tr>"""

	ledger_count = sum(1 for i in items if i.get("source") == "transaction")
	holding_count = sum(1 for i in items if i.get("source") == "holding")

	summary = f"""
	<div class="summary-grid">
	  <div class="summary-cell"><span>Total sold rows</span><strong>{len(items)}</strong></div>
	  <div class="summary-cell"><span>Sell trades</span><strong>{ledger_count}</strong></div>
	  <div class="summary-cell"><span>Marked sold</span><strong>{holding_count}</strong></div>
	  <div class="summary-cell"><span>Total proceeds</span><strong>{_fmt_money(total_proceeds_kes, ctx)}</strong></div>
	</div>
	"""

	return f"""
	<h2>Sold transactions</h2>
	{intro}
	{summary}
	<table>
	  <thead><tr><th>Date</th><th>Source</th><th>Asset</th><th>Class</th><th>Qty sold</th><th>Unit price</th><th>Proceeds</th><th>Notes</th></tr></thead>
	  <tbody>{table_rows}</tbody>
	</table>
	"""


def _exchange_allocation_rows(member: str, ctx: dict) -> str:
	"""HTML table rows: portfolio value grouped by exchange platform."""
	from growie_app.api.stack import _stack_holding_row

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
	by_exchange: dict[str, float] = {}
	for r in rows:
		h = _stack_holding_row(r)
		val = flt(h.get("valueInKES") or h.get("valueKES") or 0)
		if val <= 0:
			continue
		label = _exchange_label_for_holding(h)
		by_exchange[label] = by_exchange.get(label, 0.0) + val

	if not by_exchange:
		return ""

	total = sum(by_exchange.values())
	lines = []
	for label, val in sorted(by_exchange.items(), key=lambda x: (-x[1], x[0])):
		pct = (val / total * 100) if total > 0 else 0
		lines.append(
			f"<tr><td>{frappe.utils.escape_html(label)}</td>"
			f"<td>{pct:.1f}%</td>"
			f"<td>{_fmt_money(val, ctx)}</td></tr>"
		)
	return "".join(lines)


def _wrap_report(title: str, body_html: str, member_name: str, ctx: dict) -> str:
	member_doc = frappe.db.get_value("Growe Member", member_name, ["full_name", "user"], as_dict=True)
	display = (member_doc.full_name if member_doc else None) or member_name
	generated = format_datetime(now_datetime(), "dd MMM yyyy HH:mm")
	currency_note = frappe.utils.escape_html(ctx.get("currency") or "KES")
	return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{frappe.utils.escape_html(title)}</title>
{_report_styles()}
</head><body>
<h1>{frappe.utils.escape_html(title)}</h1>
<p class="meta">Prepared for {frappe.utils.escape_html(display)} · Generated {generated} · All amounts in {currency_note}</p>
{body_html}
<p class="footer">This report is for informational purposes only and does not constitute regulated financial advice.</p>
</body></html>"""


def _build_dashboard_html(member: str, ctx: dict) -> str:
	summary = get_portfolio_summary()
	holdings = frappe.get_all(
		"Growe Holding",
		filters=open_holding_db_filters(member),
		fields=["name", "asset_class", "asset_name", "value_kes", "cost_basis_kes", "ticker"],
		order_by="value_kes desc",
		limit=10,
	)
	goals = get_goals() or []

	gain_cls = "positive" if summary.get("gainKES", 0) >= 0 else "negative"
	alloc_rows = _exchange_allocation_rows(member, ctx)

	hold_rows = ""
	for h in holdings:
		val = flt(h.value_kes)
		cost = flt(h.cost_basis_kes)
		gain = val - cost
		hold_rows += f"""<tr>
		  <td>{frappe.utils.escape_html(h.ticker or h.asset_name or '')}</td>
		  <td>{frappe.utils.escape_html(_ASSET_CLASS_MAP.get(h.asset_class, h.asset_class or ''))}</td>
		  <td>{_fmt_money(val, ctx)}</td>
		  <td class="{'positive' if gain >= 0 else 'negative'}">{_fmt_money(gain, ctx)}</td>
		</tr>"""

	goal_rows = ""
	for g in goals[:8]:
		goal_rows += f"""<tr>
		  <td>{frappe.utils.escape_html(g.get('goalName') or '')}</td>
		  <td>{frappe.utils.escape_html(g.get('status') or '')}</td>
		  <td>{flt(g.get('progressPercent', 0)):.0f}%</td>
		</tr>"""

	body = f"""
	<div class="summary-grid">
	  <div class="summary-cell"><span>Portfolio value</span><strong>{_fmt_money(summary.get('totalValueKES', 0), ctx)}</strong></div>
	  <div class="summary-cell"><span>Cost basis</span><strong>{_fmt_money(summary.get('totalCostKES', 0), ctx)}</strong></div>
	  <div class="summary-cell"><span>Gain / loss</span><strong class="{gain_cls}">{_fmt_money(summary.get('gainKES', 0), ctx)}</strong></div>
	  <div class="summary-cell"><span>Holdings</span><strong>{summary.get('holdingsCount', 0)}</strong></div>
	</div>
	<h2>Allocation by exchange</h2>
	<table><thead><tr><th>Exchange</th><th>%</th><th>Value</th></tr></thead><tbody>{alloc_rows or '<tr><td colspan="3">No holdings</td></tr>'}</tbody></table>
	<h2>Top holdings</h2>
	<table><thead><tr><th>Asset</th><th>Class</th><th>Value</th><th>P&amp;L</th></tr></thead><tbody>{hold_rows or '<tr><td colspan="4">No holdings</td></tr>'}</tbody></table>
	<h2>Goals snapshot</h2>
	<table><thead><tr><th>Goal</th><th>Status</th><th>Progress</th></tr></thead><tbody>{goal_rows or '<tr><td colspan="3">No goals</td></tr>'}</tbody></table>
	"""
	return _wrap_report(REPORT_LABELS["dashboard"], body, member, ctx)


def _build_portfolio_html(member: str, ctx: dict) -> str:
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
			"currency",
			"date_added",
			"buying_price",
		],
		order_by="value_kes desc",
	)
	summary = get_portfolio_summary()
	table_rows = ""
	from growie_app.api.stack import _stack_holding_row

	for r in rows:
		d = _stack_holding_row(r)
		val = flt(d.get("valueKES"))
		cost = flt(d.get("costAtAvgKES") or d.get("costBasisKES"))
		gain = flt(d.get("unrealizedGainKES"))
		gain_pct = flt(d.get("gainPercent"))
		table_rows += f"""<tr>
		  <td>{frappe.utils.escape_html(d.get('ticker') or d.get('name') or '')}</td>
		  <td>{frappe.utils.escape_html(_ASSET_LABELS.get(d.get('assetClass', ''), d.get('assetClass', '')))}</td>
		  <td>{flt(d.get('quantity', 0)):,.2f}</td>
		  <td>{_fmt_money(cost, ctx)}</td>
		  <td>{_fmt_money(val, ctx)}</td>
		  <td class="{'positive' if gain >= 0 else 'negative'}">{_fmt_money(gain, ctx)} ({gain_pct:+.1f}%)</td>
		</tr>"""

	gain_cls = "positive" if summary.get("gainKES", 0) >= 0 else "negative"
	body = f"""
	<p>Performance summary as of {formatdate(today(), 'dd MMM yyyy')}.</p>
	<div class="summary-grid">
	  <div class="summary-cell"><span>Total value</span><strong>{_fmt_money(summary.get('totalValueKES', 0), ctx)}</strong></div>
	  <div class="summary-cell"><span>Total cost</span><strong>{_fmt_money(summary.get('totalCostKES', 0), ctx)}</strong></div>
	  <div class="summary-cell"><span>Unrealized P&amp;L</span><strong class="{gain_cls}">{_fmt_money(summary.get('gainKES', 0), ctx)}</strong></div>
	  <div class="summary-cell"><span>Return</span><strong class="{gain_cls}">{flt(summary.get('gainPercent', 0)):+.1f}%</strong></div>
	</div>
	<h2>Holdings</h2>
	<table>
	  <thead><tr><th>Asset</th><th>Class</th><th>Qty</th><th>Cost</th><th>Value</th><th>P&amp;L</th></tr></thead>
	  <tbody>{table_rows or '<tr><td colspan="6">No active holdings</td></tr>'}</tbody>
	</table>
	"""
	return _wrap_report(REPORT_LABELS["portfolio"], body, member, ctx)


def _build_goals_html(member: str, ctx: dict) -> str:
	goals = get_goals() or []
	rows = ""
	total_target = 0.0
	total_current = 0.0
	for g in goals:
		target = flt(g.get("targetAmount"))
		current = flt(g.get("currentAmount"))
		total_target += target
		total_current += current
		rows += f"""<tr>
		  <td>{frappe.utils.escape_html(g.get('goalName') or '')}</td>
		  <td>{frappe.utils.escape_html(g.get('category') or '')}</td>
		  <td>{frappe.utils.escape_html(g.get('currency') or 'USD')}</td>
		  <td>{target:,.0f}</td>
		  <td>{current:,.0f}</td>
		  <td>{flt(g.get('progressPercent', 0)):.0f}%</td>
		  <td>{frappe.utils.escape_html(g.get('status') or '')}</td>
		  <td>{formatdate(getdate(g.get('targetDate')), 'dd MMM yyyy') if g.get('targetDate') else '—'}</td>
		</tr>"""

	body = f"""
	<div class="summary-grid">
	  <div class="summary-cell"><span>Active goals</span><strong>{len(goals)}</strong></div>
	  <div class="summary-cell"><span>Total saved</span><strong>{total_current:,.0f}</strong></div>
	  <div class="summary-cell"><span>Combined target</span><strong>{total_target:,.0f}</strong></div>
	  <div class="summary-cell"><span>Overall progress</span><strong>{(total_current / total_target * 100) if total_target else 0:.0f}%</strong></div>
	</div>
	<h2>Goals</h2>
	<table>
	  <thead><tr><th>Goal</th><th>Category</th><th>Currency</th><th>Target</th><th>Current</th><th>Progress</th><th>Status</th><th>Target date</th></tr></thead>
	  <tbody>{rows or '<tr><td colspan="8">No goals recorded</td></tr>'}</tbody>
	</table>
	"""
	return _wrap_report(REPORT_LABELS["goals"], body, member, ctx)


def _build_tax_html(member: str, ctx: dict) -> str:
	rows = frappe.get_all(
		"Growe Holding",
		filters=open_holding_db_filters(member),
		fields=["asset_name", "ticker", "value_kes", "cost_basis_kes", "asset_class"],
	)
	total_gain = 0.0
	total_loss = 0.0
	table_rows = ""
	for r in rows:
		val = flt(r.value_kes)
		cost = flt(r.cost_basis_kes)
		gain = val - cost
		if gain >= 0:
			total_gain += gain
		else:
			total_loss += abs(gain)
		table_rows += f"""<tr>
		  <td>{frappe.utils.escape_html(r.ticker or r.asset_name or '')}</td>
		  <td>{frappe.utils.escape_html(r.asset_class or '')}</td>
		  <td>{_fmt_money(cost, ctx)}</td>
		  <td>{_fmt_money(val, ctx)}</td>
		  <td class="{'positive' if gain >= 0 else 'negative'}">{_fmt_money(gain, ctx)}</td>
		</tr>"""

	net = total_gain - total_loss
	body = f"""
	<p>Indicative tax-related summary based on unrealized portfolio gains and losses. Consult a tax professional for filing.</p>
	<div class="summary-grid">
	  <div class="summary-cell"><span>Unrealized gains</span><strong class="positive">{_fmt_money(total_gain, ctx)}</strong></div>
	  <div class="summary-cell"><span>Unrealized losses</span><strong class="negative">{_fmt_money(total_loss, ctx)}</strong></div>
	  <div class="summary-cell"><span>Net unrealized</span><strong>{_fmt_money(net, ctx)}</strong></div>
	  <div class="summary-cell"><span>Tax year</span><strong>{today()[:4]}</strong></div>
	</div>
	<h2>By holding</h2>
	<table>
	  <thead><tr><th>Asset</th><th>Class</th><th>Cost</th><th>Market value</th><th>Unrealized</th></tr></thead>
	  <tbody>{table_rows or '<tr><td colspan="5">No holdings</td></tr>'}</tbody>
	</table>
	"""
	return _wrap_report(REPORT_LABELS["tax"], body, member, ctx)


def _build_sold_html(member: str, ctx: dict) -> str:
	body = _sold_transactions_section_html(member, ctx)
	return _wrap_report(REPORT_LABELS["sold"], body, member, ctx)


_BUILDERS = {
	"dashboard": _build_dashboard_html,
	"portfolio": _build_portfolio_html,
	"goals": _build_goals_html,
	"tax": _build_tax_html,
	"sold": _build_sold_html,
}


def _validate_report_type(report_type: str) -> str:
	rt = (report_type or "").strip().lower()
	if rt not in _BUILDERS:
		frappe.throw(_("Unknown report type: {0}").format(report_type))
	return rt


def _build_html(report_type: str, member: str, display_currency: str = None) -> str:
	ctx = _resolve_report_currency(member, display_currency)
	return _BUILDERS[_validate_report_type(report_type)](member, ctx)


@frappe.whitelist()
def get_sold_transactions(display_currency: str = None, limit: int = 200):
	"""Sell ledger + holdings marked sold for the Reports → Sold transactions tab."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in."), frappe.AuthenticationError)
	member = _member_name()
	ctx = _resolve_report_currency(member, display_currency)
	transactions = _get_unified_sold_items(member, limit)
	total_proceeds_kes = sum(flt(t.get("proceedsKES")) for t in transactions)
	return {
		"transactions": transactions,
		"summary": {
			"count": len(transactions),
			"sellTradeCount": sum(1 for t in transactions if t.get("source") == "transaction"),
			"markedSoldCount": sum(1 for t in transactions if t.get("source") == "holding"),
			"totalProceedsKES": total_proceeds_kes,
			"displayCurrency": ctx.get("currency"),
		},
	}


@frappe.whitelist()
def preview_report(report_type: str, display_currency: str = None):
	"""Return HTML for in-app preview."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in."), frappe.AuthenticationError)
	member = _member_name()
	rt = _validate_report_type(report_type)
	ctx = _resolve_report_currency(member, display_currency)
	return {
		"reportType": rt,
		"title": REPORT_LABELS[rt],
		"html": _build_html(rt, member, display_currency),
		"displayCurrency": ctx.get("currency"),
	}


@frappe.whitelist()
def download_report(report_type: str, display_currency: str = None):
	"""Stream a PDF download."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in."), frappe.AuthenticationError)
	member = _member_name()
	rt = _validate_report_type(report_type)
	html = _build_html(rt, member, display_currency)

	try:
		from frappe.utils.pdf import get_pdf
	except ImportError:
		frappe.throw(_("PDF generation is not available on this server."))

	pdf = get_pdf(html)
	filename = f"growe-{rt}-report-{today()}.pdf"
	frappe.local.response.filename = filename
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "download"
	frappe.local.response.display_content_as = "attachment"
