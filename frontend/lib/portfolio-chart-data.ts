/**
 * Bucketed portfolio metrics from first investment → now (no historical price API).
 * Market value per bucket = sum of current valueKES for lots acquired on or before bucket end.
 * Invested = sum of costBasisKES for same lots (snapshot-style, today's marks on positions held).
 */
import type { Holding } from '@/types'

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

function aggregateAtDate(holdings: Holding[], asOf: Date): {
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
    totalMarket += h.valueKES
    totalInvested += h.costBasisKES
    const k = tickerKey(h)
    byTickerMarket[k] = (byTickerMarket[k] ?? 0) + h.valueKES
  }
  return { totalMarket, totalInvested, byTickerMarket }
}

export function buildTimelineBuckets(
  holdings: Holding[],
  period: ChartPeriod,
  through: Date = new Date(),
): TimelineBucket[] {
  const first = getFirstInvestmentDate(holdings)
  if (!first) return []

  const dates = period === 'monthly' ? getMonthEndDates(first, through) : getYearEndDates(first, through)

  return dates.map((asOf) => {
    const { totalMarket, totalInvested, byTickerMarket } = aggregateAtDate(holdings, asOf)
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
      row[h.id] = holdingDate(h).getTime() <= t ? h.valueKES : 0
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
    g.costBasis += h.costBasisKES
    g.marketValue += h.valueKES
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
