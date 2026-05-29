export type ReportType = 'dashboard' | 'portfolio' | 'goals' | 'tax' | 'sold'

export type SoldItemSource = 'transaction' | 'holding'

export interface SoldTransaction {
  id: string
  holdingId: string
  source: SoldItemSource
  sourceLabel: string
  ticker: string
  assetName: string
  assetClass: string
  assetClassLabel: string
  marketTag: string
  quantity: number
  unitPrice: number
  proceedsKES: number
  currency: string
  transactionDate: string
  reference: string
  notes: string
}

export interface SoldTransactionsResponse {
  transactions: SoldTransaction[]
  summary: {
    count: number
    sellTradeCount: number
    markedSoldCount: number
    totalProceedsKES: number
    displayCurrency: string
  }
}

export interface ReportMeta {
  id: ReportType
  title: string
  description: string
}

export const REPORT_CATALOG: ReportMeta[] = [
  {
    id: 'dashboard',
    title: 'Overall Dashboard Report',
    description: 'Comprehensive overview of your portfolio, performance, and goals.',
  },
  {
    id: 'portfolio',
    title: 'Portfolio Performance Report',
    description: 'Detailed performance breakdown of your investments.',
  },
  {
    id: 'goals',
    title: 'Goals Report',
    description: 'Summary of your goals and progress.',
  },
  {
    id: 'tax',
    title: 'Tax Summary Report',
    description: 'Summary of gains, income, and tax-related data.',
  },
]

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

export async function fetchSoldTransactions(
  displayCurrency?: string
): Promise<SoldTransactionsResponse> {
  const params = new URLSearchParams()
  if (displayCurrency) params.set('display_currency', displayCurrency.toUpperCase())
  const qs = params.toString()
  const res = await fetch(
    `/api/method/growie_app.api.reports.get_sold_transactions${qs ? `?${qs}` : ''}`,
    {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }
  )
  const data = await res.json()
  if (data?.exc) throw new Error('Failed to load sold transactions')
  return data.message as SoldTransactionsResponse
}

export async function previewReport(
  reportType: ReportType,
  displayCurrency?: string
): Promise<{ title: string; html: string }> {
  const params = new URLSearchParams({ report_type: reportType })
  if (displayCurrency) params.set('display_currency', displayCurrency.toUpperCase())
  const res = await fetch(`/api/method/growie_app.api.reports.preview_report?${params}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (data?.exc) throw new Error('Failed to load preview')
  const m = data.message as { title: string; html: string }
  return { title: m.title, html: m.html }
}

export async function downloadReportPdf(
  reportType: ReportType,
  displayCurrency?: string
): Promise<void> {
  const csrf = await getCSRF()
  const body: { report_type: ReportType; display_currency?: string } = { report_type: reportType }
  if (displayCurrency) body.display_currency = displayCurrency.toUpperCase()
  const res = await fetch('/api/method/growie_app.api.reports.download_report', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (err?.exc) throw new Error('PDF download failed')
    throw new Error('PDF download failed')
  }

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition')
  let filename = `growe-${reportType}-report.pdf`
  const match = disposition?.match(/filename="?([^";\n]+)"?/)
  if (match?.[1]) filename = match[1]

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
