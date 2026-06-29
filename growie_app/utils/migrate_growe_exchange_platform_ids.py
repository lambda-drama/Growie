"""
Rename Growe Exchange Platform document IDs from legacy platform_name values to exchange_code.

Re-links Growe Stock, Growe Price Cache, and other Link fields via frappe.rename_doc,
then re-runs Growe Stock naming so ticker-exchange_platform names match the new codes.
"""

from __future__ import annotations

import frappe
from frappe.utils import now_datetime

from growie_app.utils.migrate_growe_stock_names import migrate_growe_stock_names

PLATFORM_FIELDS = [
	"name",
	"platform_name",
	"exchange_code",
	"full_name",
	"region",
	"country",
]


def migrate_growe_exchange_platform_ids(*, dry_run: bool = False) -> dict:
	rows = frappe.get_all("Growe Exchange Platform", fields=PLATFORM_FIELDS, limit=0)

	renamed = 0
	merged = 0
	skipped = 0
	errors: list[dict] = []
	samples: list[dict] = []
	missing_code: list[str] = []

	for row in rows:
		old_name = row["name"]
		code = (row.get("exchange_code") or "").strip()
		if not code:
			missing_code.append(old_name)
			skipped += 1
			continue
		if old_name == code:
			skipped += 1
			continue

		try:
			action = "merge" if frappe.db.exists("Growe Exchange Platform", code) else "rename"
			if dry_run:
				if action == "merge":
					merged += 1
				else:
					renamed += 1
				if len(samples) < 30:
					samples.append({"from": old_name, "to": code, "action": action})
				continue

			if action == "merge":
				frappe.rename_doc(
					"Growe Exchange Platform",
					old_name,
					code,
					force=True,
					merge=True,
				)
				merged += 1
			else:
				frappe.rename_doc("Growe Exchange Platform", old_name, code, force=True)
				renamed += 1

			if len(samples) < 30:
				samples.append({"from": old_name, "to": code, "action": action})
		except Exception as exc:
			errors.append({"name": old_name, "to": code, "error": str(exc)})
			frappe.log_error(
				title=f"Growe Exchange Platform ID migration failed ({old_name} → {code})",
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
		"missing_exchange_code": missing_code[:20],
		"missing_exchange_code_count": len(missing_code),
		"errors": errors[:20],
		"error_count": len(errors),
		"samples": samples,
	}


def run_migrate_growe_exchange_platform_ids_job() -> dict:
	"""Background worker — renames platforms, then refreshes Growe Stock names."""
	platform_result = migrate_growe_exchange_platform_ids(dry_run=False)
	stock_result = migrate_growe_stock_names(dry_run=False)

	summary = (
		f"{now_datetime()}: platforms renamed={platform_result['renamed']}, "
		f"merged={platform_result['merged']}, skipped={platform_result['skipped']}, "
		f"missing_code={platform_result['missing_exchange_code_count']}, "
		f"platform_errors={platform_result['error_count']}; "
		f"stocks renamed={stock_result['renamed']}, merged={stock_result['merged']}, "
		f"stock_errors={stock_result['error_count']}"
	)
	frappe.db.set_value(
		"Growe Settings",
		"Growe Settings",
		"last_exchange_platform_migration",
		summary,
		update_modified=True,
	)
	frappe.db.commit()

	return {
		"platforms": platform_result,
		"stocks": stock_result,
	}
