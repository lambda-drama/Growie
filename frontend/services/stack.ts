import type { AssetClass, Holding } from '@/types'
import type { GroweStock } from '@/services/portfolio'
import { searchStocks } from '@/services/portfolio'

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

export interface StackClassSummary {
  assetClass: AssetClass
  label: string
  positions: number
  valueKES: number
  costKES: number
  gainKES: number
  gainPercent: number
}

export interface StackHolding extends Holding {
  marketTag: string
  region?: string
  exchangePlatform?: string
  avgBuyPrice: number
  currentPrice: number
  gainPercent: number
  unrealizedGainKES: number
}

export interface StackClassDetail {
  assetClass: AssetClass
  label: string
  summary: {
    totalValueKES: number
    totalCostKES: number
    unrealizedGainKES: number
    gainPercent: number
    positions: number
  }
  holdings: StackHolding[]
}

export interface HoldingTransaction {
  id: string
  holdingId: string
  type: 'Buy' | 'Sell'
  quantity: number
  unitPrice: number
  amount: number
  amountKES: number
  currency: string
  transactionDate: string
  marketTag: string
  ticker: string
  reference: string
  notes: string
}

export interface StackPositionDetail {
  holding: StackHolding
  transactions: HoldingTransaction[]
}

export interface RefreshStackPricesResult {
  queued?: boolean
  message?: string
  success?: boolean
  error?: string
  warnings?: string[]
  nse_updated?: number
  global_updated?: number
  tickers_requested?: number
  nse_tickers?: string[]
  global_tickers?: string[]
}

