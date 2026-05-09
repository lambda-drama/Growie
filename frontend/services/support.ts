export interface SupportIssue {
  name: string
  subject: string
  status: string
  description: string
  issueType: string
  creation: string
  modified: string
  replied: boolean
  resolutionDetails: string | null
  hasReply: boolean
}

function getCSRF(): string {
  return (window as unknown as Record<string, string>).csrf_token ?? ''
}

function postHeaders(): HeadersInit {
  const csrf = getCSRF()
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
  }
}

function parseError(data: Record<string, unknown>): string {
  if (data._server_messages) {
    try {
      const arr = JSON.parse(String(data._server_messages)) as string[]
      if (arr[0]) {
        const o = JSON.parse(arr[0]) as { message?: string }
        return o.message ?? 'Request failed'
      }
    } catch {
      /* */
    }
  }
  if (data.exc && typeof data.exc === 'string') {
    const lines = data.exc.trim().split('\n').filter(Boolean)
    return lines[lines.length - 1] ?? 'Request failed'
  }
  if (typeof data.message === 'string') return data.message
  return 'Request failed'
}

export async function getSupportUnreadCount(): Promise<number> {
  const res = await fetch(
    '/api/method/growie_app.api.support.get_support_unread_count',
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const data = (await res.json()) as { message?: { count?: number } }
  if (!res.ok) return 0
  return data.message?.count ?? 0
}

export async function markSupportInboxRead(): Promise<void> {
  await fetch('/api/method/growie_app.api.support.mark_support_inbox_read', {
    method: 'POST',
    headers: postHeaders(),
    credentials: 'include',
    body: JSON.stringify({}),
  })
}

export async function getMyIssues(): Promise<SupportIssue[]> {
  const res = await fetch('/api/method/growie_app.api.support.get_my_issues', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = (await res.json()) as { message?: SupportIssue[]; exc?: string }
  if (!res.ok || data.exc) throw new Error(parseError(data as unknown as Record<string, unknown>))
  return (data.message ?? []) as SupportIssue[]
}

export async function getIssueTypes(): Promise<string[]> {
  const res = await fetch('/api/method/growie_app.api.support.get_issue_types', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = (await res.json()) as { message?: { name: string }[] }
  if (!res.ok) return []
  const rows = data.message ?? []
  return rows.map((r) => r.name)
}

export async function createSupportIssue(
  subject: string,
  description: string,
  issueType: string
): Promise<{ name: string }> {
  const payload: Record<string, string> = { subject, description }
  if (issueType.trim()) {
    payload.issue_type = issueType.trim()
  }
  const res = await fetch('/api/method/growie_app.api.support.create_issue', {
    method: 'POST',
    headers: postHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as {
    message?: { success?: boolean; name?: string }
    exc?: string
  } & Record<string, unknown>
  if (!res.ok || data.exc) {
    throw new Error(parseError(data))
  }
  const msg = data.message
  if (!msg?.name) throw new Error('Could not create issue')
  return { name: msg.name }
}
