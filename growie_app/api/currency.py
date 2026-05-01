import frappe
from frappe.utils import fmt_money, flt
from erpnext.setup.utils import get_exchange_rate


def _safe_rate(from_currency: str, to_currency: str, tx_date: str, args: str = None) -> float:
    """Best-effort rate fetch; never throws."""
    try:
        return flt(get_exchange_rate(from_currency, to_currency, tx_date, args) or 0)
    except Exception:
        return 0.0


def _resolve_multiplier(base_currency: str, target_currency: str, tx_date: str) -> float:
    """
    Return multiplier such that amount_target = amount_base * multiplier.
    Tries direct, inverse, then USD bridge.
    """
    b = (base_currency or "USD").upper().strip()
    t = (target_currency or "USD").upper().strip()
    if b == t:
        return 1.0

    # 1) direct
    direct = _safe_rate(b, t, tx_date, "for_buying") or _safe_rate(b, t, tx_date)
    if direct > 0:
        return direct

    # 2) inverse
    inv = _safe_rate(t, b, tx_date, "for_selling") or _safe_rate(t, b, tx_date)
    if inv > 0:
        return 1.0 / inv

    # 3) bridge through USD
    if b != "USD" and t != "USD":
        b_to_usd = _resolve_multiplier(b, "USD", tx_date)
        usd_to_t = _resolve_multiplier("USD", t, tx_date)
        if b_to_usd > 0 and usd_to_t > 0:
            return b_to_usd * usd_to_t

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
    # frappe.throw(
    #     f"No exchange rate found between {base} and {code} for {tx_date}. "
    #     "Please configure Currency Exchange in ERPNext."
    # )


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