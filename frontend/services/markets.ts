// ─── Types ────────────────────────────────────────────────────────────────────

export interface StockWithPrice {
  name: string
  ticker: string
  companyName: string
  market: string
  sector: string
  currency: string
  apiSymbol: string
  priceKES: number
  priceUSD: number
  changePercent: number
  source: string
  fetchedAt: string
  hasPrice: boolean
}

export interface PriceCacheRow {
  ticker: string
  market: 'NSE' | 'Global'
  price_kes: number
  price_usd: number
  change_percent: number
  source: string
  fetched_at: string
}

export interface RefreshResult {
  nse_updated: number
  global_updated: number
  prices: Record<string, number>
}

export interface StockPickRaw {
  id: string
  ticker: string
  market: string
  title: string
  commentary: string
  sentiment: string
  isPro: boolean
  publishedAt: string
  weekStarting?: string
  isScopePartner?: boolean
  learningBite?: {
    id: string
    topic: string
    title?: string
    explanation: string
    difficulty?: string
    estimatedReadTime?: number
  } | null
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

// ─── Price cache ──────────────────────────────────────────────────────────────

export async function getPriceCache(): Promise<PriceCacheRow[]> {
  const response = await fetch(
    '/api/method/growie_app.api.price.get_price_cache',
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  console.log('getPriceCache response:', resData)

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as PriceCacheRow[]
  }
  return []
}

export async function getMarketIndices(): Promise<PriceCacheRow[]> {
  const response = await fetch(
    '/api/method/growie_app.api.price.get_market_indices',
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  console.log('getMarketIndices response:', resData)

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as PriceCacheRow[]
  }
  return []
}

/** Trigger a server-side price refresh (requires auth). */
export async function refreshPrices(): Promise<RefreshResult> {
  const response = await fetch(
    '/api/method/growie_app.api.price.refresh_prices',
    {
      method: 'POST',
      credentials: 'include',
      headers: postHeaders(),
      body: JSON.stringify({}),
    }
  )
  const resData = await response.json()
  console.log('refreshPrices response:', resData)

  if (resData?.message) {
    return resData.message as RefreshResult
  }
  throw new Error(resData?.exc ?? 'Failed to refresh prices')
}

// ─── Stocks with live prices (Markets page) ──────────────────────────────────

export async function getStocksWithPrices(
  market?: string,
  sector?: string
): Promise<StockWithPrice[]> {
  const params = new URLSearchParams()
  if (market) params.append('market', market)
  if (sector) params.append('sector', sector)
  params.append('limit', '200')

  const response = await fetch(
    `/api/method/growie_app.api.price.get_stocks_with_prices?${params.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as StockWithPrice[]
  }
  return []
}

export async function refreshStockPrices(): Promise<{ nse_updated: number; global_updated: number; total: number }> {
  const csrf = (window as unknown as Record<string, string>).csrf_token ?? ''
  const response = await fetch(
    '/api/method/growie_app.api.price.refresh_stock_prices',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({}),
    }
  )
  const resData = await response.json()
  if (resData?.message) return resData.message
  throw new Error(resData?.exc ?? 'Failed to refresh stock prices')
}

// ─── Stock picks (Growe Insight) ──────────────────────────────────────────────

export async function getStockPicks(market?: string): Promise<StockPickRaw[]> {
  const params = new URLSearchParams()
  if (market) params.append('market', market)

  const url = `/api/method/growie_app.api.insights.get_insights${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const resData = await response.json()

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as StockPickRaw[]
  }
  return []
}
