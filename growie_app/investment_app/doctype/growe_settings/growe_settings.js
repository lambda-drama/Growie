// Copyright (c) 2026, Mania and contributors
// For license information, please see license.txt

frappe.ui.form.on("Growe Settings", {
	refresh(frm) {
		if (!frappe.user.has_role("System Manager")) {
			return;
		}

		frm.add_custom_button(
			__("Upload stock holdings"),
			function () {
				_show_holdings_upload_dialog(frm);
			},
			__("Holdings")
		);

		frm.add_custom_button(
			__("Migrate exchange platform IDs"),
			function () {
				frappe.confirm(
					__(
						"This will rename Growe Exchange Platform records to use exchange_code as the document ID, " +
							"update Growe Stock and other links, then refresh Growe Stock names to match. " +
							"Records without an exchange_code are skipped. The job runs in the background. Continue?"
					),
					function () {
						frappe.call({
							method: "growie_app.api.settings.enqueue_migrate_growe_exchange_platform_ids",
							freeze: true,
							freeze_message: __("Starting migration…"),
							callback(r) {
								const msg = r.message || {};
								if (msg.ok) {
									frappe.show_alert({ message: msg.message, indicator: "green" }, 8);
									frm.reload_doc();
								} else {
									frappe.msgprint({
										title: __("Migration"),
										indicator: "orange",
										message: msg.message || __("Could not start migration."),
									});
								}
							},
						});
					}
				);
			},
			__("Maintenance")
		);

		frm.add_custom_button(
			__("Migrate Growe Stock names"),
			function () {
				frappe.confirm(
					__(
						"This will rename all Growe Stock records to the ticker-exchange_platform format, " +
							"re-link holdings and related records, merge duplicates, and delete the old names. " +
							"The job runs in the background. Continue?"
					),
					function () {
						frappe.call({
							method: "growie_app.api.settings.enqueue_migrate_growe_stock_names",
							freeze: true,
							freeze_message: __("Starting migration…"),
							callback(r) {
								const msg = r.message || {};
								if (msg.ok) {
									frappe.show_alert({ message: msg.message, indicator: "green" }, 8);
									frm.reload_doc();
								} else {
									frappe.msgprint({
										title: __("Migration"),
										indicator: "orange",
										message: msg.message || __("Could not start migration."),
									});
								}
							},
						});
					}
				);
			},
			__("Maintenance")
		);
	},
});

function _show_holdings_upload_dialog(frm) {
	const d = new frappe.ui.Dialog({
		title: __("Upload stock holdings"),
		fields: [
			{
				fieldname: "investor",
				fieldtype: "Link",
				options: "Growe Member",
				label: __("Growe Member"),
				reqd: 1,
				description: __(
					"Holdings in the Excel file will be created for this member."
				),
			},
			{
				fieldname: "holdings_file",
				fieldtype: "Attach",
				label: __("Holdings Excel (.xlsx)"),
				reqd: 1,
				description: __(
					"Columns: Purchase Dates, Investment, Ticker Number, " +
						"API Ticker Number (= US Ticker Number), ISO MIC Exchange, " +
						"Broker, Shares Breakdown, Buying Price, Goal."
				),
			},
		],
		primary_action_label: __("Import"),
		primary_action(values) {
			if (!values.investor || !values.holdings_file) {
				frappe.msgprint(__("Select a member and attach an Excel file."));
				return;
			}
			d.get_primary_btn().prop("disabled", true);
			frappe.call({
				method: "growie_app.api.settings.import_holdings_excel",
				args: {
					file_url: values.holdings_file,
					investor: values.investor,
				},
				freeze: true,
				freeze_message: __("Importing holdings…"),
				callback(r) {
					d.get_primary_btn().prop("disabled", false);
					const msg = r.message || {};
					if (!msg.ok) {
						frappe.msgprint({
							title: __("Import failed"),
							indicator: "red",
							message: msg.message || __("Could not import holdings."),
						});
						return;
					}
					d.hide();
					const err_count = (msg.errors || []).length;
					let detail = msg.message || __("Import complete.");
					if (err_count) {
						detail +=
							"<br><br><b>" +
							__("Row errors ({0}):", [err_count]) +
							"</b><br><pre style='max-height:240px;overflow:auto;white-space:pre-wrap;'>" +
							frappe.utils.escape_html((msg.errors || []).slice(0, 40).join("\n")) +
							(err_count > 40 ? "\n…" : "") +
							"</pre>";
					}
					frappe.msgprint({
						title: __("Holdings import"),
						indicator: err_count ? "orange" : "green",
						message: detail,
					});
					frm.reload_doc();
				},
				error() {
					d.get_primary_btn().prop("disabled", false);
				},
			});
		},
	});
	d.show();
}
