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

function extractError(resData: Record<string, unknown>): string {
  if (resData._server_messages) {
    try {
      const msgs = JSON.parse(resData._server_messages as string) as string[]
      const first = JSON.parse(msgs[0]) as { message?: string }
      return first.message ?? 'Request failed'
    } catch { /**/ }
  }
  if (typeof resData.exc === 'string') {
    const lines = resData.exc.trim().split('\n').filter(Boolean)
    return lines[lines.length - 1] ?? 'Request failed'
  }
  return 'Request failed'
}

export interface GroweGoal {
  id: string
  goalName: string
  category: string
  targetAmount: number
  currentAmount: number
  progressPercent: number
  targetDate: string
  priority: string
  status: string
  monthlyContribution: number
  currency: string
}

export interface GroweGoalTransaction {
  id: string
  goalId: string
  transactionType: string
  amount: number
  currency: string
  transactionDate: string
  source: string
  reference: string
  notes: string
  docstatus: number
}

export interface GoalDetail {
  goal: GroweGoal
  transactions: GroweGoalTransaction[]
}

export interface CreateGoalData {
  goalName: string
  targetAmount: number
  targetDate: string
  category?: string
  priority?: string
  monthlyContribution?: number
  currency?: string
}

export interface AddGoalTransactionData {
  goalId: string
  amount: number
  transactionType?: string
  transactionDate?: string
  currency?: string
  source?: string
  reference?: string
  notes?: string
}

export async function getGoals(): Promise<GroweGoal[]> {
  const response = await fetch('/api/method/growie_app.api.goals.get_goals', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const resData = await response.json()
  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as GroweGoal[]
  }
  if (resData?.exc) throw new Error(extractError(resData))
  return []
}

export async function getGoal(goalId: string): Promise<GoalDetail | null> {
  const params = new URLSearchParams({ goal_name: goalId })
  const response = await fetch(`/api/method/growie_app.api.goals.get_goal?${params}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const resData = await response.json()
  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as GoalDetail
  }
  if (resData?.exc) throw new Error(extractError(resData))
  return null
}

export async function createGoal(data: CreateGoalData): Promise<GroweGoal> {
  const response = await fetch('/api/method/growie_app.api.goals.create_goal', {
    method: 'POST',
    credentials: 'include',
    headers: postHeaders(),
    body: JSON.stringify({
      goal_name: data.goalName,
      target_amount: data.targetAmount,
      target_date: data.targetDate,
      category: data.category ?? 'Wealth Building',
      priority: data.priority ?? 'Medium',
      monthly_contribution: data.monthlyContribution ?? 0,
      currency: data.currency ?? 'USD',
    }),
  })
  const resData = await response.json()
  if (resData?.message) return resData.message as GroweGoal
  throw new Error(extractError(resData))
}

export async function updateGoal(
  goalId: string,
  data: Partial<CreateGoalData> & { status?: string }
): Promise<GroweGoal> {
  const response = await fetch('/api/method/growie_app.api.goals.update_goal', {
    method: 'POST',
    credentials: 'include',
    headers: postHeaders(),
    body: JSON.stringify({
      goal_name: goalId,
      goal_name_label: data.goalName,
      target_amount: data.targetAmount,
      target_date: data.targetDate,
      category: data.category,
      priority: data.priority,
      status: data.status,
      monthly_contribution: data.monthlyContribution,
      currency: data.currency,
    }),
  })
  const resData = await response.json()
  if (resData?.message) return resData.message as GroweGoal
  throw new Error(extractError(resData))
}

export async function deleteGoal(goalId: string): Promise<void> {
  const response = await fetch('/api/method/growie_app.api.goals.delete_goal', {
    method: 'POST',
    credentials: 'include',
    headers: postHeaders(),
    body: JSON.stringify({ goal_name: goalId }),
  })
  const resData = await response.json()
  if (resData?.exc) throw new Error(extractError(resData))
}

export async function addGoalTransaction(
  data: AddGoalTransactionData
): Promise<{ transaction: GroweGoalTransaction; goal: GroweGoal }> {
  const response = await fetch('/api/method/growie_app.api.goals.add_goal_transaction', {
    method: 'POST',
    credentials: 'include',
    headers: postHeaders(),
    body: JSON.stringify({
      goal: data.goalId,
      amount: data.amount,
      transaction_type: data.transactionType ?? 'Deposit',
      transaction_date: data.transactionDate,
      currency: data.currency ?? 'USD',
      source: data.source ?? 'Bank Transfer',
      reference: data.reference ?? '',
      notes: data.notes ?? '',
    }),
  })
  const resData = await response.json()
  if (resData?.message) {
    return resData.message as { transaction: GroweGoalTransaction; goal: GroweGoal }
  }
  throw new Error(extractError(resData))
}
