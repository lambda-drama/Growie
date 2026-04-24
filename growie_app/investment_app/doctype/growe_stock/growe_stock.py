# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document

class GroweStock(Document):
	def autoname(self):
		ticker = self.ticker or "UNIT"
		company_name = self.company_name or "GEN"
		self.name = f"{ticker}-{company_name}"
