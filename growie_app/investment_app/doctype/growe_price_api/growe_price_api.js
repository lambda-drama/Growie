// Copyright (c) 2026, Mania and contributors
// For license information, please see license.txt

frappe.ui.form.on("Growe Price API", {
	refresh(frm) {
		// ── Test Connection button ────────────────────────────────────────────────
		frm.add_custom_button(__("Test Connection"), function () {
			frappe.prompt(
				[
					{
						label: __("Test Ticker"),
						fieldname: "test_ticker",
						fieldtype: "Data",
						default: frm.doc.market_type === "Global" ? "AAPL" : "SCOM",
						description: __("e.g. SCOM for NSE, AAPL for Global"),
					},
					{
						label: __("Market"),
						fieldname: "market",
						fieldtype: "Select",
						options: "\nNSE\nGlobal",
						default: frm.doc.market_type === "Global" ? "Global" : "NSE",
					},
				],
				function (values) {
					frappe.call({
						method: "growie_app.api.price.test_provider",
						args: {
							provider_name: frm.doc.name,
							test_ticker: values.test_ticker || "SCOM",
							market: values.market || "NSE",
						},
						freeze: true,
						freeze_message: __("Connecting to {0}…", [frm.doc.provider_name]),
						callback: function (r) {
							frm.reload_doc(); // refresh last_test_result / last_test_at
							if (r.message && r.message.success) {
								const m = r.message;
								const cur = (m.currency || "").toUpperCase();
								const sym = cur === "USD" ? "$" : cur === "KES" ? "Sh " : "";
								const priceLabel =
									cur === "USD"
										? __("Live quote (USD)")
										: cur === "KES"
											? __("Live quote (KES)")
											: __("Live quote");
								frappe.msgprint({
									title: __("✅ Connection Successful"),
									indicator: "green",
									message: `
										<table class="table table-bordered" style="margin-top:8px">
											<tr><td><b>Ticker</b></td><td>${m.ticker}</td></tr>
											<tr><td><b>${priceLabel}</b></td><td>${sym}${Number(m.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td></tr>
											<tr><td><b>Change</b></td><td>${m.change_percent >= 0 ? "▲" : "▼"} ${Math.abs(m.change_percent).toFixed(2)}%</td></tr>
											<tr><td><b>Currency</b></td><td>${m.currency}</td></tr>
										</table>`,
								});
							} else {
								const err = r.message ? r.message.error : (r.exc || "Unknown error");
								frappe.msgprint({
									title: __("❌ Connection Failed"),
									indicator: "red",
									message: `<pre style="white-space:pre-wrap">${frappe.utils.escape_html(err)}</pre>`,
								});
							}
						},
					});
				},
				__("Test {0}", [frm.doc.provider_name || "Provider"]),
				__("Run Test")
			);
		}, __("Actions"));

		// ── Fetch All Prices Now button ───────────────────────────────────────────
		frm.add_custom_button(__("Refresh All Prices Now"), function () {
			frappe.confirm(
				__(
					"This will fetch live prices for all active listed tickers (portfolio tickers first) and update holding values. Continue?"
				),
				function () {
					frappe.call({
						method: "growie_app.api.price.refresh_prices",
						args: { provider_name: frm.doc.name },
						freeze: true,
						freeze_message: __("Fetching prices using {0}…", [frm.doc.provider_name || frm.doc.name]),
						callback: function (r) {
							if (r.message) {
								frappe.msgprint({
									title: __("✅ Prices Refreshed"),
									indicator: "green",
									message:
										`<b>NSE</b>: ${r.message.nse_updated} ticker(s) updated<br>` +
										`<b>Global</b>: ${r.message.global_updated} ticker(s) updated`,
								});
							}
						},
					});
				}
			);
		}, __("Actions"));

		// ── Fetch NSE Index button (Mansa only) ──────────────────────────────────
		const api_prov = (frm.doc.api_provider || "").toLowerCase();
		if (api_prov.includes("mansa")) {
			frm.add_custom_button(__("Fetch NSE Index"), function () {
				frappe.call({
					method: "growie_app.api.price.get_nse_index",
					freeze: true,
					freeze_message: __("Fetching NSE index from Mansa Markets…"),
					callback: function (r) {
						if (r.message) {
							const d = r.message;
							frappe.msgprint({
								title: __("NSE Index"),
								indicator: "blue",
								message:
									`<b>Index Value:</b> ${d.index_value || d.value || "–"}<br>` +
									`<b>Change:</b> ${d.change_pct !== undefined ? d.change_pct + "%" : "–"}<br>` +
									`<b>Exchange:</b> ${d.exchange || "NSE"}`,
							});
						} else {
							frappe.msgprint(__("No index data returned. Check your API key and provider config."));
						}
					},
				});
			}, __("Actions"));
		}

		// ── Alpha Vantage rate-limit warning ─────────────────────────────────────
		if (api_prov.includes("alpha vantage")) {
			frm.dashboard.add_comment(
				__("⚠ Alpha Vantage free tier: <b>25 requests/day</b>. Each symbol = 1 request. " +
				   "Use sparingly or upgrade to a paid key for production."),
				"yellow",
				true
			);
		}

		if (api_prov.includes("finnhub")) {
			frm.dashboard.add_comment(
				__("<b>Test Connection</b> shows the raw quote returned by Finnhub. " +
				   "<b>Refresh prices</b> fills <b>Growe Price Cache</b> with USD and KES fields per ticker. " +
				   "Symbols (e.g. <code>AAPL</code>); override via <b>Growe Stock → API Symbol</b>. " +
				   "<a href=\"https://finnhub.io/docs/api\" target=\"_blank\">Docs</a>"),
				"blue",
				true
			);
		}

		if (api_prov.includes("rapidapi")) {
			frm.dashboard.add_comment(
				__("<b>RapidAPI — Nairobi NSE only.</b> API Key = your <code>x-rapidapi-key</code>. " +
				   "Bulk <code>GET /stocks</code> (all listings, then filtered to your tickers). " +
				   "Market Type must be <b>NSE</b>. " +
				   "<a href=\"https://rapidapi.com/iancenry/api/nairobi-stock-exchange-nse\" target=\"_blank\">Docs</a>"),
				"blue",
				true
			);
		}

		// ── Helpful quick-start note ──────────────────────────────────────────────
		if (!frm.doc.__islocal && !frm.doc.api_key) {
			frm.dashboard.add_comment(
				__("⚠ No API Key set. Add your key and click <b>Actions → Test Connection</b> to verify."),
				"yellow",
				true
			);
		}

		// ── Base URL hints based on selected provider ─────────────────────────────
		_set_provider_hints(frm);
	},

	api_provider(frm) {
		_set_provider_hints(frm);
	},
});

