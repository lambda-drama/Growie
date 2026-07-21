/**
 * Bucketed portfolio metrics from first investment → now.
 * When historical unit prices are available (Growe Price Cache child table),
 * past buckets use qty × historical priceKES. Otherwise falls back to
 * cumulative cost for past months and current market for the latest month.
 */
import type { Holding } from '@/types'
import type { HistoricalPriceMap, HistoricalPricePoint } from '@/services/portfolio'

export type ChartPeriod = 'monthly' | 'yearly'

export type PortfolioViewLevel = 'portfolio' | 'by_ticker' | 'single'

export interface TimelineBucket {
  /** Sortable key (timestamp) */
  sortKey: number
  /** X-axis short label */
  label: string
  /** Tooltip title e.g. "June 2019" or "2019" */
  tooltipTitle: string
  /** Total market value (all included holdings) */
  totalMarket: number
  /** Total cost basis */
  totalInvested: number
  /** Per ticker market value (for multi-line) */
  byTickerMarket: Record<string, number>
}

function holdingDate(h: Holding): Date {
  return new Date(h.dateAdded)
}

/** Last moment of the previous calendar month (e.g. 30 Apr when today is in May). */
export function endOfPreviousCalendarMonth(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
}

/**
 * Estimated portfolio value on ``asOf`` (KES): lots held by then, value interpolated
 * from cost at purchase to today's market value. Matches backend when no snapshot exists.
 */
export function portfolioValueAtAsOf(
  holdings: Holding[],
  asOf: Date,
  now: Date = new Date()
): number {
  const asOfTs = asOf.getTime()
  const nowTs = now.getTime()
  let total = 0
  for (const h of holdings) {
    const addedTs = holdingDate(h).getTime()
    if (addedTs > asOfTs) continue
    const marketNow = h.valueInKES ?? h.valueKES ?? 0
    const cost = h.costAtAvgKES ?? h.costBasisKES ?? 0
    if (marketNow <= 0 && cost <= 0) continue
    if (nowTs <= addedTs) {
      total += cost > 0 ? cost : marketNow
      continue
    }
    if (asOfTs >= nowTs) {
      total += marketNow
      continue
    }
    const span = Math.max(1, nowTs - addedTs)
    const frac = Math.min(1, Math.max(0, (asOfTs - addedTs) / span))
    total += cost + (marketNow - cost) * frac
  }
  return total
}

export function getFirstInvestmentDate(holdings: Holding[]): Date | null {
  if (!holdings.length) return null
  let min = holdingDate(holdings[0]).getTime()
  for (let i = 1; i < holdings.length; i++) {
    const t = holdingDate(holdings[i]).getTime()
    if (t < min) min = t
  }
  return new Date(min)
}

function endOfMonth(y: number, m: number): Date {
  return new Date(y, m + 1, 0, 23, 59, 59, 999)
}

function endOfYear(y: number): Date {
  return new Date(y, 11, 31, 23, 59, 59, 999)
}

