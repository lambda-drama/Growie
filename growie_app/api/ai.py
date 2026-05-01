"""
Growe AI — Multi-provider AI analysis engine.

Supported providers  (set in Growe AI Provider → Provider field):
  Claude     → Anthropic API  https://api.anthropic.com/v1/messages
  OpenAI     → OpenAI API     https://api.openai.com/v1/chat/completions
  Gemini     → Google AI      https://generativelanguage.googleapis.com/v1beta
  Groq       → Groq API       https://api.groq.com/openai/v1  (OpenAI-compat)
  DeepSeek   → DeepSeek API   https://api.deepseek.com/v1     (OpenAI-compat)

The active provider is set in Growe Settings → Default AI Provider (Link to Growe AI Provider).
"""

import frappe
from frappe import _
from frappe.utils import get_first_day, get_last_day, today

# ─── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are Growe AI, a financial assistant for Kenyan and diaspora investors.
You give clear, concise, and actionable investment insights with an Africa-first lens.

You understand:
- Nairobi Securities Exchange (NSE) stocks, sectors, and typical KES valuations
- Global stocks (US, Europe, Asia)
- Kenyan Money Market Funds (MMFs) like CIC, ICEA Lion, Sanlam
- The economic context of investing as a Kenyan at home or in the diaspora

