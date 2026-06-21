"""
Re-link holdings from import duplicate Growe Stock rows to the verified master row
(same ticker), then remove the duplicate unverified listing.
"""

import frappe

from growie_app.utils.stock_verification import pick_best_stock_for_ticker


def execute():
	tickers = frappe.db.sql(
		"""
		SELECT ticker
		FROM `tabGrowe Stock`
		WHERE ticker IS NOT NULL AND ticker != ''
		GROUP BY ticker
		HAVING COUNT(*) > 1
		""",
		as_dict=True,
	)

	for row in tickers:
		ticker = (row.ticker or "").strip()
		if not ticker:
			continue

		master = pick_best_stock_for_ticker(ticker)
		if not master or not int(frappe.db.get_value("Growe Stock", master, "verified") or 0):
			continue

		others = frappe.get_all(
			"Growe Stock",
			filters={"ticker": ticker, "name": ["!=", master]},
			pluck="name",
		)
		for dup in others:
			if int(frappe.db.get_value("Growe Stock", dup, "verified") or 0):
				continue
			frappe.db.sql(
				"""
				UPDATE `tabGrowe Holding`
				SET asset_name = %(master)s
				WHERE asset_name = %(dup)s
				""",
				{"master": master, "dup": dup},
			)
			frappe.delete_doc("Growe Stock", dup, force=1, ignore_permissions=True)

	frappe.db.commit()
