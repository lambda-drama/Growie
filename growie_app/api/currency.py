import frappe
from frappe.utils import fmt_money, flt

from growie_app.api.portfolio import kes_per_unit_foreign


def _resolve_multiplier(base_currency: str, target_currency: str, tx_date: str) -> float:
	"""
	Return multiplier such that amount_target = amount_base * multiplier.
	Uses growie_app portfolio DB lookup (no erpnext.setup.utils import).
	"""
	b = (base_currency or "USD").upper().strip()
	t = (target_currency or "USD").upper().strip()
	if b == t:
		return 1.0

	# amount in T = amount in B * (KES per B) / (KES per T)
	kes_per_b = kes_per_unit_foreign(b, tx_date, strict=False)
	kes_per_t = kes_per_unit_foreign(t, tx_date, strict=False)
	if kes_per_b > 0 and kes_per_t > 0:
		return kes_per_b / kes_per_t

	return 0.0


@frappe.whitelist()
def get_exchange_rate_for_currency(target_currency: str, base_currency: str = "USD"):
	"""
	Return multiplier for amount_in_target = amount_in_base * multiplier.
	Defaults to USD base to avoid hard-coded KES assumptions.
	"""
	code = (target_currency or "USD").upper().strip()
	base = (base_currency or "USD").upper().strip()
	if code == base:
		return 1.0

	tx_date = frappe.utils.today()
	rate = _resolve_multiplier(base, code, tx_date)
	if rate > 0:
		frappe.logger("growie.currency").info(
			"Resolved exchange rate",
			extra={"base_currency": base, "target_currency": code, "rate": rate, "date": tx_date},
		)
		return rate

	frappe.log_error(
		title="Growe Currency Rate Missing",
		message=f"Could not resolve rate. base={base}, target={code}, date={tx_date}, resolved={rate}",
	)
	return 1.0


@frappe.whitelist()
def convert_portfolio_amounts(amounts_kes: list, target_currency: str, base_currency: str = "USD"):
	code = (target_currency or "USD").upper().strip()
	base = (base_currency or "USD").upper().strip()
	if code == base:
		return [{"base": a, "converted": a, "formatted": fmt_money(a, currency=base), "rate": 1.0} for a in amounts_kes]

	rate = get_exchange_rate_for_currency(code, base)

	return [
		{
			"base": amount,
			"converted": flt(amount) * flt(rate),
			"formatted": fmt_money(flt(amount) * flt(rate), currency=code),
			"rate": rate,
		}
		for amount in amounts_kes
	]
