import type { Holding, AssetClass } from '@/types'
import type { PortfolioSummary } from '@/services/portfolio'
import type { HistoricalPriceMap } from '@/services/portfolio'
import { assetCategoryLabelForHolding, bucketLabelForHolding } from '@/lib/stack-grouping'
import { computeWeightedPortfolioReturn } from '@/lib/stack-holdings-summary'
import type { StackHolding } from '@/services/stack'
import {
  buildTimelineBuckets,
  endOfPreviousCalendarMonth,
  portfolioValueAtAsOf,
} from '@/lib/portfolio-chart-data'
import { getAssetClassName } from '@/lib/format'

export const ASSET_CLASS_ORDER: AssetClass[] = [
  'nse-stocks',
  'global-stocks',
  'etf',
  'mmf',
  'real-estate',
]

export interface AssetClassGroup {
  assetClass: AssetClass
  name: string
  totalValueKES: number
  totalCostKES: number
  gainPercent: number
  holdings: Holding[]
  tickersPreview: string
}

/** Preferred display order for Growe Asset Category summaries. */
export const ASSET_CATEGORY_ORDER = [
  'Stock',
  'ETF',
  'Money Market Fund',
  'Bonds',
  'REITS',
  'Indices',
  'Private Company/Other',
  'Other',
] as const

export interface AssetCategoryGroup {
  category: string
  name: string
  totalValueKES: number
  totalCostKES: number
  gainPercent: number
  holdings: Holding[]
  tickersPreview: string
}

export interface NetPortfolioPoint {
  label: string
  valueKES: number
  monthGrowthPercent: number
}

export interface DashboardMetrics {
  totalValueKES: number
  totalCostKES: number
  gainKES: number
  gainPercent: number
  monthlyGrowthKES: number
  monthlyGrowthPercent: number
  healthScore: number
  healthLabel: string
}

export function groupByAssetClass(holdings: Holding[]): AssetClassGroup[] {
  const map = new Map<AssetClass, Holding[]>()
  for (const ac of ASSET_CLASS_ORDER) map.set(ac, [])
  for (const h of holdings) {
    const list = map.get(h.assetClass) ?? []
    list.push(h)
    map.set(h.assetClass, list)
  }

  return ASSET_CLASS_ORDER.map((assetClass) => {
    const list = map.get(assetClass) ?? []
    const weighted = computeWeightedPortfolioReturn(list)
    const totalValueKES = weighted.totalValueInKES
    const totalCostKES = weighted.totalCostInKES
    const gainPercent = weighted.gainPercent
    const tickers = [...new Set(list.map((h) => h.ticker || h.name).filter(Boolean))]
    const tickersPreview =
      tickers.length === 0
        ? '—'
        : tickers.length <= 3
          ? tickers.join(' · ')
          : `${tickers.slice(0, 3).join(' · ')} · +${tickers.length - 3}`
    return {
      assetClass,
      name: getAssetClassName(assetClass),
      totalValueKES,
      totalCostKES,
      gainPercent,
      holdings: list,
      tickersPreview,
    }
  }).filter((g) => g.holdings.length > 0)
}

function tickersPreviewFromHoldings(list: Holding[]): string {
  const tickers = [...new Set(list.map((h) => h.ticker || h.name).filter(Boolean))]
  if (tickers.length === 0) return '—'
  if (tickers.length <= 3) return tickers.join(' · ')
  return `${tickers.slice(0, 3).join(' · ')} · +${tickers.length - 3}`
}

export function groupByAssetCategory(holdings: Holding[]): AssetCategoryGroup[] {
  const map = new Map<string, Holding[]>()
  for (const h of holdings) {
    const category = assetCategoryLabelForHolding(h as StackHolding)
    const list = map.get(category) ?? []
    list.push(h)
    map.set(category, list)
  }

  const ordered = [...map.entries()].sort(([a], [b]) => {
    const ai = ASSET_CATEGORY_ORDER.indexOf(a as (typeof ASSET_CATEGORY_ORDER)[number])
    const bi = ASSET_CATEGORY_ORDER.indexOf(b as (typeof ASSET_CATEGORY_ORDER)[number])
    const ar = ai >= 0 ? ai : ASSET_CATEGORY_ORDER.length
    const br = bi >= 0 ? bi : ASSET_CATEGORY_ORDER.length
    if (ar !== br) return ar - br
    return a.localeCompare(b)
  })

  return ordered.map(([category, list]) => {
    const weighted = computeWeightedPortfolioReturn(list)
    const totalValueKES = weighted.totalValueInKES
    const totalCostKES = weighted.totalCostInKES
    const gainPercent = weighted.gainPercent
    return {
      category,
      name: category,
      totalValueKES,
      totalCostKES,
      gainPercent,
      holdings: list,
      tickersPreview: tickersPreviewFromHoldings(list),
    }
  })
}

