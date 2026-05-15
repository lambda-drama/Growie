# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class GroweHoldingTransaction(Document):
	def validate(self):
		if flt(self.quantity) <= 0:
			frappe.throw(_("Quantity must be greater than zero."))
		if self.transaction_type not in ("Buy", "Sell"):
			frappe.throw(_("Type must be Buy or Sell."))
		if self.holding and self.member:
			owner = frappe.db.get_value("Growe Holding", self.holding, "investor")
			if owner and owner != self.member:
				frappe.throw(_("Holding does not belong to this member."))
