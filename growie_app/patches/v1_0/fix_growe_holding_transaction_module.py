"""Install / repair Growe Holding Transaction under Investment App."""

import frappe

DOCTYPE = "Growe Holding Transaction"
EXPECTED_MODULE = "Investment App"


def execute():
	if frappe.db.exists("DocType", DOCTYPE):
		module = frappe.db.get_value("DocType", DOCTYPE, "module")
		if module != EXPECTED_MODULE:
			frappe.db.set_value("DocType", DOCTYPE, "module", EXPECTED_MODULE, update_modified=False)

	frappe.reload_doc("investment_app", "doctype", "growe_holding_transaction")
	frappe.clear_cache(doctype=DOCTYPE)
