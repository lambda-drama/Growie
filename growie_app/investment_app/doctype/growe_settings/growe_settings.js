// Copyright (c) 2026, Mania and contributors
// For license information, please see license.txt

frappe.ui.form.on("Growe Settings", {
	refresh(frm) {
		if (!frappe.user.has_role("System Manager")) {
			return;
		}

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
