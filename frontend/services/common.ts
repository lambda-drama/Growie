// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdTypeOption {
  type_code: string
  label: string
}

export interface Transaction {
  id: string
  reference: string
  amountKES: number
  tierPurchased: string
  status: string
  paymentMethod: string
  currency: string
  transactionDate: string
}

// ─── Document types (ID types for signup) ─────────────────────────────────────

export async function getDocumentTypes(): Promise<IdTypeOption[]> {
  const response = await fetch(
    '/api/method/growie_app.api.common.get_documents_type',
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  console.log('getDocumentTypes response:', resData)

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as IdTypeOption[]
  }
  return []
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(limit: number = 50): Promise<Transaction[]> {
  const params = new URLSearchParams()
  params.append('limit', limit.toString())

  const response = await fetch(
    `/api/method/growie_app.api.transactions.get_transactions?${params.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  console.log('getTransactions response:', resData)

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as Transaction[]
  }
  return []
}
