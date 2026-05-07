// Copyright (c) 2026, Mania and contributors
// For license information, please see license.txt

frappe.ui.form.on('Growe Holding', {
	refresh(frm) {
		frm.add_custom_button(__('Import from Excel (Scope template)'), () => {
			if (!frm.doc.investor) {
				frappe.msgprint(__('Set Investor (Growe Member) first, then import.'));
				return;
			}
			frappe.confirm(
				__(
					'Import all active and sold stock rows from your Excel into holdings for {0}? New Growe Stock records will be created when the ticker is missing.',
					[frm.doc.investor]
				),
				() => {
					new frappe.ui.FileUploader({
						allow_multiple: false,
						restrictions: {
							allowed_file_types: ['.xlsx', '.xls'],
						},
						on_success(file_doc) {
							const url = file_doc.file_url;
							if (!url) {
								frappe.msgprint(__('Upload failed — no file URL.'));
								return;
							}
							frappe.call({
								method: 'growie_app.utils.holdings_excel_import.import_scope_template_excel',
								args: {
									file_url: url,
									investor: frm.doc.investor,
								},
								freeze: true,
								freeze_message: __('Importing holdings…'),
								callback(r) {
									const m = r.message || {};
									const err = (m.errors || []).filter(Boolean);
									const parts = [
										__('Created: {0}', [m.created || 0]),
										__('Active rows: {0}', [m.active_rows ?? '—']),
										__('Sold rows: {0}', [m.sold_rows ?? '—']),
									];
									if (err.length) {
										parts.push(__('Issues: {0}', [err.slice(0, 8).join(' · ')]));
									}
									frappe.msgprint(parts.join('<br>'));
								},
							});
						},
					});
				}
			);
		});
	},
});
