// Copyright (c) 2026, Mania and contributors
// For license information, please see license.txt

frappe.ui.form.on('News Settings', {
	refresh(frm) {
		frm.add_custom_button('Fetch Best News Now', async () => {
			frappe.dom.freeze('Fetching and drafting insights...')
			try {
				const res = await frappe.call({
					method: 'growie_app.investment_app.doctype.news_settings.news_settings.fetch_best_news_now',
				})
				frappe.show_alert({
					message: `Created ${res.message?.created || 0} insight drafts`,
					indicator: 'green',
				})
			} finally {
				frappe.dom.unfreeze()
			}
		})
	},
})
