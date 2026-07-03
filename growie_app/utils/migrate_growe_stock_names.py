"""
Rename Growe Stock records from legacy names (ticker-company_name) to ticker-exchange_platform.

Re-links all references via frappe.rename_doc, merges duplicates when the target name already
exists, then removes the old document name.
"""

from __future__ import annotations

import frappe
from frappe.utils import now_datetime

STOCK_META_FIELDS = [
	"name",
	"ticker",
	"company_name",
	"market",
	"instrument_type",
	"region",
	"exchange_platform",
	"sector",
	"currency",
	"is_active",
	"country",
	"industry",
	"preferred_data_provider",
	"source",
	"api_symbol",
	"isin",
	"verified",
	"by_unsubscribed_member",
]


def target_stock_name(ticker: str | None, exchange_platform: str | None) -> str:
	ticker_val = (ticker or "UNIT").strip().upper()
	exchange_val = (exchange_platform or "NSE").strip()
	return f"{ticker_val}-{exchange_val}"


def _find_exchange_platform_link(exchange: str) -> str | None:
	"""Resolve a legacy or current Growe Exchange Platform document name."""
	exchange = (exchange or "").strip()
	if not exchange:
		return None
	if frappe.db.exists("Growe Exchange Platform", exchange):
		return exchange
	for field in ("platform_name", "exchange_code"):
		match = frappe.db.get_value("Growe Exchange Platform", {field: exchange}, "name")
		if match:
			return match
	return None


def _resolve_exchange(stock: dict) -> tuple[str, str | None]:
	"""Return (exchange for naming, link value to persist when missing)."""
	current = (stock.get("exchange_platform") or "").strip()
	if current:
		link = _find_exchange_platform_link(current) or current
		return link, None if link == current else link

	from growie_app.api.stack import _infer_region_exchange_for_stock

	_region, inferred = _infer_region_exchange_for_stock(stock)
	exchange = (inferred or "").strip()
	if not exchange:
		market = (stock.get("market") or "").strip()
		exchange = "NSE" if market == "NSE" else "NASDAQ"

	link_value = _find_exchange_platform_link(exchange)
	if not link_value:
		fallback = "NSE" if (stock.get("market") or "").strip() == "NSE" else "NASDAQ"
		link_value = _find_exchange_platform_link(fallback)
		if link_value and not _find_exchange_platform_link(exchange):
			exchange = link_value

	return exchange if link_value else exchange, link_value


def migrate_growe_stock_names(*, dry_run: bool = False) -> dict:
	rows = frappe.get_all("Growe Stock", fields=STOCK_META_FIELDS, limit=0)

	renamed = 0
	merged = 0
	skipped = 0
	errors: list[dict] = []
	samples: list[dict] = []

	for row in rows:
		old_name = row["name"]
		try:
			exchange, link_to_set = _resolve_exchange(row)
			if link_to_set and not dry_run:
				frappe.db.set_value(
					"Growe Stock",
					old_name,
					"exchange_platform",
					link_to_set,
					update_modified=False,
				)
				row["exchange_platform"] = link_to_set

			target = target_stock_name(row.get("ticker"), exchange)
			if old_name == target:
				skipped += 1
				continue

			if dry_run:
				renamed += 1
				if len(samples) < 30:
					samples.append({"from": old_name, "to": target})
				continue

			if frappe.db.exists("Growe Stock", target):
				frappe.rename_doc("Growe Stock", old_name, target, force=True, merge=True)
				merged += 1
			else:
				frappe.rename_doc("Growe Stock", old_name, target, force=True)
				renamed += 1

			if len(samples) < 30:
				samples.append({"from": old_name, "to": target})
		except Exception as exc:
			errors.append({"name": old_name, "error": str(exc)})
			frappe.log_error(
				title=f"Growe Stock naming migration failed ({old_name})",
				message=frappe.get_traceback(),
			)

	if not dry_run:
		frappe.db.commit()

	return {
		"dry_run": dry_run,
		"total": len(rows),
		"renamed": renamed,
		"merged": merged,
		"skipped": skipped,
		"errors": errors[:20],
		"error_count": len(errors),
		"samples": samples,
	}


def run_migrate_growe_stock_names_job() -> dict:
	"""Background worker — updates Growe Settings with a short summary when done."""
	result = migrate_growe_stock_names(dry_run=False)
	summary = (
		f"{now_datetime()}: renamed={result['renamed']}, merged={result['merged']}, "
		f"skipped={result['skipped']}, errors={result['error_count']}"
	)
	frappe.db.set_value(
		"Growe Settings",
		"Growe Settings",
		"last_stock_naming_migration",
		summary,
		update_modified=True,
	)
	frappe.db.commit()
	return result