/** Month-end dates from first investment month through `through` (inclusive). */
export function getMonthEndDates(first: Date, through: Date): Date[] {
  const out: Date[] = []
  let y = first.getFullYear()
  let m = first.getMonth()
  const endY = through.getFullYear()
  const endM = through.getMonth()
  while (y < endY || (y === endY && m <= endM)) {
    const cap = endOfMonth(y, m)
    out.push(cap.getTime() > through.getTime() ? new Date(through) : cap)
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  return out
}

export function getYearEndDates(first: Date, through: Date): Date[] {
  const out: Date[] = []
  const y0 = first.getFullYear()
  const y1 = through.getFullYear()
  for (let y = y0; y <= y1; y++) {
    const cap = endOfYear(y)
    out.push(cap.getTime() > through.getTime() ? new Date(through) : cap)
  }
  return out
}

function tickerKey(h: Holding): string {
  return (h.ticker || h.name || h.id).trim() || h.id
}

/** Closest historical unit price on or before ``asOf`` (KES). */
export function historicalUnitPriceKES(
  series: HistoricalPricePoint[] | undefined,
  asOf: Date
): number | null {
  if (!series?.length) return null
  const asOfTs = asOf.getTime()
  let best: HistoricalPricePoint | null = null
  for (const row of series) {
    const t = new Date(row.date).getTime()
    if (Number.isNaN(t) || t > asOfTs) continue
    if (!best || t > new Date(best.date).getTime()) best = row
  }
  if (!best) return null
  const kes = Number(best.priceKES)
  return kes > 0 ? kes : null
}

function hasUsableHistorical(map: HistoricalPriceMap | undefined): boolean {
  if (!map) return false
  return Object.values(map).some((rows) => rows?.length > 0)
}

function aggregateAtDate(
  holdings: Holding[],
  asOf: Date,
  valuation: 'cost' | 'market' | 'historical',
  historicalByTicker?: HistoricalPriceMap,
): {
  totalMarket: number
  totalInvested: number
  byTickerMarket: Record<string, number>
} {
  const t = asOf.getTime()
  const subset = holdings.filter((h) => holdingDate(h).getTime() <= t)
  let totalMarket = 0
  let totalInvested = 0
  const byTickerMarket: Record<string, number> = {}
  for (const h of subset) {
    const cost = h.costAtAvgKES ?? h.costBasisKES ?? 0
    const market = h.valueInKES ?? h.valueKES ?? 0
    let amount = valuation === 'market' ? market : cost

    if (valuation === 'historical') {
      const ticker = (h.ticker || '').toUpperCase().trim()
      const unit = historicalUnitPriceKES(historicalByTicker?.[ticker], asOf)
      if (unit != null && h.quantity > 0) {
        amount = unit * h.quantity
      } else {
        // Missing history for this lot/date — keep cost so the series stays continuous.
        amount = cost > 0 ? cost : market
      }
    }

    totalMarket += amount
    totalInvested += cost
    const k = tickerKey(h)
    byTickerMarket[k] = (byTickerMarket[k] ?? 0) + amount
  }
  return { totalMarket, totalInvested, byTickerMarket }
}

export function buildTimelineBuckets(
  holdings: Holding[],
  period: ChartPeriod,
  through: Date = new Date(),
  historicalByTicker?: HistoricalPriceMap,
): TimelineBucket[] {
  const first = getFirstInvestmentDate(holdings)
  if (!first) return []

  const dates = period === 'monthly' ? getMonthEndDates(first, through) : getYearEndDates(first, through)
  const useHistorical = hasUsableHistorical(historicalByTicker)

  return dates.map((asOf, index) => {
    const isLatest = index === dates.length - 1
    const valuation: 'cost' | 'market' | 'historical' = isLatest
      ? 'market'
      : useHistorical
        ? 'historical'
        : 'cost'
    const { totalMarket, totalInvested, byTickerMarket } = aggregateAtDate(
      holdings,
      asOf,
      valuation,
      historicalByTicker,
    )
    const sortKey = asOf.getTime()
    if (period === 'monthly') {
      const label = asOf.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
      const tooltipTitle = asOf.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
      return { sortKey, label, tooltipTitle, totalMarket, totalInvested, byTickerMarket }
    }
    const y = asOf.getFullYear()
    return {
      sortKey,
      label: String(y),
      tooltipTitle: String(y),
      totalMarket,
      totalInvested,
      byTickerMarket,
    }
  })
}

/** Legend / tooltip label: ticker (or name) + purchase date so duplicate tickers stay distinct. */
export function holdingLineLabel(h: Holding): string {
  const sym = (h.ticker || h.name).trim().slice(0, 22) || 'Holding'
  const d = new Date(h.dateAdded).toLocaleDateString('en-KE', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${sym} · ${d}`
}

/**
 * One Recharts row per time bucket; one numeric column per holding `id`.
 * Value = today's market value for that lot from its purchase date through the bucket (0 before purchase).
 */
export function buildPortfolioHoldingLineRows(
  holdings: Holding[],
  period: ChartPeriod,
  through: Date = new Date(),
): Array<Record<string, string | number>> {
  const buckets = buildTimelineBuckets(holdings, period, through)
  return buckets.map((b) => {
    const t = b.sortKey
    const row: Record<string, string | number> = {
      label: b.label,
      tooltipTitle: b.tooltipTitle,
      sortKey: b.sortKey,
    }
    for (const h of holdings) {
      row[h.id] =
        holdingDate(h).getTime() <= t
          ? h.valueInKES ?? h.valueKES ?? 0
          : 0
    }
    return row
  })
}

export interface TickerAggregate {
  ticker: string
  displayName: string
  lots: number
  quantity: number
  costBasis: number
  marketValue: number
  holdings: Holding[]
}

export function groupByTicker(holdings: Holding[]): TickerAggregate[] {
  const map = new Map<string, TickerAggregate>()
  for (const h of holdings) {
    const t = tickerKey(h)
    let g = map.get(t)
    if (!g) {
      g = {
        ticker: t,
        displayName: h.name,
        lots: 0,
        quantity: 0,
        costBasis: 0,
        marketValue: 0,
        holdings: [],
      }
      map.set(t, g)
    }
    g.lots += 1
    g.quantity += h.quantity
    g.costBasis += h.costAtAvgKES ?? h.costBasisKES ?? 0
    g.marketValue += h.valueInKES ?? h.valueKES ?? 0
    g.holdings.push(h)
  }
  return Array.from(map.values()).sort((a, b) => b.marketValue - a.marketValue)
}

export function buyUnitPrice(h: Holding): number {
  if (h.quantity > 0) return h.costBasisKES / h.quantity
  return 0
}

export function currentUnitPrice(h: Holding): number {
  if (h.quantity > 0) return h.valueKES / h.quantity
  return h.currentPriceKES ?? 0
}

/** Hex for SVG / Recharts (avoid CSS var() in gradients). */
const LINE_PALETTE = [
  '#1246a8',
  '#16a34a',
  '#ca8a04',
  '#9333ea',
  '#0891b2',
  '#dc2626',
  '#64748b',
  '#db2777',
  '#0d9488',
  '#ea580c',
]

export function lineColorForIndex(i: number): string {
  return LINE_PALETTE[i % LINE_PALETTE.length]
}

export { LINE_PALETTE }
