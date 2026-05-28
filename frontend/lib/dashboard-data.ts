import type { Holding, AssetClass } from '@/types'
import type { PortfolioSummary } from '@/services/portfolio'
import { buildTimelineBuckets } from '@/lib/portfolio-chart-data'
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
    const totalValueKES = list.reduce((s, h) => s + (h.valueInKES ?? h.valueKES), 0)
    const totalCostKES = list.reduce(
      (s, h) => s + (h.costAtAvgKES ?? h.costBasisKES),
      0
    )
    const gainPercent =
      totalCostKES > 0 ? ((totalValueKES - totalCostKES) / totalCostKES) * 100 : 0
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

/**
 * Month-over-month change: current market value vs cost basis of lots held at prior month-end.
 * (We do not store historical prices; past months use invested capital, now uses live value.)
 */
export function computeMonthOverMonthGrowth(holdings: Holding[]): {
  monthlyGrowthKES: number
  monthlyGrowthPercent: number
} {
  if (!holdings.length) return { monthlyGrowthKES: 0, monthlyGrowthPercent: 0 }

  const now = new Date()
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

  const valueNow = holdings.reduce((s, h) => s + (h.valueInKES ?? h.valueKES ?? 0), 0)
  const basisLastMonth = holdings
    .filter((h) => new Date(h.dateAdded).getTime() <= endOfLastMonth.getTime())
    .reduce((s, h) => s + (h.costAtAvgKES ?? h.costBasisKES ?? 0), 0)

  const monthlyGrowthKES = valueNow - basisLastMonth
  const monthlyGrowthPercent =
    basisLastMonth > 0
      ? (monthlyGrowthKES / basisLastMonth) * 100
      : valueNow > 0
        ? 100
        : 0

  return { monthlyGrowthKES, monthlyGrowthPercent }
}

export function getNetPortfolioSeries(holdings: Holding[], monthCount = 6): NetPortfolioPoint[] {
  const buckets = buildTimelineBuckets(holdings, 'monthly')
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
  summary: PortfolioSummary | null
): DashboardMetrics {
  const totalValueKES =
    summary?.totalValueKES ??
    holdings.reduce((s, h) => s + (h.valueInKES ?? h.valueKES), 0)
  const totalCostKES =
    summary?.totalCostKES ??
    holdings.reduce((s, h) => s + (h.costAtAvgKES ?? h.costBasisKES), 0)
  const gainKES = summary?.gainKES ?? totalValueKES - totalCostKES
  const gainPercent =
    summary?.gainPercent ??
    (totalCostKES > 0 ? (gainKES / totalCostKES) * 100 : 0)

  const { monthlyGrowthKES, monthlyGrowthPercent } = computeMonthOverMonthGrowth(holdings)

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
