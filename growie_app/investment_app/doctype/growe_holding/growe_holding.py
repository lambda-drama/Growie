# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt, now_datetime, today


class GroweHolding(Document):
	def before_save(self):
		"""
		Runs on every save path (Desk, portfolio API, Stack buy, Excel import, Duplicate…).

		- If current_price is missing/0 → resolve from Growe Price Cache (ticker /
		  us_ticker_number / linked stock), else fetch (Kenya → Mansa, Global → Marketstack…).
		- If current_price is set but value is still 0 (common after Desk Duplicate) →
		  recompute value from current_price × quantity.
		"""
		self._sync_quantity_fields()
		self._sync_initial_investment_value()
		if flt(self.sold):
			return
		if self._current_price_missing():
			self._ensure_live_price()
		self._apply_value_from_current_price()

	def _current_price_missing(self) -> bool:
		"""True when current_price is None, blank, or zero."""
		return flt(self.current_price) <= 0

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

	def _apply_value_from_current_price(self) -> None:
		"""Keep current_value = current_price × qty in holding currency."""
		px = flt(self.current_price)
		qty = flt(self.quantity) or flt(self.share_breakdown)
		if px <= 0 or qty <= 0:
			return

		expected = qty * px
		# Always resync when missing/zero OR drifted from price×qty (e.g. FX refresh
		# updated current_price but left an old current_value).
		if flt(self.current_value) > 0 and abs(flt(self.current_value) - expected) < 1e-9:
			return

		self.current_value = expected
		self.last_updated = now_datetime()

	def _ensure_live_price(self) -> None:
		"""Fill current_price from cache or live price APIs when it is missing/0."""
		ticker = (self.ticker or "").strip()
		stock_name = (self.asset_name or "").strip()
		us = (self.us_ticker_number or "").strip()
		if not ticker and stock_name and frappe.db.exists("Growe Stock", stock_name):
			ticker = frappe.db.get_value("Growe Stock", stock_name, "ticker") or ""
			self.ticker = ticker
		if not us and stock_name and frappe.db.exists("Growe Stock", stock_name):
			us = frappe.db.get_value("Growe Stock", stock_name, "us_ticker_number") or ""
			if us and not self.us_ticker_number:
				self.us_ticker_number = us
		if not ticker and not us and not stock_name:
			return

		from growie_app.api.price import ensure_live_price_for_ticker, price_in_holding_currency

		ensure_live_price_for_ticker(
			ticker,
			stock_name=stock_name,
			us_ticker_number=us,
			fetch_if_missing=True,
		)

		ccy = (self.currency or "USD").upper()
		# Live market price → holding currency uses *today's* FX, not purchase date.
		px = price_in_holding_currency(
			ticker,
			ccy,
			str(today()),
			stock_name=stock_name,
			us_ticker_number=us,
			fetch_if_missing=False,
		)
		if px <= 0:
			return

		self.current_price = px
		# Seed buy price only when still empty (never overwrite an entered buy price).
		if not flt(self.buying_price):
			self.buying_price = px
		self.last_updated = now_datetime()
