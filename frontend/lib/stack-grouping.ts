import {
  displayExchangeLabel,
  isInternalMarketRoutingLabel,
  normalizeAssetCategoryLabel,
} from '@/lib/asset-categories'
import { isEtfHolding } from '@/lib/stack-holding-classify'
import type { StackBucketKind } from '@/lib/stack-bucket-icons'
import type { HoldingsSummaryMetrics } from '@/lib/stack-holdings-summary'
import { summarizeHoldingsMetrics } from '@/lib/stack-holdings-summary'
import { groupHoldingsByTicker } from '@/lib/stack-ticker-groups'
import type { StackTickerGroup } from '@/lib/stack-ticker-groups'
import type { StackHolding } from '@/services/stack'

export type StackGroupingMode =
  | 'ticker'
  | 'region'
  | 'exchange'
  | 'sector'
  | 'industry'
  | 'assetCategory'

/** Modes shown in the Group by control (order matters). Ticker is kept as `ticker` but labeled "All". */
export type VisibleStackGroupingMode = Exclude<StackGroupingMode, 'ticker'>

export const GROUP_BY_OPTIONS: {
  mode: StackGroupingMode
  label: string
  hidden?: boolean
}[] = [
  { mode: 'assetCategory', label: 'Asset Category' },
  { mode: 'exchange', label: 'Exchange' },
  { mode: 'region', label: 'Region' },
  { mode: 'sector', label: 'Sector' },
  { mode: 'industry', label: 'Industry' },
  { mode: 'ticker', label: 'All', hidden: true },
]

export const DEFAULT_STACK_GROUPING_MODE: StackGroupingMode = 'assetCategory'

export function isAssetClassOverviewMode(mode: StackGroupingMode): boolean {
  return mode === 'ticker'
}

export function isBucketGroupingMode(mode: StackGroupingMode): mode is Exclude<StackGroupingMode, 'ticker'> {
  return mode !== 'ticker'
}

export function bucketIconKind(mode: StackGroupingMode): StackBucketKind {
  if (mode === 'region') return 'region'
  if (mode === 'sector' || mode === 'industry') return 'sector'
  if (mode === 'assetCategory') return 'security'
  if (mode === 'exchange') return 'exchange'
  return 'security'
}

function inferRegionFromHolding(h: StackHolding): string {
  const explicit = (h.region || '').trim()
  if (explicit) return explicit
  const tag = (h.marketTag || '').toLowerCase()
  const assetClass = (h.assetClass || '').toLowerCase()
  if (assetClass === 'nse-stocks') return 'Africa'
  if (assetClass === 'mmf' || assetClass === 'real-estate') return 'Africa'
  if (isEtfHolding(h)) return 'USA'
  if (tag.includes('nse') || tag.includes('kenya')) return 'Africa'
  if (tag.includes('nasdaq') || tag.includes('nyse') || tag.includes('amex') || tag.includes('us')) return 'USA'
  if (tag.includes('lse') || tag.includes('euronext') || tag.includes('europe')) return 'Europe'
  if (tag.includes('jse') || tag.includes('africa')) return 'Africa'
  if ((h.currency || '').toUpperCase() === 'KES') return 'Africa'
  return 'Unclassified'
}

function inferExchangeFromHolding(h: StackHolding): string {
  // Prefer human platform_name (Euronext Amsterdam) over MIC link (XAMS).
  const named = (h.exchangePlatformName || '').trim()
  if (named) return named

  // exchange_platform is a curated Growe Exchange Platform link (MIC / code).
  const explicit = (h.exchangePlatform || '').trim()
  if (explicit) {
    const lower = explicit.toLowerCase()
    if (lower !== 'global' && lower !== 'kenya' && lower !== 'both') {
      return displayExchangeLabel(explicit, h.exchangePlatformName)
    }
  }
  const tag = (h.marketTag || '').trim()
  if (tag && !isInternalMarketRoutingLabel(tag)) return displayExchangeLabel(tag)
  return 'Unclassified'
}


function sectorLabel(h: StackHolding): string {
  const sector = (h.sector || '').trim()
  return sector || 'Unclassified'
}

function industryLabel(h: StackHolding): string {
  const industry = (h.industry || '').trim()
  return industry || 'Unclassified'
}

/** Growe Asset Category label with fallbacks from holding / legacy asset class. */
export function assetCategoryLabelForHolding(h: StackHolding): string {
  const fromHolding = normalizeAssetCategoryLabel(h.holdingAssetCategory || h.assetCategory || '')
  if (fromHolding) return fromHolding
  if (h.assetClass === 'mmf') return 'Money Market Fund'
  if (h.assetClass === 'real-estate') return 'Private Company/Other'
  if (h.assetClass === 'etf') return 'ETF'
  if (h.assetClass === 'nse-stocks' || h.assetClass === 'global-stocks') return 'Stock'
  return 'Other'
}

