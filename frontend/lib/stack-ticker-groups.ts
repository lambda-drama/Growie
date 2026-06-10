import type { HoldingsSummaryMetrics } from '@/lib/stack-holdings-summary'
import { summarizeHoldingsMetrics } from '@/lib/stack-holdings-summary'
import type { StackHolding } from '@/services/stack'

export interface StackTickerGroup {
  key: string
  ticker: string
  displayName: string
  marketTag: string
  currency: string
  holdings: StackHolding[]
  lotCount: number
  totalQuantity: number
  totalValueInKES: number
  totalCostInKES: number
  totalInitialInvestmentNative: number
  deltaKES: number
  gainPercent: number
  weightedAvgBuyNative: number
  weightedCurrentNative: number
}

function groupKey(h: StackHolding): string {
  const ticker = (h.ticker || h.name || h.id).trim().toUpperCase()
  const ccy = (h.currency || 'USD').toUpperCase()
  return `${ticker}|${ccy}`
}

export function metricsFromTickerGroup(group: StackTickerGroup): HoldingsSummaryMetrics {
  return {
    totalQuantity: group.totalQuantity,
    totalValueInKES: group.totalValueInKES,
    totalCostInKES: group.totalCostInKES,
    deltaKES: group.deltaKES,
    gainPercent: group.gainPercent,
    weightedAvgBuyNative: group.weightedAvgBuyNative,
    weightedCurrentNative: group.weightedCurrentNative,
    totalInitialInvestmentNative: group.totalInitialInvestmentNative,
    currency: (group.currency || 'USD').toUpperCase(),
  }
}

/** Tier 2: combine open holdings in a class by ticker (+ currency). */
export function groupHoldingsByTicker(holdings: StackHolding[]): StackTickerGroup[] {
  const map = new Map<string, StackHolding[]>()
  for (const h of holdings) {
    const key = groupKey(h)
    const list = map.get(key) ?? []
    list.push(h)
    map.set(key, list)
  }

  const groups: StackTickerGroup[] = []
  for (const [key, lots] of map) {
    const sorted = [...lots].sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''))
    const first = sorted[0]
    let totalValueInKES = 0
    let totalCostInKES = 0
    let totalQuantity = 0
    for (const h of sorted) {
      totalValueInKES += h.valueInKES ?? h.valueKES ?? 0
      totalCostInKES += h.costAtAvgKES ?? h.costBasisKES ?? 0
      totalQuantity += h.quantity ?? 0
    }
    const summary = summarizeHoldingsMetrics(sorted)

    groups.push({
      key,
      ticker: first.ticker || first.name,
      displayName: first.name,
      marketTag: first.marketTag || '',
      currency: first.currency || 'USD',
      holdings: sorted,
      lotCount: sorted.length,
      totalQuantity: summary.totalQuantity,
      totalValueInKES: summary.totalValueInKES,
      totalCostInKES: summary.totalCostInKES,
      totalInitialInvestmentNative: summary.totalInitialInvestmentNative,
      deltaKES: summary.deltaKES,
      gainPercent: summary.gainPercent,
      weightedAvgBuyNative: summary.weightedAvgBuyNative,
      weightedCurrentNative: summary.weightedCurrentNative,
    })
  }

  groups.sort((a, b) => a.ticker.localeCompare(b.ticker))
  return groups
}
