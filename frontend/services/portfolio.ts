import type { Holding } from '@/types'

export type { Holding }

// ─── Growe Stock ──────────────────────────────────────────────────────────────

export interface GroweStock {
  name: string         // Frappe document name
  ticker: string       // e.g. SCOM, AAPL
  company_name: string // e.g. Safaricom PLC
  market: string       // NSE | Global
  currency: string     // KES | USD
  region?: string
  exchange_platform?: string
  exchange_platform_name?: string
}

export interface PortfolioSummary {
  totalValueKES: number
  totalCostKES: number
  gainKES: number
  gainPercent: number
  holdingsCount: number
  allocation: Record<string, number>
  allocationPercent: Record<string, number>
  /** Value on last day of previous calendar month (KES). */
  monthlyGrowthKES?: number
  monthlyGrowthPercent?: number
  monthlyGrowthCompareDate?: string
  monthlyGrowthValueThenKES?: number
  monthlyGrowthValueNowKES?: number
  /** snapshot = stored month-end total; estimated = interpolated until snapshot exists */
  monthlyGrowthSource?: 'snapshot' | 'estimated'
}

export interface AssetCategoryOption {
  name: string
  label: string
}

export interface AddHoldingData {
  assetClass: string
  assetName: string   // Growe Stock document name (Link field)
  currency: string
  quantity?: number
  notes?: string
  dateAdded?: string
}