/** Fetch live prices for the member's stack holdings and update Growe Price Cache. */
export async function refreshStackPrices(options?: {
  assetClass?: AssetClass
  holdingId?: string
}): Promise<RefreshStackPricesResult> {
  const body: Record<string, string> = {}
  if (options?.assetClass) body.asset_class = options.assetClass
  if (options?.holdingId) body.holding_name = options.holdingId

  const res = await fetch('/api/method/growie_app.api.stack.refresh_stack_prices', {
    method: 'POST',
    credentials: 'include',
    headers: postHeaders(),
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data?.message) return data.message as RefreshStackPricesResult
  throw new Error(extractError(data))
}

export async function getStackOverview(): Promise<StackClassSummary[]> {
  const res = await fetch('/api/method/growie_app.api.stack.get_stack_overview', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (data?.message && Array.isArray(data.message)) return data.message as StackClassSummary[]
  if (data?.exc) throw new Error(extractError(data))
  return []
}

export async function getStackClass(assetClass: AssetClass): Promise<StackClassDetail> {
  const params = new URLSearchParams({ asset_class: assetClass })
  const res = await fetch(`/api/method/growie_app.api.stack.get_stack_class?${params}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (data?.message) return data.message as StackClassDetail
  throw new Error(extractError(data))
}

export async function getStackPosition(holdingId: string): Promise<StackPositionDetail> {
  const params = new URLSearchParams({ holding_name: holdingId })
  const res = await fetch(`/api/method/growie_app.api.stack.get_stack_position?${params}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (data?.message) return data.message as StackPositionDetail
  throw new Error(extractError(data))
}

export async function inferAssetClass(assetName: string): Promise<{
  assetClass: AssetClass
  market: string
  marketTag: string
}> {
  const params = new URLSearchParams({ asset_name: assetName })
  const res = await fetch(`/api/method/growie_app.api.stack.infer_asset_class?${params}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (data?.message) return data.message as { assetClass: AssetClass; market: string; marketTag: string }
  throw new Error(extractError(data))
}

export async function createStock(payload: {
  ticker: string
  companyName: string
  market: 'NSE' | 'Global' | 'ETF'
  currency?: string
  region?: string
  exchangePlatform?: string
  instrumentType?: string
}): Promise<GroweStock & { assetClass: AssetClass; created: boolean }> {
  const res = await fetch('/api/method/growie_app.api.stack.create_stock', {
    method: 'POST',
    credentials: 'include',
    headers: postHeaders(),
    body: JSON.stringify({
      ticker: payload.ticker,
      company_name: payload.companyName,
      market: payload.market,
      currency: payload.currency ?? 'USD',
      region: payload.region,
      exchange_platform: payload.exchangePlatform,
      instrument_type: payload.instrumentType,
    }),
  })
  const data = await res.json()
  if (data?.message) {
    const m = data.message as Record<string, unknown>
    return {
      name: m.name as string,
      ticker: m.ticker as string,
      company_name: m.company_name as string,
      market: m.market as string,
      currency: m.currency as string,
      region: (m.region as string | undefined) ?? undefined,
      exchange_platform: (m.exchange_platform as string | undefined) ?? undefined,
      assetClass: m.assetClass as AssetClass,
      created: Boolean(m.created),
    }
  }
  throw new Error(extractError(data))
}

export async function getRegions(query = '', limit = 100): Promise<string[]> {
  const params = new URLSearchParams()
  if (query.trim()) params.set('query', query.trim())
  params.set('limit', String(limit))
  const res = await fetch(`/api/method/growie_app.api.stack.get_regions?${params.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (Array.isArray(data?.message)) {
    return data.message
      .map((row: Record<string, unknown>) => String(row.name || '').trim())
      .filter(Boolean)
  }
  throw new Error(extractError(data))
}

export async function getExchangePlatforms(query = '', limit = 100): Promise<string[]> {
  const params = new URLSearchParams()
  if (query.trim()) params.set('query', query.trim())
  params.set('limit', String(limit))
  const res = await fetch(
    `/api/method/growie_app.api.stack.get_exchange_platforms?${params.toString()}`,
    {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }
  )
  const data = await res.json()
  if (Array.isArray(data?.message)) {
    return data.message
      .map((row: Record<string, unknown>) => String(row.name || '').trim())
      .filter(Boolean)
  }
  throw new Error(extractError(data))
}

export interface RecordTradePayload {
  quantity: number
  unitPrice?: number
  /** Growe Asset Category name or legacy slug */
  assetClass?: AssetClass | string
  assetName?: string
  holdingId?: string
  currency?: string
  transactionDate?: string
  notes?: string
  reference?: string
}

export async function recordBuy(payload: RecordTradePayload) {
  const res = await fetch('/api/method/growie_app.api.stack.record_buy', {
    method: 'POST',
    credentials: 'include',
    headers: postHeaders(),
    body: JSON.stringify({
      quantity: payload.quantity,
      unit_price: payload.unitPrice,
      asset_class: payload.assetClass,
      asset_name: payload.assetName,
      holding_name: payload.holdingId,
      currency: payload.currency,
      transaction_date: payload.transactionDate,
      notes: payload.notes,
      reference: payload.reference,
    }),
  })
  const data = await res.json()
  if (data?.message) return data.message as { transaction: HoldingTransaction; holding: StackHolding }
  throw new Error(extractError(data))
}

export async function recordSell(payload: RecordTradePayload & { holdingId: string }) {
  const res = await fetch('/api/method/growie_app.api.stack.record_sell', {
    method: 'POST',
    credentials: 'include',
    headers: postHeaders(),
    body: JSON.stringify({
      holding_name: payload.holdingId,
      quantity: payload.quantity,
      unit_price: payload.unitPrice,
      transaction_date: payload.transactionDate,
      notes: payload.notes,
      reference: payload.reference,
    }),
  })
  const data = await res.json()
  if (data?.message) return data.message as { transaction: HoldingTransaction; holding: StackHolding }
  throw new Error(extractError(data))
}

export async function deleteHoldingTransaction(transactionId: string): Promise<{
  deleted: string
  holding: StackHolding | null
  fullyRemoved: boolean
}> {
  const res = await fetch('/api/method/growie_app.api.stack.delete_holding_transaction', {
    method: 'POST',
    credentials: 'include',
    headers: postHeaders(),
    body: JSON.stringify({ transaction_name: transactionId }),
  })
  const data = await res.json()
  if (data?.message) {
    return data.message as { deleted: string; holding: StackHolding | null; fullyRemoved: boolean }
  }
  throw new Error(extractError(data))
}

export { searchStocks }
