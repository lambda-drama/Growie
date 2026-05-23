"""
Member reports — HTML preview and PDF download.
"""

import frappe
from frappe import _
from frappe.utils import flt, formatdate, format_datetime, getdate, now_datetime, today

from growie_app.api.portfolio import (
	_ASSET_CLASS_MAP,
	_holding_to_dict,
	_member_name,
	get_portfolio_summary,
)
from growie_app.api.goals import get_goals


REPORT_LABELS = {
	"dashboard": "Overall Dashboard Report",
	"portfolio": "Portfolio Performance Report",
	"goals": "Goals Report",
	"tax": "Tax Summary Report",
}

_ASSET_LABELS = {
	"mmf": "Money Market Funds",
	"real-estate": "Real Estate",
	"nse-stocks": "NSE Stocks",
	"global-stocks": "Global Stocks",
}


def _fmt_kes(amount: float) -> str:
	return f"KES {flt(amount):,.0f}"


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


def _wrap_report(title: str, body_html: str, member_name: str) -> str:
	member_doc = frappe.db.get_value("Growe Member", member_name, ["full_name", "user"], as_dict=True)
	display = (member_doc.full_name if member_doc else None) or member_name
	generated = format_datetime(now_datetime(), "dd MMM yyyy HH:mm")
	return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{frappe.utils.escape_html(title)}</title>
{_report_styles()}
</head><body>
<h1>{frappe.utils.escape_html(title)}</h1>
<p class="meta">Prepared for {frappe.utils.escape_html(display)} · Generated {generated}</p>
{body_html}
<p class="footer">This report is for informational purposes only and does not constitute regulated financial advice.</p>
</body></html>"""


def _build_dashboard_html(member: str) -> str:
	summary = get_portfolio_summary()
	holdings = frappe.get_all(
		"Growe Holding",
		filters={"investor": member, "sold": 0},
		fields=["name", "asset_class", "asset_name", "value_kes", "cost_basis_kes", "ticker"],
		order_by="value_kes desc",
		limit=10,
	)
	goals = get_goals() or []

	gain_cls = "positive" if summary.get("gainKES", 0) >= 0 else "negative"
	alloc_rows = ""
	for key, pct in (summary.get("allocationPercent") or {}).items():
		if pct > 0:
			alloc_rows += f"<tr><td>{_ASSET_LABELS.get(key, key)}</td><td>{pct}%</td><td>{_fmt_kes((summary.get('allocation') or {}).get(key, 0))}</td></tr>"

	hold_rows = ""
	for h in holdings:
		val = flt(h.value_kes)
		cost = flt(h.cost_basis_kes)
		gain = val - cost
		hold_rows += f"""<tr>
		  <td>{frappe.utils.escape_html(h.ticker or h.asset_name or '')}</td>
		  <td>{frappe.utils.escape_html(_ASSET_CLASS_MAP.get(h.asset_class, h.asset_class or ''))}</td>
		  <td>{_fmt_kes(val)}</td>
		  <td class="{'positive' if gain >= 0 else 'negative'}">{_fmt_kes(gain)}</td>
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
	  <div class="summary-cell"><span>Portfolio value</span><strong>{_fmt_kes(summary.get('totalValueKES', 0))}</strong></div>
	  <div class="summary-cell"><span>Cost basis</span><strong>{_fmt_kes(summary.get('totalCostKES', 0))}</strong></div>
	  <div class="summary-cell"><span>Gain / loss</span><strong class="{gain_cls}">{_fmt_kes(summary.get('gainKES', 0))}</strong></div>
	  <div class="summary-cell"><span>Holdings</span><strong>{summary.get('holdingsCount', 0)}</strong></div>
	</div>
	<h2>Asset allocation</h2>
	<table><thead><tr><th>Class</th><th>%</th><th>Value</th></tr></thead><tbody>{alloc_rows or '<tr><td colspan="3">No holdings</td></tr>'}</tbody></table>
	<h2>Top holdings</h2>
	<table><thead><tr><th>Asset</th><th>Class</th><th>Value</th><th>P&amp;L</th></tr></thead><tbody>{hold_rows or '<tr><td colspan="4">No holdings</td></tr>'}</tbody></table>
	<h2>Goals snapshot</h2>
	<table><thead><tr><th>Goal</th><th>Status</th><th>Progress</th></tr></thead><tbody>{goal_rows or '<tr><td colspan="3">No goals</td></tr>'}</tbody></table>
	"""
	return _wrap_report(REPORT_LABELS["dashboard"], body, member)


def _build_portfolio_html(member: str) -> str:
	rows = frappe.get_all(
		"Growe Holding",
		filters={"investor": member, "sold": 0},
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
		  <td>{_fmt_kes(cost)}</td>
		  <td>{_fmt_kes(val)}</td>
		  <td class="{'positive' if gain >= 0 else 'negative'}">{_fmt_kes(gain)} ({gain_pct:+.1f}%)</td>
		</tr>"""

	gain_cls = "positive" if summary.get("gainKES", 0) >= 0 else "negative"
	body = f"""
	<p>Performance summary as of {formatdate(today(), 'dd MMM yyyy')}.</p>
	<div class="summary-grid">
	  <div class="summary-cell"><span>Total value</span><strong>{_fmt_kes(summary.get('totalValueKES', 0))}</strong></div>
	  <div class="summary-cell"><span>Total cost</span><strong>{_fmt_kes(summary.get('totalCostKES', 0))}</strong></div>
	  <div class="summary-cell"><span>Unrealized P&amp;L</span><strong class="{gain_cls}">{_fmt_kes(summary.get('gainKES', 0))}</strong></div>
	  <div class="summary-cell"><span>Return</span><strong class="{gain_cls}">{flt(summary.get('gainPercent', 0)):+.1f}%</strong></div>
	</div>
	<h2>Holdings</h2>
	<table>
	  <thead><tr><th>Asset</th><th>Class</th><th>Qty</th><th>Cost</th><th>Value</th><th>P&amp;L</th></tr></thead>
	  <tbody>{table_rows or '<tr><td colspan="6">No active holdings</td></tr>'}</tbody>
	</table>
	"""
	return _wrap_report(REPORT_LABELS["portfolio"], body, member)


