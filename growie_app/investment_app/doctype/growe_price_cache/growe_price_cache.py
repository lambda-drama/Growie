# Copyright (c) 2026, Mania and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class GrowePriceCache(Document):
	"""
	Live price snapshot per Growe Stock (autoname = stock).

	Main fields hold the current quote (KES/USD, change %, source, fetched_at).
	On each refresh, the previous quote is appended to Growe Historical Price
	(date + currency + price) before the main fields are overwritten.
	"""

	pass