/**
 * Auto-fill base URL and endpoint when the user picks a known provider,
 * so they don't have to look it up.
 */
function _set_provider_hints(frm) {
	const prov = (frm.doc.api_provider || "").toLowerCase();
	const hints = {
		"mansa markets": {
			api_base_url: "https://www.mansaapi.com/api/v1",
			endpoint_prices: "/stocks",
			calls_per_month: 3000,
			market_type: "NSE",
		},
		"fcs api": {
			api_base_url: "https://api-v4.fcsapi.com",
			endpoint_prices: "/stock/latest",
			calls_per_month: 500,
			market_type: "Global",
		},
		"alpha vantage": {
			api_base_url: "https://www.alphavantage.co",
			endpoint_prices: "/query",
			calls_per_month: 500,   // free: 25/day ≈ 750/month
			market_type: "Both",
		},
		finnhub: {
			api_base_url: "https://finnhub.io/api/v1",
			endpoint_prices: "/quote",
			calls_per_month: 60000, // free tier ~60/min; adjust if you upgrade
			market_type: "Both",
		},
		rapidapi: {
			api_base_url: "https://nairobi-stock-exchange-nse.p.rapidapi.com",
			endpoint_prices: "/stocks",
			calls_per_month: 3000,
			market_type: "NSE",
		},
	};

	for (const [key, vals] of Object.entries(hints)) {
		if (prov.includes(key)) {
			if (!frm.doc.api_base_url) frm.set_value("api_base_url", vals.api_base_url);
			if (!frm.doc.endpoint_prices) frm.set_value("endpoint_prices", vals.endpoint_prices);
			if (!frm.doc.calls_per_month) frm.set_value("calls_per_month", vals.calls_per_month);
			if (!frm.doc.market_type) frm.set_value("market_type", vals.market_type);
			break;
		}
	}
}
