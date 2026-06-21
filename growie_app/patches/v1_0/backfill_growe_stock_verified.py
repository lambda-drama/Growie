"""Mark all existing Growe Stock rows as verified (master seed data)."""

import frappe


def execute():
	frappe.db.sql(
		"""
		UPDATE `tabGrowe Stock`
		SET verified = 1
		WHERE IFNULL(verified, 0) = 0
		  AND IFNULL(by_unsubscribed_member, 0) = 0
		"""
	)
	frappe.db.commit()