Rules:
- Be concise (3–5 paragraphs maximum, no bullet-point walls)
- Use KES values where relevant; mention USD equivalent for global stocks
- Clearly flag risks and uncertainties
- End with one concrete recommended next step
- Add a brief disclaimer: "This is not regulated financial advice"
- Use plain English — no excessive jargon
"""

# ─── Provider helpers ─────────────────────────────────────────────────────────

def _get_active_provider():
	"""Load the active Growe AI Provider doc from Growe Settings."""
	settings = frappe.get_single("Growe Settings")
	if not settings.active_ai_provider:
		frappe.throw("No AI provider configured. Go to Growe Settings and set a Default AI Provider.")
	provider = frappe.get_doc("Growe AI Provider", settings.active_ai_provider)
	if not provider.is_active:
		frappe.throw(f"AI provider '{provider.provider_name}' is marked inactive. Enable it in Growe AI Provider.")
	key = provider.get_password("api_key")
	if not key:
		frappe.throw(f"AI provider '{provider.provider_name}' has no API key saved.")
	return provider


def _raise_api_error(resp, provider_name: str = ""):
	"""Extract the API error body and raise a meaningful Frappe exception."""
	try:
		body = resp.json()
		# Anthropic: {"error": {"type": "...", "message": "..."}}
		if "error" in body:
			err = body["error"]
			msg = err.get("message") or str(err)
		# OpenAI / Groq / DeepSeek: {"error": {"message": "..."}}
		elif "message" in body:
			msg = body["message"]
		else:
			msg = resp.text[:500]
	except Exception:
		msg = resp.text[:500]
	prefix = f"[{provider_name}] " if provider_name else ""
	frappe.throw(f"{prefix}HTTP {resp.status_code}: {msg}")


def _call_openai_compat(base_url: str, api_key: str, model: str, messages: list,
						temperature: float, max_tokens: int,
						provider_label: str = "OpenAI-compat") -> str:
	"""Generic OpenAI-compatible chat/completions call (works for OpenAI, Groq, DeepSeek)."""
	import requests
	resp = requests.post(
		f"{base_url.rstrip('/')}/chat/completions",
		headers={
			"Authorization": f"Bearer {api_key}",
			"Content-Type": "application/json",
		},
		json={
			"model": model,
			"messages": messages,
			"temperature": temperature,
			"max_tokens": max_tokens,
		},
		timeout=45,
	)
	if not resp.ok:
		_raise_api_error(resp, provider_label)
	data = resp.json()
	return data["choices"][0]["message"]["content"]


def _call_claude(api_key: str, model: str, system: str, messages: list,
				 temperature: float, max_tokens: int) -> str:
	import requests
	body: dict = {
		"model": model,
		"max_tokens": max_tokens,
		"system": system,
		"messages": messages,   # only user/assistant roles here
	}
	# Claude 4+ (claude-opus-4-*, claude-sonnet-4-*, etc.) deprecated temperature
	model_lower = model.lower()
	is_claude4 = (
		"claude-opus-4" in model_lower
		or "claude-sonnet-4" in model_lower
		or "claude-haiku-4" in model_lower
	)
	if not is_claude4:
		body["temperature"] = temperature

	resp = requests.post(
		"https://api.anthropic.com/v1/messages",
		headers={
			"x-api-key": api_key,
			"anthropic-version": "2023-06-01",
			"Content-Type": "application/json",
		},
		json=body,
		timeout=45,
	)
	if not resp.ok:
		_raise_api_error(resp, f"Claude ({model})")
	return resp.json()["content"][0]["text"]


def _call_gemini(api_key: str, model: str, system: str, messages: list,
				 temperature: float, max_tokens: int,
				 base_url: str = "") -> str:
	import requests
	base = (base_url or "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
	model_id = model or "gemini-1.5-flash"

	# Convert messages: system → systemInstruction, user/assistant → contents
	contents = []
	for m in messages:
		role = "user" if m["role"] == "user" else "model"
		contents.append({"role": role, "parts": [{"text": m["content"]}]})

	body: dict = {
		"contents": contents,
		"generationConfig": {
			"temperature": temperature,
			"maxOutputTokens": max_tokens,
		},
	}
	if system:
		body["systemInstruction"] = {"parts": [{"text": system}]}

	resp = requests.post(
		f"{base}/models/{model_id}:generateContent?key={api_key}",
		json=body,
		timeout=45,
	)
	if not resp.ok:
		_raise_api_error(resp, f"Gemini ({model_id})")
	return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


def _dispatch(provider, system: str, user_messages: list) -> str:
	"""Route to the correct provider API."""
	prov = (provider.provider or "").lower()
	api_key = provider.get_password("api_key")
	model = provider.model or ""
	temp = float(provider.temperature or 0.7)
	max_tok = int(provider.max_tokens or 1000)

	# Full message list including system (for OpenAI-compat providers)
	full_msgs = ([{"role": "system", "content": system}] if system else []) + user_messages

	if "claude" in prov:
		return _call_claude(api_key, model, system, user_messages, temp, max_tok)

	elif "openai" in prov:
		base = provider.api_base_url or "https://api.openai.com/v1"
		return _call_openai_compat(base, api_key, model, full_msgs, temp, max_tok, "OpenAI")

	elif "gemini" in prov:
		return _call_gemini(api_key, model, system, user_messages, temp, max_tok,
							base_url=provider.api_base_url or "")

	elif "groq" in prov:
		base = provider.api_base_url or "https://api.groq.com/openai/v1"
		return _call_openai_compat(base, api_key, model, full_msgs, temp, max_tok, "Groq")

	elif "deepseek" in prov:
		base = provider.api_base_url or "https://api.deepseek.com/v1"
		return _call_openai_compat(base, api_key, model, full_msgs, temp, max_tok, "DeepSeek")

	else:
		frappe.throw(f"Provider type '{provider.provider}' is not yet supported. "
					 "Supported: Claude, OpenAI, Gemini, Groq, DeepSeek.")


# ─── Conversation persistence ─────────────────────────────────────────────────

def _get_member() -> str | None:
	"""Return the Growe Member name for the current session user, or None."""
	return frappe.db.get_value("Growe Member", {"user": frappe.session.user}, "name")


def _save_conversation(
	question: str,
	answer: str,
	provider_name: str,
	model: str,
	conversation_type: str = "Chat",
	holding: str = "",
) -> None:
	"""Persist a Q&A pair to Growe AI Conversation (best-effort, never blocks response)."""
	try:
		member = _get_member()
		if not member:
			return
		doc = frappe.get_doc({
			"doctype": "Growe AI Conversation",
			"member": member,
			"conversation_type": conversation_type,
			"provider_name": provider_name,
			"model_used": model,
			"question": question[:10000],   # Long Text cap
			"answer": answer[:10000],
			"asked_at": frappe.utils.now(),
			**({"holding": holding} if holding else {}),
		})
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
	except Exception:
		pass  # Never let storage failure break the AI response


# ─── Context builders ─────────────────────────────────────────────────────────

def _build_portfolio_context(member_name: str) -> str:
	"""Summarise all holdings for portfolio-level analysis."""
	holdings = frappe.get_all(
		"Growe Holding",
		filters={"investor": member_name},
		fields=["asset_name", "ticker", "quantity", "cost_basis_kes", "value_kes", "asset_class", "notes"],
	)
	if not holdings:
		return ""

	lines = []
	total_cost = 0.0
	total_value = 0.0
	for h in holdings:
		cost = float(h.cost_basis_kes or 0)
		val  = float(h.value_kes or cost)
		total_cost  += cost
		total_value += val
		pnl = val - cost
		ticker_str = f" ({h.ticker})" if h.ticker else ""
		lines.append(
			f"  • {h.asset_name}{ticker_str} [{h.asset_class or 'Other'}]"
			f" — Cost KES {cost:,.0f} | Value KES {val:,.0f}"
			f" | P&L KES {pnl:+,.0f}"
		)

	overall_pnl = total_value - total_cost
	pnl_pct = (overall_pnl / total_cost * 100) if total_cost else 0

	ctx = (
		f"Portfolio Summary:\n"
		f"  Total Invested: KES {total_cost:,.2f}\n"
		f"  Current Value:  KES {total_value:,.2f}\n"
		f"  Overall P&L:    KES {overall_pnl:+,.2f} ({pnl_pct:+.1f}%)\n"
		f"  Holdings ({len(holdings)}):\n"
		+ "\n".join(lines)
	)
	return ctx


def _enforce_monthly_ai_limit(member_name: str):
	"""Enforce per-tier monthly AI limits (Ask Growe + analyses) from Growe Settings.ai_limits."""
	tier_raw = frappe.db.get_value("Growe Member", member_name, "subscription_tier")
	tier = str(tier_raw or "").strip().lower()
	settings = frappe.get_single("Growe Settings")
	limit_rows = settings.get("ai_limits") or []
	limit_value = None
	for row in limit_rows:
		row_tier = str(row.subscription_tier or "").strip().lower()
		if row_tier == tier:
			limit_value = int(row.ai_rate_limiter or 0)
			break
	if not limit_value or limit_value <= 0:
		return

	start = get_first_day(today())
	end = get_last_day(today())
	used = frappe.db.count(
		"Growe AI Conversation",
		{
			"member": member_name,
			"asked_at": ["between", [start, end]],
		},
	)
	if used >= limit_value:
		frappe.throw(
			_(
				"Monthly AI usage limit reached ({0}). This includes Ask Growe chat and portfolio analyses. "
				"Please update your plan or wait until next month."
			).format(limit_value)
		)


# ─── Public endpoints ─────────────────────────────────────────────────────────

@frappe.whitelist()
def chat(question: str, context: str = ""):
	"""
	General AI chat. Authenticated users only.
	Optionally pass portfolio context for richer answers.
	"""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in."), frappe.AuthenticationError)

	member_name = frappe.db.get_value("Growe Member", {"user": frappe.session.user}, "name")
	if not member_name:
		frappe.throw(_("Growe Member profile not found for your account."))

	try:
		_enforce_monthly_ai_limit(member_name)
	except frappe.ValidationError as e:
		# Return the limit message as a regular response instead of throwing
		return {
			"reply": str(e),
			"provider": "System",
			"model": "N/A"
		}
        

	if not question or not question.strip():
		frappe.throw("Question cannot be empty.")

	user_content = question.strip()
	if context and context.strip():
		user_content = f"{user_content}\n\nPortfolio context:\n{context.strip()}"

	provider = _get_active_provider()
	reply = _dispatch(
		provider,
		system=SYSTEM_PROMPT,
		user_messages=[{"role": "user", "content": user_content}],
	)

	_save_conversation(
		question=question.strip(),
		answer=reply,
		provider_name=provider.provider_name,
		model=provider.model,
		conversation_type="Chat",
	)

	return {
		"reply": reply,
		"provider": provider.provider_name,
		"model": provider.model,
	}


@frappe.whitelist()
def analyse_portfolio():
    """Full portfolio analysis for the authenticated user."""
    try:
        member_name = frappe.db.get_value("Growe Member", {"user": frappe.session.user}, "name")
        if not member_name:
            frappe.throw("Growe Member profile not found for your account.")
        
        # Try to enforce limit, but catch the limit error
        try:
            _enforce_monthly_ai_limit(member_name)
        except frappe.ValidationError as e:
            # Return the limit message as a regular response instead of throwing
            return {
                "reply": str(e),
                "provider": "System",
                "model": "N/A"
            }
        
        ctx = _build_portfolio_context(member_name)
        if not ctx:
            frappe.throw("No holdings found to analyse. Add holdings first.")

        question = (
            "Please analyse my overall investment portfolio. "
            "Cover: (1) diversification quality, (2) top risks, "
            "(3) what's working well, and (4) one clear recommended next step."
        )

        provider = _get_active_provider()
        reply = _dispatch(
            provider,
            system=SYSTEM_PROMPT,
            user_messages=[{"role": "user", "content": f"{question}\n\n{ctx}"}],
        )

        _save_conversation(
            question="Portfolio Analysis",
            answer=reply,
            provider_name=provider.provider_name,
            model=provider.model,
            conversation_type="Portfolio Analysis",
        )

        return {
            "reply": reply,
            "provider": provider.provider_name,
            "model": provider.model,
        }
    except Exception as e:
        frappe.log_error(f"Portfolio analysis error: {str(e)}", "Growe AI")
        return {
            "reply": f"⚠️ {str(e)}",
            "provider": "System",
            "model": "N/A"
        }


@frappe.whitelist()
def analyse_holding(holding_name: str):
	"""Deep-dive on one holding. Only the owner can call this."""
	if not frappe.db.exists("Growe Holding", holding_name):
		frappe.throw("Holding not found.")

	holding = frappe.get_doc("Growe Holding", holding_name)
	member_name = frappe.db.get_value("Growe Member", {"user": frappe.session.user}, "name")
	if not member_name or holding.investor != member_name:
		frappe.throw("Not authorized.", frappe.PermissionError)

	try:
		_enforce_monthly_ai_limit(member_name)
	except frappe.ValidationError as e:
		# Return the limit message as a regular response instead of throwing
		return {
			"reply": str(e),
			"provider": "System",
			"model": "N/A"
		}
        

	ticker = holding.ticker or holding.asset_name
	cost   = float(holding.cost_basis_kes or 0)
	val    = float(holding.value_kes or cost)
	pnl    = val - cost

	# Try to fetch cached price
	price_info = ""
	if ticker:
		cache = frappe.db.get_value(
			"Growe Price Cache", ticker,
			["price_kes", "change_percent", "source"], as_dict=True
		)
		if cache:
			price_info = (
				f"\nLive Price: KES {float(cache.price_kes or 0):,.2f}"
				f" | Change: {float(cache.change_percent or 0):.2f}%"
				f" | Source: {cache.source}"
			)

	ctx = (
		f"Holding: {holding.asset_name} ({ticker})\n"
		f"Asset Class: {holding.asset_class or 'Unknown'}\n"
		f"Quantity: {holding.quantity or 0}\n"
		f"Cost Basis: KES {cost:,.2f}\n"
		f"Current Value: KES {val:,.2f}\n"
		f"Unrealised P&L: KES {pnl:+,.2f} ({(pnl/cost*100) if cost else 0:.1f}%)"
		+ price_info
		+ (f"\nNotes: {holding.notes}" if holding.notes else "")
	)

	question = (
		f"Please analyse my holding in {holding.asset_name} ({ticker}). "
		"Should I hold, buy more, or consider selling? What are the key risks and catalysts?"
	)

	provider = _get_active_provider()
	reply = _dispatch(
		provider,
		system=SYSTEM_PROMPT,
		user_messages=[{"role": "user", "content": f"{question}\n\n{ctx}"}],
	)

	_save_conversation(
		question=question,
		answer=reply,
		provider_name=provider.provider_name,
		model=provider.model,
		conversation_type="Holding Analysis",
		holding=holding_name,
	)

	return {
		"reply": reply,
		"provider": provider.provider_name,
		"model": provider.model,
	}


@frappe.whitelist()
def get_conversation_history(limit: int = 20, conversation_type: str = ""):
	"""
	Return the authenticated user's AI conversation history, newest first.
	Optionally filter by conversation_type (Chat / Portfolio Analysis / Holding Analysis).
	"""
	member_name = _get_member()
	if not member_name:
		return []

	filters: dict = {"member": member_name}
	if conversation_type:
		filters["conversation_type"] = conversation_type

	rows = frappe.get_all(
		"Growe AI Conversation",
		filters=filters,
		fields=["name", "conversation_type", "question", "answer",
				"provider_name", "model_used", "asked_at", "holding"],
		order_by="asked_at desc",
		limit=int(limit),
	)
	return [
		{
			"id": r.name,
			"type": r.conversation_type,
			"question": r.question,
			"answer": r.answer,
			"provider": r.provider_name,
			"model": r.model_used,
			"askedAt": str(r.asked_at),
			"holding": r.holding or "",
		}
		for r in rows
	]


@frappe.whitelist(allow_guest=False)
def get_provider_status():
	"""Return active AI provider info (no API key) for display in the UI."""
	try:
		settings = frappe.get_single("Growe Settings")
		if not settings.active_ai_provider:
			return {"configured": False, "reason": "No provider set in Growe Settings"}
		provider = frappe.get_doc("Growe AI Provider", settings.active_ai_provider)
		return {
			"configured": True,
			"isActive": bool(provider.is_active),
			"providerName": provider.provider_name,
			"provider": provider.provider,
			"model": provider.model,
		}
	except Exception as e:
		return {"configured": False, "reason": str(e)}


def _list_claude_models(api_key: str) -> list:
	"""Fetch the list of models available for this Anthropic API key."""
	import requests
	try:
		resp = requests.get(
			"https://api.anthropic.com/v1/models",
			headers={
				"x-api-key": api_key,
				"anthropic-version": "2023-06-01",
			},
			timeout=15,
		)
		if resp.ok:
			data = resp.json()
			return [m.get("id") for m in data.get("data", []) if m.get("id")]
	except Exception:
		pass
	return []


@frappe.whitelist()
def test_provider(provider_name: str = ""):
	"""
	Test the connection to a specific (or the active) AI provider.
	For Claude: also lists which models are available for the API key.
	"""
	if provider_name:
		if not frappe.db.exists("Growe AI Provider", provider_name):
			frappe.throw(f"Provider '{provider_name}' not found.")
		provider = frappe.get_doc("Growe AI Provider", provider_name)
	else:
		provider = _get_active_provider()

	prov = (provider.provider or "").lower()
	result: dict = {}

	# For Claude: list available models first so the user knows what to enter
	available_models: list = []
	if "claude" in prov:
		api_key = provider.get_password("api_key")
		available_models = _list_claude_models(api_key)

	try:
		reply = _dispatch(
			provider,
			system="You are a helpful assistant.",
			user_messages=[{"role": "user", "content": "Say exactly: 'Growe AI connection successful.'"}],
		)
		result = {
			"success": True,
			"reply": reply,
			"model": provider.model,
			"available_models": available_models,
		}
	except Exception as e:
		error_msg = str(e)
		hint = ""
		if available_models:
			hint = f" | Models available for your key: {', '.join(available_models)}"
		elif "claude" in prov and "404" in error_msg:
			hint = " | Could not list models — key may be unverified or restricted."
		result = {
			"success": False,
			"error": error_msg + hint,
			"available_models": available_models,
		}

	# Save note back to the provider doc
	try:
		status = "OK" if result["success"] else f"FAIL: {result.get('error', '')[:200]}"
		existing = provider.notes or ""
		frappe.db.set_value("Growe AI Provider", provider.name, {
			"notes": f"{existing}\n[Test {frappe.utils.now()}] {status}".strip()
		})
		frappe.db.commit()
	except Exception:
		pass

	return result
