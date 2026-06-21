# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class GroweStock(Document):
	def autoname(self):
		ticker = self.ticker or "UNIT"
		# company_name = self.company_name or "GEN"
		exchange_platform = self.exchange_platform or "NSE"
		self.name = f"{ticker}-{exchange_platform}"

	def before_save(self):
		if self.is_new():
			self._verified_before_save = 0
		else:
			self._verified_before_save = int(
				frappe.db.get_value("Growe Stock", self.name, "verified") or 0
			)

	def on_update(self):
		was = getattr(self, "_verified_before_save", 1)
		now = int(self.verified or 0)
		if was == 0 and now == 1:
			from growie_app.utils.stock_verification import notify_member_stock_verified

			notify_member_stock_verified(self)
			# Close open verification ToDos for this stock.
			for todo_name in frappe.get_all(
				"ToDo",
				filters={
					"reference_type": "Growe Stock",
					"reference_name": self.name,
					"status": "Open",
				},
				pluck="name",
			):
				frappe.db.set_value("ToDo", todo_name, "status", "Closed", update_modified=True)
