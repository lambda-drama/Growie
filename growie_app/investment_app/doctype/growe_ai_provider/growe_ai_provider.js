// Copyright (c) 2026, Mania and contributors
// For license information, please see license.txt

const PROVIDER_HINTS = {
	"Claude": {
		api_base_url: "",
		model: "claude-3-5-sonnet-20241022",
		note: "Anthropic Claude — best reasoning quality. Get key at console.anthropic.com",
	},
	"OpenAI": {
		api_base_url: "https://api.openai.com/v1",
		model: "gpt-4o-mini",
		note: "OpenAI GPT — reliable and widely used. Get key at platform.openai.com",
	},
	"Gemini": {
		api_base_url: "https://generativelanguage.googleapis.com/v1beta",
		model: "gemini-1.5-flash",
		note: "Google Gemini — generous free tier. Get key at aistudio.google.com",
	},
	"Groq": {
		api_base_url: "https://api.groq.com/openai/v1",
		model: "llama-3.3-70b-versatile",
		note: "Groq — fastest inference, OpenAI-compatible. Get key at console.groq.com",
	},
	"DeepSeek": {
		api_base_url: "https://api.deepseek.com/v1",
		model: "deepseek-chat",
		note: "DeepSeek — very affordable. Get key at platform.deepseek.com",
	},
};

frappe.ui.form.on("Growe AI Provider", {
	refresh(frm) {
		// Test Connection button
		frm.add_custom_button(__("Test Connection"), function () {
			frappe.call({
				method: "growie_app.api.ai.test_provider",
				args: { provider_name: frm.doc.name },
				freeze: true,
				freeze_message: __("Testing connection…"),
				callback(r) {
					if (r.message && r.message.success) {
						frappe.msgprint({
							title: __("Connection Successful ✓"),
							message: `<b>Model:</b> ${r.message.model}<br><b>Reply:</b> ${r.message.reply}`,
							indicator: "green",
						});
					} else {
						const err = (r.message && r.message.error) || "Unknown error";
						frappe.msgprint({
							title: __("Connection Failed ✗"),
							message: `<pre style="color:red;white-space:pre-wrap;">${err}</pre>`,
							indicator: "red",
						});
					}
				},
			});
		}, __("Actions"));

		// Show provider hint note
		_show_provider_hint(frm);
	},

	provider(frm) {
		_apply_provider_defaults(frm);
		_show_provider_hint(frm);
	},
});

function _apply_provider_defaults(frm) {
	const hints = PROVIDER_HINTS[frm.doc.provider];
	if (!hints) return;

	// Only auto-fill if the fields are currently empty to avoid overwriting
	if (!frm.doc.api_base_url) {
		frm.set_value("api_base_url", hints.api_base_url);
	}
	if (!frm.doc.model) {
		frm.set_value("model", hints.model);
	}
}

function _show_provider_hint(frm) {
	frm.dashboard.clear_comment();
	const hints = PROVIDER_HINTS[frm.doc.provider];
	if (!hints || !hints.note) return;
	frm.dashboard.add_comment(hints.note, "blue", true);
}
