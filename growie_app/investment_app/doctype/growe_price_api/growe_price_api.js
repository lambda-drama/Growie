// Copyright (c) 2026, Mania and contributors
// For license information, please see license.txt

frappe.ui.form.on("Growe Price API", {
	refresh(frm) {
		_bind_price_refresh_realtime(frm);

		// ── Test Connection button ────────────────────────────────────────────────
		frm.add_custom_button(__("Test Connection"), function () {
			frappe.prompt(
				[
					{
						label: __("Test Ticker"),
						fieldname: "test_ticker",
						fieldtype: "Data",
						default: frm.doc.market_type === "Global" ? "AAPL" : "SCOM",
						description: __("e.g. SCOM for Kenya, AAPL for Global"),
					},
					{
						label: __("Market"),
						fieldname: "market",
						fieldtype: "Select",
						options: "\nKenya\nGlobal",
						default: frm.doc.market_type === "Global" ? "Global" : "Kenya",
					},
				],
				function (values) {
					frappe.call({
						method: "growie_app.api.price.test_provider",
						args: {
							provider_name: frm.doc.name,
							test_ticker: values.test_ticker || "SCOM",
							market: values.market || "Kenya",
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

		// ── Fetch holdings prices Now button ──────────────────────────────────────
		frm.add_custom_button(__("Refresh All Prices Now"), function () {
			const prov = (frm.doc.api_provider || "").toLowerCase();
			const scopeHint = prov.includes("rapidapi") || prov.includes("mansa")
				? __("This provider only updates <b>Kenya</b> holdings; Global symbols are skipped.")
				: prov.includes("finnhub") || prov.includes("alpha") || prov.includes("eoddata")
					? __("This provider only updates <b>Global</b> holdings; Kenya symbols are skipped.")
					: prov.includes("twelve") || prov.includes("marketstack")
						? __("Uses Growe Stock <b>Exchange platform</b> (ISO Mic) for Kenya and global holdings (batch API).")
						: __("Updates held tickers this provider supports (by market).");
			const usHint = cint(frm.doc.use_us_ticker)
				? __(" <b>Use US ticker</b> is on — API calls use Growe Stock <b>US Ticker Number</b>.")
				: "";
			frappe.confirm(
				__(
					"This will fetch live prices for <b>open stock &amp; ETF holdings only</b> using <b>{0}</b>. {1}{2} Continue?",
					[frm.doc.provider_name || frm.doc.name, scopeHint, usHint]
				),
				function () {
					frm._price_refresh_active = true;
					_update_price_refresh_progress(frm, { total: 0, done: 0, market: null });
					frappe.call({
						method: "growie_app.api.price.refresh_prices",
						args: { provider_name: frm.doc.name },
						callback: function (r) {
							if (!r.message) {
								frm._price_refresh_active = false;
								_clear_price_refresh_progress(frm);
								return;
							}
							if (r.message.queued) {
								const total = r.message.tickers_requested || 0;
								frappe.show_alert({
									message:
										r.message.message ||
										__(
											"Price refresh queued for {0} ticker(s). Watch the progress bar above.",
											[total]
										),
									indicator: "blue",
								}, 8);
								_update_price_refresh_progress(frm, {
									total,
									done: 0,
									market: null,
								});
								return;
							}
							frm._price_refresh_active = false;
							_clear_price_refresh_progress(frm);
							frappe.msgprint({
								title: __("✅ Prices Refreshed"),
								indicator: "green",
								message: _format_price_refresh_summary(r.message),
							});
						},
						error: function () {
							frm._price_refresh_active = false;
							_clear_price_refresh_progress(frm);
						},
					});
				}
			);
		}, __("Actions"));

		// ── Fetch Historical Prices (Marketstack / Mansa, System Manager) ────────
		const api_prov = (frm.doc.api_provider || "").toLowerCase();
		if (
			(api_prov.includes("marketstack") || api_prov.includes("mansa")) &&
			frappe.user.has_role("System Manager")
		) {
			frm.add_custom_button(__("Fetch Historical Prices"), function () {
				const intervalHint = __(
					"Uses <b>Growe Settings → Monthly Interval Historical</b> " +
						"(e.g. 2 = first and last date each month). " +
						"Starts from each ticker's earliest open holding date. " +
						"Stores rows in <b>Growe Price Cache → Growe Historical Price</b>."
				);
				const scopeHint = api_prov.includes("mansa")
					? __("This provider backfills <b>Kenya / NSE</b> holdings only.")
					: __("This provider backfills <b>Global</b> holdings only (Kenya skipped).");
				frappe.confirm(
					__(
						"Fetch historical EOD prices with <b>{0}</b>? {1}<br><br>{2}",
						[frm.doc.provider_name || frm.doc.name, scopeHint, intervalHint]
					),
					function () {
						frm._historical_fetch_active = true;
						_update_historical_fetch_progress(frm, { total: 0, done: 0 });
						frappe.call({
							method: "growie_app.api.price.fetch_historical_prices",
							args: { provider_name: frm.doc.name },
							callback: function (r) {
								if (!r.message) {
									frm._historical_fetch_active = false;
									_clear_historical_fetch_progress(frm);
									return;
								}
								if (r.message.queued) {
									frappe.show_alert(
										{
											message:
												r.message.message ||
												__(
													"Historical fetch queued for {0} ticker(s).",
													[r.message.tickers_requested || 0]
												),
											indicator: "blue",
										},
										8
									);
									_update_historical_fetch_progress(frm, {
										total: r.message.tickers_requested || 0,
										done: 0,
									});
									return;
								}
								frm._historical_fetch_active = false;
								_clear_historical_fetch_progress(frm);
								frappe.msgprint({
									title: __("✅ Historical Prices Saved"),
									indicator: "green",
									message: _format_historical_fetch_summary(r.message),
								});
							},
							error: function () {
								frm._historical_fetch_active = false;
								_clear_historical_fetch_progress(frm);
							},
						});
					}
				);
			}, __("Actions"));
		}

		// ── Fetch NSE Index button (Mansa only) ──────────────────────────────────
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
				__("<b>Global exchanges only.</b> Finnhub refreshes Growe Stock where "
				   + "<b>Exchange platform</b> is not Nairobi NSE (NYSE, NASDAQ, …). "
				   + "Kenya tickers use RapidAPI / Mansa. Test with <code>AAPL</code>. "
				   + "<a href=\"https://finnhub.io/docs/api\" target=\"_blank\">Docs</a>"),
				"blue",
				true
			);
		}

		if (api_prov.includes("eoddata")) {
			frm.dashboard.add_comment(
				__("<b>EODData</b> — end-of-day quotes via REST API. "
				   + "API Key = your <b>ApiKey</b> from "
				   + "<a href=\"https://eoddata.com/myaccount/api.aspx\" target=\"_blank\">My Account → API</a>. "
				   + "Set <b>Exchange platform</b> on Growe Stock (NASDAQ, NYSE, LSE, …). "
				   + "Kenya (Nairobi NSE) tickers are skipped. Test with <code>AAPL</code>. "
				   + "<a href=\"https://api.eoddata.com/scalar/v1\" target=\"_blank\">API docs</a> · "
				   + "<a href=\"https://www.eoddata.com/products/default.aspx\" target=\"_blank\">Plans</a>"),
				"blue",
				true
			);
		}

		if (api_prov.includes("goldman")) {
			frm.dashboard.add_comment(
				__("<b>Goldman Sachs Marquee</b> — OAuth2 EOD prices via dataset <code>TREOD</code>. "
				   + "API Key = <code>client_id</code>, API Secret = <code>client_secret</code> "
				   + "(from <a href=\"https://developer.gs.com/docs\" target=\"_blank\">developer.gs.com</a>). "
				   + "Prices endpoint = dataset id (default <code>TREOD</code>). "
				   + "Global / non-Kenya only. Test with <code>AAPL</code>."),
				"blue",
				true
			);
		}

		if (api_prov.includes("twelve")) {
			frm.dashboard.add_comment(
				__("<b>Twelve Data</b> — one quote per symbol (same as Test Connection). "
				   + "Bulk refresh runs in the <b>background</b>; progress shows above. "
				   + "Set <b>Exchange platform</b> on Growe Stock for Kenya/global routing. "
				   + "<a href=\"https://twelvedata.com/docs\" target=\"_blank\">Docs</a>"),
				"blue",
				true
			);
		}

		if (api_prov.includes("marketstack")) {
			frm.dashboard.add_comment(
				__("<b>Marketstack</b> — latest end-of-day prices via <code>/eod/latest</code>; "
				   + "historical via <code>/eod</code> (Actions → Fetch Historical Prices). "
				   + "API Key = your <code>access_key</code> from "
				   + "<a href=\"https://marketstack.com/dashboard\" target=\"_blank\">marketstack.com</a>. "
				   + "Sends <b>ISO Mic</b> as <code>exchange</code> from Growe Stock exchange platform. "
				   + "With <b>Use US ticker</b>, symbols come from Growe Stock <b>US Ticker Number</b>. "
				   + "Batch up to 100 symbols per request. Test with <code>AAPL</code>. "
				   + "<a href=\"https://docs.apilayer.com/marketstack/docs/marketstack-api-v2-v-2-0-0\" target=\"_blank\">Docs</a>"),
				"blue",
				true
			);
		}

		if (api_prov.includes("mansa")) {
			frm.dashboard.add_comment(
				__("<b>Mansa Markets</b> — Nairobi NSE quotes via Bearer API key (<code>mansa_live_sk_…</code>). "
				   + "Base URL must be <code>https://mansaapi.com/api/v1</code> (not <code>www</code>). "
				   + "Historical: Actions → Fetch Historical Prices "
				   + "(<code>/stocks/{ticker}/history</code>). "
				   + "Test with <code>SCOM</code> and market <b>Kenya</b>. "
				   + "<a href=\"https://mansaapi.com/docs\" target=\"_blank\">Docs</a>"),
				"blue",
				true
			);
		}

		if (api_prov.includes("rapidapi")) {
			frm.dashboard.add_comment(
				__("<b>RapidAPI — Nairobi NSE only.</b> API Key = your <code>x-rapidapi-key</code>. " +
				   "Bulk <code>GET /stocks</code> (all listings, then filtered to your tickers). " +
				   "Market Type must be <b>Kenya</b>. " +
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

function _format_price_refresh_summary(data) {
	const eligible = data.tickers_eligible;
	const requested = data.tickers_requested;
	let extra = "";
	if (eligible != null && requested && eligible !== requested) {
		extra =
			`<small>${__("Eligible for this provider")}: ${eligible}<br>` +
			`${__("Total active tickers")}: ${requested}</small>`;
	} else if (requested) {
		extra = `<small>${__("Total active tickers")}: ${requested}</small>`;
	}
	return (
		`<b>Kenya</b>: ${data.nse_updated || 0} ticker(s) updated<br>` +
		`<b>Global</b>: ${data.global_updated || 0} ticker(s) updated<br>` +
		extra
	);
}

function _format_historical_fetch_summary(data) {
	return (
		`<b>${__("Tickers updated")}</b>: ${data.tickers_updated || 0} / ${data.tickers_requested || 0}<br>` +
		`<b>${__("Rows written")}</b>: ${data.rows_written || 0}<br>` +
		`<b>${__("Monthly interval")}</b>: ${data.interval || "–"}<br>` +
		(data.message ? `<p style="margin-top:8px">${frappe.utils.escape_html(data.message)}</p>` : "")
	);
}

function _bind_price_refresh_realtime(frm) {
	if (frm._growie_price_refresh_bound) {
		return;
	}
	frm._growie_price_refresh_bound = true;

	frappe.realtime.on("growie_price_refresh_progress", (data) => {
		if (!frm._price_refresh_active) return;
		if (data.provider_name && data.provider_name !== frm.doc.name) return;
		_update_price_refresh_progress(frm, data);
	});

	frappe.realtime.on("growie_price_refresh_done", (data) => {
		if (data.provider_name && data.provider_name !== frm.doc.name) return;
		frm._price_refresh_active = false;
		_clear_price_refresh_progress(frm);

		if (data.success === false) {
			frappe.msgprint({
				title: __("❌ Price Refresh Failed"),
				indicator: "red",
				message: frappe.utils.escape_html(data.error || __("Unknown error")),
			});
			return;
		}

		frappe.show_alert({
			message: __(
				"Prices refreshed — Kenya: {0}, Global: {1}",
				[data.nse_updated || 0, data.global_updated || 0]
			),
			indicator: "green",
		}, 10);
		frappe.msgprint({
			title: __("✅ Prices Refreshed"),
			indicator: "green",
			message: _format_price_refresh_summary(data),
		});
	});

	frappe.realtime.on("growie_historical_fetch_progress", (data) => {
		if (!frm._historical_fetch_active) return;
		if (data.provider_name && data.provider_name !== frm.doc.name) return;
		_update_historical_fetch_progress(frm, data);
	});

	frappe.realtime.on("growie_historical_fetch_done", (data) => {
		if (data.provider_name && data.provider_name !== frm.doc.name) return;
		frm._historical_fetch_active = false;
		_clear_historical_fetch_progress(frm);

		if (data.success === false) {
			frappe.msgprint({
				title: __("❌ Historical Fetch Failed"),
				indicator: "red",
				message: frappe.utils.escape_html(data.error || __("Unknown error")),
			});
			return;
		}

		frappe.msgprint({
			title: __("✅ Historical Prices Saved"),
			indicator: "green",
			message: _format_historical_fetch_summary(data),
		});
	});
}

function _clear_price_refresh_progress(frm) {
	frm.$wrapper.find(".growie-price-refresh-progress").remove();
	frm.dashboard.clear_headline();
}

function _clear_historical_fetch_progress(frm) {
	frm.$wrapper.find(".growie-historical-fetch-progress").remove();
	if (!frm._price_refresh_active) {
		frm.dashboard.clear_headline();
	}
}

function _update_price_refresh_progress(frm, data) {
	const total = data.total || 0;
	const done = data.done || 0;
	const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
	const market = data.market ? ` (${data.market})` : "";
	const last = data.last_ticker || "";
	const $wrapper = frm.$wrapper.find(".form-message");

	let $bar = $wrapper.find(".growie-price-refresh-progress");
	if (!$bar.length) {
		frm.dashboard.clear_headline();
		const html = `
			<div class="growie-price-refresh-progress" style="width:100%;max-width:720px;padding:2px 0;">
				<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px;font-size:12px;line-height:1.3;">
					<span class="growie-price-refresh-label">${frappe.utils.escape_html(
						__("Refreshing prices{0}…", [market])
					)}</span>
					<span class="growie-price-refresh-meta" style="white-space:nowrap;color:var(--text-muted);"></span>
				</div>
				<div style="height:8px;background:var(--gray-200,#e5e7eb);border-radius:4px;overflow:hidden;">
					<div class="growie-price-refresh-fill" style="height:100%;width:0;background:var(--blue-500,#2563eb);border-radius:4px;transition:width 0.2s ease;"></div>
				</div>
			</div>`;
		frm.dashboard.set_headline_alert(html, "blue", true);
		$bar = $wrapper.find(".growie-price-refresh-progress");
	}

	const meta = total
		? last
			? `${done}/${total} (${pct}%) — ${frappe.utils.escape_html(last)}`
			: `${done}/${total} (${pct}%)`
		: __("Starting…");
	$bar.find(".growie-price-refresh-meta").text(meta);
	if (data.market) {
		$bar.find(".growie-price-refresh-label").text(
			__("Refreshing prices ({0})…", [data.market])
		);
	}
	$bar.find(".growie-price-refresh-fill").css("width", `${pct}%`);
}

function _update_historical_fetch_progress(frm, data) {
	const total = data.total || 0;
	const done = data.done || 0;
	const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
	const last = data.last_ticker || "";
	const $wrapper = frm.$wrapper.find(".form-message");

	let $bar = $wrapper.find(".growie-historical-fetch-progress");
	if (!$bar.length) {
		frm.dashboard.clear_headline();
		const html = `
			<div class="growie-historical-fetch-progress" style="width:100%;max-width:720px;padding:2px 0;">
				<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px;font-size:12px;line-height:1.3;">
					<span class="growie-historical-fetch-label">${frappe.utils.escape_html(
						__("Fetching historical prices…")
					)}</span>
					<span class="growie-historical-fetch-meta" style="white-space:nowrap;color:var(--text-muted);"></span>
				</div>
				<div style="height:8px;background:var(--gray-200,#e5e7eb);border-radius:4px;overflow:hidden;">
					<div class="growie-historical-fetch-fill" style="height:100%;width:0;background:var(--green-500,#16a34a);border-radius:4px;transition:width 0.2s ease;"></div>
				</div>
			</div>`;
		frm.dashboard.set_headline_alert(html, "green", true);
		$bar = $wrapper.find(".growie-historical-fetch-progress");
	}

	const meta = total
		? last
			? `${done}/${total} (${pct}%) — ${frappe.utils.escape_html(last)}`
			: `${done}/${total} (${pct}%)`
		: __("Starting…");
	$bar.find(".growie-historical-fetch-meta").text(meta);
	$bar.find(".growie-historical-fetch-fill").css("width", `${pct}%`);
}

/**
 * Auto-fill base URL and endpoint when the user picks a known provider,
 * so they don't have to look it up.
 */
function _set_provider_hints(frm) {
	const prov = (frm.doc.api_provider || "").toLowerCase();
	const hints = {
		"mansa markets": {
			api_base_url: "https://mansaapi.com/api/v1",
			endpoint_prices: "markets/exchanges/NSE/stocks",
			calls_per_month: 3000,
			market_type: "Kenya",
		},
		"fcs api": {
			api_base_url: "https://api-v4.fcsapi.com",
			endpoint_prices: "/stock/latest",
			calls_per_month: 500,
			market_type: "Global",
		},
		"twelve data": {
			api_base_url: "https://api.twelvedata.com",
			endpoint_prices: "/quote",
			calls_per_month: 8000,
			market_type: "Both",
		},
		marketstack: {
			api_base_url: "https://api.marketstack.com/v2",
			endpoint_prices: "eod/latest",
			calls_per_month: 10000,
			market_type: "Both",
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
		eoddata: {
			api_base_url: "https://api.eoddata.com",
			endpoint_prices: "Quote/Get",
			calls_per_month: 300000, // Bronze: 10k/day; adjust to your plan
			market_type: "Global",
		},
		"goldman sachs": {
			api_base_url: "https://api.gs.com",
			endpoint_prices: "TREOD",
			calls_per_month: 50000,
			market_type: "Global",
		},
		rapidapi: {
			api_base_url: "https://nairobi-stock-exchange-nse.p.rapidapi.com",
			endpoint_prices: "/stocks",
			calls_per_month: 3000,
			market_type: "Kenya",
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
