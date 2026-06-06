# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import flt


class GroweHolding(Document):
	def before_save(self):
		self._sync_quantity_fields()
		self._sync_initial_investment_value()

	def _sync_quantity_fields(self) -> None:
		"""Keep quantity and share_breakdown aligned (template + API use either)."""
		qty = flt(self.quantity) or flt(self.share_breakdown)
		if qty <= 0:
			return
		if not flt(self.quantity):
			self.quantity = qty
		if not flt(self.share_breakdown):
			self.share_breakdown = qty

	def _sync_initial_investment_value(self) -> None:
		"""Initial investment = buying price × shares (in holding currency)."""
		qty = flt(self.quantity) or flt(self.share_breakdown)
		buy = flt(self.buying_price)
		if qty <= 0 or buy <= 0:
			return
		self.initial_investment_value = buy * qty
