// Copyright (c) 2026, Mania and contributors
// For license information, please see license.txt

const PROVIDER_HINTS = {
	"Claude": {
		api_base_url: "",
		model: "claude-opus-4-7",
		note: [
			"<b>Anthropic Claude</b> — Get API key at <a href='https://console.anthropic.com' target='_blank'>console.anthropic.com</a><br>",
			"<b>Claude 4 models (latest, no temperature param):</b><br>",
			"&nbsp; claude-opus-4-7 &nbsp;·&nbsp; claude-sonnet-4-5<br>",
			"<b>Claude 3.5 models:</b><br>",
			"&nbsp; claude-3-5-sonnet-20241022 &nbsp;·&nbsp; claude-3-5-haiku-20241022<br>",
			"⚠ Click <b>Test Connection</b> to see which models your key can access.",
		].join(""),
	},
	"OpenAI": {
		api_base_url: "https://api.openai.com/v1",
		model: "gpt-4o-mini",
		note: [
			"<b>OpenAI</b> — Get API key at <a href='https://platform.openai.com' target='_blank'>platform.openai.com</a>",
			"<br><b>Valid model names:</b> gpt-4o &nbsp;·&nbsp; gpt-4o-mini &nbsp;·&nbsp; gpt-4-turbo &nbsp;·&nbsp; gpt-3.5-turbo",
		].join(""),
	},
	"Gemini": {
		api_base_url: "",
		model: "gemini-1.5-flash",
		note: [
			"<b>Google Gemini</b> — generous free tier. Get key at <a href='https://aistudio.google.com' target='_blank'>aistudio.google.com</a>",
			"<br><b>Valid model names:</b> gemini-1.5-flash &nbsp;·&nbsp; gemini-1.5-pro &nbsp;·&nbsp; gemini-2.0-flash",
			"<br>Leave API Base URL <b>blank</b> — it is auto-set.",
		].join(""),
	},
	"Groq": {
		api_base_url: "https://api.groq.com/openai/v1",
		model: "llama-3.3-70b-versatile",
		note: [
			"<b>Groq</b> — fastest inference (OpenAI-compatible). Get key at <a href='https://console.groq.com' target='_blank'>console.groq.com</a>",
			"<br><b>Valid model names:</b> llama-3.3-70b-versatile &nbsp;·&nbsp; llama-3.1-70b-versatile &nbsp;·&nbsp; mixtral-8x7b-32768",
		].join(""),
	},
	"DeepSeek": {
		api_base_url: "https://api.deepseek.com/v1",
		model: "deepseek-chat",
		note: [
			"<b>DeepSeek</b> — very affordable. Get key at <a href='https://platform.deepseek.com' target='_blank'>platform.deepseek.com</a>",
			"<br><b>Valid model names:</b> deepseek-chat &nbsp;·&nbsp; deepseek-reasoner",
		].join(""),
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
				freeze_message: __("Testing connection… (fetching available models)"),
				callback(r) {
					const msg = r.message || {};
					const models = (msg.available_models || []);
					const modelsHtml = models.length
						? `<br><br><b>Models available for your API key:</b><br><code>${models.join("<br>")}</code>`
						: "";

					if (msg.success) {
						frappe.msgprint({
							title: __("Connection Successful ✓"),
							message: `<b>Model used:</b> ${msg.model}<br><b>Reply:</b> ${msg.reply}${modelsHtml}`,
							indicator: "green",
						});
					} else {
						const err = msg.error || "Unknown error";
						// Extract model hint from error
						const modelFix = models.length
							? `<br><br>✅ <b>Use one of these models for your key:</b><br><code>${models.join("<br>")}</code>`
							: `<br><br>💡 If the error says "model not found", your API key may be unverified.<br>
								Verify your Anthropic account at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>
								or try a different provider (Groq is free with no verification needed).`;
						frappe.msgprint({
							title: __("Connection Failed ✗"),
							message: `<pre style="color:red;white-space:pre-wrap;">${err}</pre>${modelFix}`,
							indicator: "red",
						});
					}
					frm.reload_doc();
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