def _build_goals_html(member: str) -> str:
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
	return _wrap_report(REPORT_LABELS["goals"], body, member)


def _build_tax_html(member: str) -> str:
	rows = frappe.get_all(
		"Growe Holding",
		filters={"investor": member, "sold": 0},
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
		  <td>{_fmt_kes(cost)}</td>
		  <td>{_fmt_kes(val)}</td>
		  <td class="{'positive' if gain >= 0 else 'negative'}">{_fmt_kes(gain)}</td>
		</tr>"""

	net = total_gain - total_loss
	body = f"""
	<p>Indicative tax-related summary based on unrealized portfolio gains and losses. Consult a tax professional for filing.</p>
	<div class="summary-grid">
	  <div class="summary-cell"><span>Unrealized gains</span><strong class="positive">{_fmt_kes(total_gain)}</strong></div>
	  <div class="summary-cell"><span>Unrealized losses</span><strong class="negative">{_fmt_kes(total_loss)}</strong></div>
	  <div class="summary-cell"><span>Net unrealized</span><strong>{_fmt_kes(net)}</strong></div>
	  <div class="summary-cell"><span>Tax year</span><strong>{today()[:4]}</strong></div>
	</div>
	<h2>By holding</h2>
	<table>
	  <thead><tr><th>Asset</th><th>Class</th><th>Cost</th><th>Market value</th><th>Unrealized</th></tr></thead>
	  <tbody>{table_rows or '<tr><td colspan="5">No holdings</td></tr>'}</tbody>
	</table>
	"""
	return _wrap_report(REPORT_LABELS["tax"], body, member)


_BUILDERS = {
	"dashboard": _build_dashboard_html,
	"portfolio": _build_portfolio_html,
	"goals": _build_goals_html,
	"tax": _build_tax_html,
}


def _validate_report_type(report_type: str) -> str:
	rt = (report_type or "").strip().lower()
	if rt not in _BUILDERS:
		frappe.throw(_("Unknown report type: {0}").format(report_type))
	return rt


def _build_html(report_type: str, member: str) -> str:
	return _BUILDERS[_validate_report_type(report_type)](member)


@frappe.whitelist()
def preview_report(report_type: str):
	"""Return HTML for in-app preview."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in."), frappe.AuthenticationError)
	member = _member_name()
	rt = _validate_report_type(report_type)
	return {
		"reportType": rt,
		"title": REPORT_LABELS[rt],
		"html": _build_html(rt, member),
	}


@frappe.whitelist()
def download_report(report_type: str):
	"""Stream a PDF download."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in."), frappe.AuthenticationError)
	member = _member_name()
	rt = _validate_report_type(report_type)
	html = _build_html(rt, member)

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
