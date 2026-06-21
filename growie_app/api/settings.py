"""Growe Settings maintenance actions."""

import frappe
from frappe import _


@frappe.whitelist()
def enqueue_migrate_growe_stock_names():
	"""Start background migration: legacy Growe Stock names → ticker-exchange_platform."""
	frappe.only_for("System Manager")

	job_id = "migrate_growe_stock_names"
	if frappe.utils.background_jobs.is_job_enqueued(job_id):
		return {
			"ok": False,
			"message": _("Stock naming migration is already running. Check back shortly."),
		}

	frappe.enqueue(
		method="growie_app.utils.migrate_growe_stock_names.run_migrate_growe_stock_names_job",
		queue="long",
		timeout=3600,
		job_id=job_id,
		deduplicate=True,
		enqueue_after_commit=True,
	)

	return {
		"ok": True,
		"message": _(
			"Stock naming migration started in the background. "
			"Holdings will be re-linked automatically; refresh this page later for the summary."
		),
	}