export async function getAssetCategories(): Promise<AssetCategoryOption[]> {
  const res = await fetch('/api/method/growie_app.api.portfolio.get_asset_categories', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (Array.isArray(data?.message)) return data.message as AssetCategoryOption[]
  throw new Error(extractError(data))
}

export interface UpdateHoldingData {
  assetName?: string  // Growe Stock document name
  currency?: string
  dateAdded?: string
  quantity?: number
  notes?: string
}

export interface HoldingMovementPoint {
  label: string
  date: string
  valueKES: number
}

export interface HoldingMovement {
  holdingId: string
  holdingName: string
  period: string
  points: HoldingMovementPoint[]
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

function extractError(resData: Record<string, unknown>): string {
  if (resData._server_messages) {
    try {
      const msgs = JSON.parse(resData._server_messages as string) as string[]
      const first = JSON.parse(msgs[0]) as { message?: string }
      return first.message ?? 'Request failed'
    } catch { /**/ }
  }
  if (resData.exc_type && resData.exc) return `${resData.exc_type}: ${resData.exc}`
  if (typeof resData.exc === 'string') return resData.exc
  return 'Request failed'
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export async function getHoldings(): Promise<Holding[]> {
  const response = await fetch(
    '/api/method/growie_app.api.portfolio.get_holdings',
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  console.log('getHoldings response:', resData)

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as Holding[]
  }
  return []
}

export async function getPortfolioSummary(): Promise<PortfolioSummary | null> {
  const response = await fetch(
    '/api/method/growie_app.api.portfolio.get_portfolio_summary',
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  console.log('getPortfolioSummary response:', resData)

  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as PortfolioSummary
  }
  return null
}

export async function addHolding(data: AddHoldingData): Promise<Holding> {
  const response = await fetch(
    '/api/method/growie_app.api.portfolio.add_holding',
    {
      method: 'POST',
      credentials: 'include',
      headers: postHeaders(),
      body: JSON.stringify({
        asset_class: data.assetClass,
        asset_name: data.assetName,
        currency: data.currency,
        quantity: data.quantity ?? 0,
        notes: data.notes ?? '',
        date_added: data.dateAdded ?? '',
      }),
    }
  )
  const resData = await response.json()
  console.log('addHolding response:', resData)

  if (resData?.message) {
    return resData.message as Holding
  }
  throw new Error(extractError(resData))
}

export async function updateHolding(holdingId: string, data: UpdateHoldingData): Promise<Holding> {
  const response = await fetch(
    '/api/method/growie_app.api.portfolio.update_holding',
    {
      method: 'POST',
      credentials: 'include',
      headers: postHeaders(),
      body: JSON.stringify({
        holding_name: holdingId,
        asset_name: data.assetName,
        currency: data.currency,
        date_added: data.dateAdded,
        quantity: data.quantity,
        notes: data.notes,
      }),
    }
  )
  const resData = await response.json()
  console.log('updateHolding response:', resData)

  if (resData?.message) {
    return resData.message as Holding
  }
  throw new Error(extractError(resData))
}

export interface PendingVerificationTicker {
  stock_name: string
  ticker: string
  company_name: string
  by_unsubscribed_member?: boolean
}

export interface HoldingsBulkImportResult {
  created: number
  skipped: number
  active_rows: number
  sold_rows: number
  errors: string[]
  source?: string
  unsupported_tickers?: string[]
  pending_verification?: PendingVerificationTicker[]
  pending_verification_count?: number
  is_subscribed?: boolean
  goals?: ImportedGoalSummary[]
  goals_count?: number
}

export interface ImportedGoalSummary {
  name: string
  goal_name: string
  created: boolean
  current_amount: number
  currency?: string
}

/** @deprecated Use HoldingsBulkImportResult */
export type HoldingsExcelImportResult = HoldingsBulkImportResult

/** Upload a file as a private Frappe File (portal upload_file). */
export async function uploadPortfolioImportFile(file: File): Promise<string> {
  const csrf = getCSRF()
  const fd = new FormData()
  fd.append('file', file)
  fd.append('is_private', '1')
  fd.append('folder', 'Home')
  const response = await fetch('/api/method/upload_file', {
    method: 'POST',
    credentials: 'include',
    headers: csrf ? { 'X-Frappe-CSRF-Token': csrf } : {},
    body: fd,
  })
  const resData = (await response.json()) as Record<string, unknown>
  const msg = resData.message as { file_url?: string } | undefined
  if (msg?.file_url && typeof msg.file_url === 'string') {
    return msg.file_url
  }
  throw new Error(extractError(resData))
}

/** @deprecated Use uploadPortfolioImportFile */
export const uploadPortfolioExcelFile = uploadPortfolioImportFile

async function importHoldingsFromEndpoint(
  method: string,
  body: Record<string, string>
): Promise<HoldingsBulkImportResult> {
  const response = await fetch(`/api/method/${method}`, {
    method: 'POST',
    credentials: 'include',
    headers: postHeaders(),
    body: JSON.stringify(body),
  })
  const resData = (await response.json()) as Record<string, unknown>
  if (resData?.message && typeof resData.message === 'object') {
    return resData.message as HoldingsBulkImportResult
  }
  throw new Error(extractError(resData))
}

/** Scope template from .xlsx / .xls */
export async function importHoldingsFromExcel(file: File): Promise<HoldingsBulkImportResult> {
  const fileUrl = await uploadPortfolioImportFile(file)
  return importHoldingsFromEndpoint('growie_app.api.portfolio.import_holdings_excel', {
    file_url: fileUrl,
  })
}

/** Scope template from .csv */
export async function importHoldingsFromCsv(file: File): Promise<HoldingsBulkImportResult> {
  const fileUrl = await uploadPortfolioImportFile(file)
  return importHoldingsFromEndpoint('growie_app.api.portfolio.import_holdings_csv', {
    file_url: fileUrl,
  })
}

/** Scope template from a public Google Sheets link */
export async function importHoldingsFromSpreadsheet(
  spreadsheetUrl: string
): Promise<HoldingsBulkImportResult> {
  return importHoldingsFromEndpoint('growie_app.api.portfolio.import_holdings_spreadsheet', {
    spreadsheet_url: spreadsheetUrl.trim(),
  })
}

export async function deleteHolding(holdingId: string): Promise<void> {
  const response = await fetch(
    '/api/method/growie_app.api.portfolio.delete_holding',
    {
      method: 'POST',
      credentials: 'include',
      headers: postHeaders(),
      body: JSON.stringify({ holding_name: holdingId }),
    }
  )
  const resData = await response.json()
  console.log('deleteHolding response:', resData)

  if (resData?.exc) {
    throw new Error(extractError(resData))
  }
}

// ─── Stock search ─────────────────────────────────────────────────────────────

export async function searchStocks(
  query: string = '',
  market?: string,
  instrumentType?: string,
  exchangePlatform?: string
): Promise<GroweStock[]> {
  const params = new URLSearchParams()
  if (query) params.append('query', query)
  if (market) params.append('market', market)
  if (instrumentType) params.append('instrument_type', instrumentType)
  if (exchangePlatform) params.append('exchange_platform', exchangePlatform)

  const response = await fetch(
    `/api/method/growie_app.api.portfolio.search_stocks?${params.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  console.log('searchStocks response:', resData)

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as GroweStock[]
  }
  return []
}

export async function getCurrencies(query: string = ''): Promise<string[]> {
  const params = new URLSearchParams()
  if (query) params.append('query', query)
  const response = await fetch(
    `/api/method/growie_app.api.portfolio.get_currencies?${params.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  if (!Array.isArray(resData?.message)) return []
  return resData.message.map((r: { name: string }) => r.name)
}

export async function getHoldingMovement(holdingId: string, period: '1m' | '1y' = '1y'): Promise<HoldingMovement | null> {
  const params = new URLSearchParams({ holding_name: holdingId, period })
  const response = await fetch(
    `/api/method/growie_app.api.portfolio.get_holding_movement?${params.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  if (resData?.message) return resData.message as HoldingMovement
  return null
}

export interface KesCurrencyMultiplier {
  multiplier: number
  currency: string
  fallback?: boolean
}

/** ERPNext-backed KES → display currency multiplier for formatting portfolio amounts in header/UI. */
export async function getKesToCurrencyMultiplier(toCurrency: string): Promise<KesCurrencyMultiplier> {
  const params = new URLSearchParams({ to_currency: toCurrency || 'KES' })
  const response = await fetch(
    `/api/method/growie_app.api.portfolio.get_kes_to_currency_multiplier?${params.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  if (resData?.exc) {
    return { multiplier: 1, currency: (toCurrency || 'KES').toUpperCase(), fallback: true }
  }
  const msg = resData?.message
  if (msg && typeof msg === 'object' && typeof (msg as KesCurrencyMultiplier).multiplier === 'number') {
    return msg as KesCurrencyMultiplier
  }
  return { multiplier: 1, currency: (toCurrency || 'KES').toUpperCase(), fallback: true }
}