export function bucketLabelForHolding(h: StackHolding, mode: StackGroupingMode): string {
  if (mode === 'region') return inferRegionFromHolding(h)
  if (mode === 'exchange') return inferExchangeFromHolding(h)
  if (mode === 'sector') return sectorLabel(h)
  if (mode === 'industry') return industryLabel(h)
  if (mode === 'assetCategory') return assetCategoryLabelForHolding(h)
  return ''
}

export function bucketLabelForTickerGroup(group: StackTickerGroup, mode: StackGroupingMode): string {
  const first = group.holdings[0]
  if (!first) return 'Other'
  return bucketLabelForHolding(first, mode)
}

export function groupingListTitle(mode: StackGroupingMode): string {
  if (mode === 'region') return 'region'
  if (mode === 'exchange') return 'exchange'
  if (mode === 'sector') return 'sector'
  if (mode === 'industry') return 'industry'
  if (mode === 'assetCategory') return 'asset category'
  if (mode === 'ticker') return 'category'
  return ''
}

export function groupingBucketColumnLabel(mode: StackGroupingMode): string {
  if (mode === 'region') return 'Region'
  if (mode === 'exchange') return 'Exchange'
  if (mode === 'sector') return 'Sector'
  if (mode === 'industry') return 'Industry'
  if (mode === 'assetCategory') return 'Asset Category'
  return ''
}

export function groupingBackLabel(mode: StackGroupingMode): string {
  if (mode === 'region') return 'regions'
  if (mode === 'exchange') return 'exchanges'
  if (mode === 'sector') return 'sectors'
  if (mode === 'industry') return 'industries'
  if (mode === 'assetCategory') return 'asset categories'
  return ''
}

/** Region drill-down inserts a country tier before tickers. */
export function regionGroupingUsesCountryTier(mode: StackGroupingMode): boolean {
  return mode === 'region'
}

export function countryLabelForHolding(h: StackHolding): string {
  const explicit = (h.country || '').trim()
  if (explicit) return explicit
  const tag = (h.marketTag || '').toLowerCase()
  const assetClass = (h.assetClass || '').toLowerCase()
  if (assetClass === 'nse-stocks' || tag.includes('nse') || tag.includes('kenya')) return 'Kenya'
  if ((h.currency || '').toUpperCase() === 'KES') return 'Kenya'
  return 'Unknown'
}

export interface StackCountrySummary {
  country: string
  tickerCount: number
  lotCount: number
  totalQuantity: number
  totalValueInKES: number
  totalCostInKES: number
  totalInitialInvestmentNative: number
  deltaKES: number
  gainPercent: number
  weightedAvgBuyNative: number
  weightedCurrentNative: number
  currency: string
  /** @deprecated use totalValueInKES */
  totalValue: number
}

export function summarizeHoldingsByCountry(holdings: StackHolding[]): StackCountrySummary[] {
  const map = new Map<string, StackHolding[]>()
  for (const h of holdings) {
    const country = countryLabelForHolding(h)
    const list = map.get(country) ?? []
    list.push(h)
    map.set(country, list)
  }

  return [...map.entries()]
    .map(([country, lots]) => {
      const tickerGroups = groupHoldingsByTicker(lots)
      const summary = summarizeHoldingsMetrics(lots)
      return {
        country,
        tickerCount: tickerGroups.length,
        lotCount: lots.length,
        totalQuantity: summary.totalQuantity,
        totalValueInKES: summary.totalValueInKES,
        totalCostInKES: summary.totalCostInKES,
        totalInitialInvestmentNative: summary.totalInitialInvestmentNative,
        deltaKES: summary.deltaKES,
        gainPercent: summary.gainPercent,
        weightedAvgBuyNative: summary.weightedAvgBuyNative,
        weightedCurrentNative: summary.weightedCurrentNative,
        currency: summary.currency,
        totalValue: summary.totalValueInKES,
      }
    })
    .sort((a, b) => a.country.localeCompare(b.country))
}

export function filterHoldingsByCountry(holdings: StackHolding[], country: string): StackHolding[] {
  return holdings.filter((h) => countryLabelForHolding(h) === country)
}

export function metricsFromCountrySummary(c: StackCountrySummary): HoldingsSummaryMetrics {
  return {
    totalQuantity: c.totalQuantity,
    totalValueInKES: c.totalValueInKES,
    totalCostInKES: c.totalCostInKES,
    totalInitialInvestmentNative: c.totalInitialInvestmentNative,
    deltaKES: c.deltaKES,
    gainPercent: c.gainPercent,
    weightedAvgBuyNative: c.weightedAvgBuyNative,
    weightedCurrentNative: c.weightedCurrentNative,
    currency: c.currency,
  }
}

/** Exchange/region = non-ETF holdings. Sector/industry/asset category = all holdings. */
export function holdingMatchesGroupingMode(h: StackHolding, mode: StackGroupingMode): boolean {
  if (mode === 'exchange' || mode === 'region') return !isEtfHolding(h)
  if (mode === 'sector' || mode === 'industry' || mode === 'assetCategory') return true
  return true
}
