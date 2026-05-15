// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIProviderStatus {
  configured: boolean
  isActive?: boolean
  providerName?: string
  provider?: string
  model?: string
  reason?: string
}

export interface AIReply {
  reply: string
  provider: string
  model: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ConversationRecord {
  id: string
  type: 'Chat' | 'Portfolio Analysis' | 'Holding Analysis'
  question: string
  answer: string
  provider: string
  model: string
  askedAt: string
  holding: string
}

export interface SavedPortfolioAnalysis {
  id: string
  answer: string
  askedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCSRF(): Promise<string> {
  let token = (window as unknown as Record<string, string>).csrf_token
  if (token) return token
  try {
    const r = await fetch('/api/method/frappe.sessions.get_csrf_token', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    const data = await r.json()
    token = data?.message ?? ''
    if (token) (window as unknown as Record<string, string>).csrf_token = token
  } catch {
    token = ''
  }
  return token
}

async function post<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const csrf = await getCSRF()
  const resp = await fetch(`/api/method/${method}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await resp.json()
  if (data?.exc) {
    const lines: string[] = (data.exc as string).split('\n').filter(Boolean)
    throw new Error(lines[lines.length - 1] ?? 'AI request failed')
  }
  return data.message as T
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/** Returns whether Barbs AI is configured (no vendor/model exposed to UI). */
export async function getProviderStatus(): Promise<AIProviderStatus> {
  try {
    const resp = await fetch(
      '/api/method/growie_app.api.ai.get_provider_status',
      { credentials: 'include', headers: { Accept: 'application/json' } }
    )
    const data = await resp.json()
    return (data?.message ?? { configured: false }) as AIProviderStatus
  } catch {
    return { configured: false, reason: 'Network error' }
  }
}

export async function chat(question: string, context = ''): Promise<AIReply> {
  return post<AIReply>('growie_app.api.ai.chat', { question, context })
}

export async function analysePortfolio(): Promise<AIReply> {
  return post<AIReply>('growie_app.api.ai.analyse_portfolio', {})
}

export async function analyseHolding(holdingName: string): Promise<AIReply> {
  return post<AIReply>('growie_app.api.ai.analyse_holding', { holding_name: holdingName })
}

export async function getConversationHistory(
  limit = 20,
  conversationType = ''
): Promise<ConversationRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (conversationType) params.append('conversation_type', conversationType)
  try {
    const resp = await fetch(
      `/api/method/growie_app.api.ai.get_conversation_history?${params}`,
      { credentials: 'include', headers: { Accept: 'application/json' } }
    )
    const data = await resp.json()
    return Array.isArray(data?.message) ? (data.message as ConversationRecord[]) : []
  } catch {
    return []
  }
}

/** Latest saved portfolio analysis for the logged-in user (if any). */
export async function getLatestPortfolioAnalysis(): Promise<SavedPortfolioAnalysis | null> {
  const rows = await getConversationHistory(1, 'Portfolio Analysis')
  const latest = rows[0]
  if (!latest?.answer?.trim()) return null
  return { id: latest.id, answer: latest.answer, askedAt: latest.askedAt }
}