/**
 * Calendar month-over-month: portfolio value on the last day of the previous month vs today.
 * Prefer API summary (uses stored snapshots when available).
 */
export function computeMonthOverMonthGrowth(
  holdings: Holding[],
  summary?: Pick<PortfolioSummary, 'monthlyGrowthKES' | 'monthlyGrowthPercent'> | null
): {
  monthlyGrowthKES: number
  monthlyGrowthPercent: number
} {
  if (
    summary != null &&
    typeof summary.monthlyGrowthKES === 'number' &&
    typeof summary.monthlyGrowthPercent === 'number'
  ) {
    return {
      monthlyGrowthKES: summary.monthlyGrowthKES,
      monthlyGrowthPercent: summary.monthlyGrowthPercent,
    }
  }

  if (!holdings.length) return { monthlyGrowthKES: 0, monthlyGrowthPercent: 0 }

  const now = new Date()
  const endOfLastMonth = endOfPreviousCalendarMonth(now)
  const valueNow = holdings.reduce((s, h) => s + (h.valueInKES ?? h.valueKES ?? 0), 0)
  const valueThen = portfolioValueAtAsOf(holdings, endOfLastMonth, now)

  const monthlyGrowthKES = valueNow - valueThen
  const monthlyGrowthPercent =
    valueThen > 0
      ? (monthlyGrowthKES / valueThen) * 100
      : valueNow > 0
        ? 100
        : 0

  return { monthlyGrowthKES, monthlyGrowthPercent }
}

export function getNetPortfolioSeries(
  holdings: Holding[],
  monthCount = 6,
  historicalByTicker?: HistoricalPriceMap
): NetPortfolioPoint[] {
  const buckets = buildTimelineBuckets(holdings, 'monthly', new Date(), historicalByTicker)
  const slice = buckets.slice(-monthCount)
  return slice.map((b, i) => {
    const prev = i > 0 ? slice[i - 1].totalMarket : b.totalMarket
    const monthGrowthPercent =
      prev > 0 ? ((b.totalMarket - prev) / prev) * 100 : 0
    const label = b.label.split(' ')[0] ?? b.label
    return {
      label,
      valueKES: b.totalMarket,
      monthGrowthPercent,
    }
  })
}

export function computeDashboardMetrics(
  holdings: Holding[],
  summary: PortfolioSummary | null,
  kesPerUsd = 0
): DashboardMetrics {
  const weighted = computeWeightedPortfolioReturn(holdings, kesPerUsd)
  const totalValueKES = summary?.totalValueKES ?? weighted.totalValueInKES
  const totalCostKES = summary?.totalCostKES ?? weighted.totalCostInKES
  const gainKES = summary?.gainKES ?? weighted.deltaKES
  const gainPercent = summary?.gainPercent ?? weighted.gainPercent

  const { monthlyGrowthKES, monthlyGrowthPercent } = computeMonthOverMonthGrowth(holdings, summary)

  const groups = groupByAssetClass(holdings)
  const activeClasses = groups.length
  const diversificationScore = Math.min(25, activeClasses * 6)
  const gainScore = Math.min(25, Math.max(0, 12 + gainPercent / 2))
  const holdingsScore = Math.min(25, holdings.length * 3)
  const base = holdings.length > 0 ? 25 : 0
  const healthScore = Math.round(
    Math.min(100, base + diversificationScore + gainScore + holdingsScore)
  )
  const healthLabel =
    healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Fair' : 'Needs work'

  return {
    totalValueKES,
    totalCostKES,
    gainKES,
    gainPercent,
    monthlyGrowthKES,
    monthlyGrowthPercent,
    healthScore,
    healthLabel,
  }
}

export function allocationSlices(holdings: Holding[]) {
  const groups = groupByAssetClass(holdings)
  const total = groups.reduce((s, g) => s + g.totalValueKES, 0)
  if (total <= 0) return []
  return groups.map((g) => ({
    name: g.name,
    value: g.totalValueKES,
    percentage: ((g.totalValueKES / total) * 100).toFixed(1),
    assetClass: g.assetClass,
  }))
}

export interface ExchangeAllocationSlice {
  id: string
  name: string
  value: number
  percentage: string
}

/** Portfolio allocation grouped by exchange (NSE, NYSE, NASDAQ, …). */
export function exchangeAllocationSlices(holdings: Holding[]): ExchangeAllocationSlice[] {
  const map = new Map<string, number>()
  for (const h of holdings) {
    const val = h.valueInKES ?? h.valueKES ?? 0
    if (val <= 0) continue
    const label = bucketLabelForHolding(h as StackHolding, 'exchange')
    const key = label.trim() || 'Other'
    map.set(key, (map.get(key) ?? 0) + val)
  }
  const total = [...map.values()].reduce((s, v) => s + v, 0)
  if (total <= 0) return []
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      value,
      percentage: ((value / total) * 100).toFixed(1),
    }))
}
