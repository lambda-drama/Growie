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
				const msg = res.message || {}
				const created = msg.created ?? 0
				const skipped = msg.skipped_duplicates ?? 0
				const errors = Array.isArray(msg.errors) ? msg.errors.filter(Boolean) : []
				if (msg.inactive) {
					frappe.msgprint({
						title: __('News fetch disabled'),
						message:
							errors.join(' ') ||
							__('Turn on Activate on News Settings to allow fetching.'),
						indicator: 'red',
					})
				} else {
					const rw = msg.rewrite_with_ai ? ' (Rewrite with AI).' : ''
					let text = `Created ${created} insight + learning bite pairs. Skipped ${skipped} duplicates.${rw}`
					if (errors.length) {
						text += ` ${errors.length} notice(s) — see Error Log for details.`
						console.warn('News fetch notices:', errors)
					}
					frappe.show_alert({
						message: text,
						indicator: errors.length ? 'orange' : 'green',
					})
				}
			} finally {
				frappe.dom.unfreeze()
			}
		})
	},
})
