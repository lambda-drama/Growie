"""Rename legacy NSE market routing values to Kenya in Select fields."""

import frappe

from growie_app.utils.market_labels import KENYA, LEGACY_KENYA


def execute():
	updates = [
		("Growe Stock", "market"),
		("Growe Price Cache", "market"),
		("Growe Price API", "market_type"),
		("Growe Holding Transaction", "market_tag"),
		("Growe Insight", "market"),
	]
	for doctype, fieldname in updates:
		if not frappe.db.has_column(doctype, fieldname):
			continue
		frappe.db.sql(
			f"""
			UPDATE `tab{doctype}`
			SET `{fieldname}` = %(kenya)s
			WHERE `{fieldname}` = %(legacy)s
			""",
			{"kenya": KENYA, "legacy": LEGACY_KENYA},
		)

	if frappe.db.has_column("Growe Community Post", "category"):
		frappe.db.sql(
			"""
			UPDATE `tabGrowe Community Post`
			SET category = 'Kenya Stocks'
			WHERE category = 'NSE Stocks'
			"""
		)

	frappe.db.commit()
