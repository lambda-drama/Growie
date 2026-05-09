// ─── Types ────────────────────────────────────────────────────────────────────

export interface LearningBiteItem {
  id: string
  title: string
  topic: string
  explanation: string
  linkedInsightId: string
  monthYear: string
  difficulty: 'Beginner' | 'Intermediate'
  estimatedReadTime: number
  isRead: boolean
}

export interface UserProgress {
  totalBites: number
  readCount: number
  completionPercent: number
  recentReads: Array<{ biteId: string; readDate: string }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Learning Bites ───────────────────────────────────────────────────────────

export async function getLearningBites(limit: number = 50): Promise<LearningBiteItem[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())

  const response = await fetch(
    `/api/method/growie_app.api.insights.get_learning_bites?${params.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as LearningBiteItem[]
  }
  return []
}

export async function markBiteRead(biteId: string): Promise<void> {
  const response = await fetch(
    '/api/method/growie_app.api.insights.mark_bite_read',
    {
      method: 'POST',
      credentials: 'include',
      headers: postHeaders(),
      body: JSON.stringify({ bite_name: biteId }),
    }
  )
  const resData = await response.json()
  console.log('markBiteRead response:', resData)

  if (resData?.exc) {
    throw new Error(resData.exc_type ? `${resData.exc_type}: ${resData.exc}` : resData.exc)
  }
}

export async function getUserProgress(): Promise<UserProgress | null> {
  const response = await fetch(
    '/api/method/growie_app.api.insights.get_user_progress',
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  console.log('getUserProgress response:', resData)

  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as UserProgress
  }
  return null
}
