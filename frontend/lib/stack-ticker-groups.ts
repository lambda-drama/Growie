import { effectiveAvgBuyNative } from '@/lib/format'
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
  gainPercent: number
  weightedAvgBuyNative: number
}

function groupKey(h: StackHolding): string {
  const ticker = (h.ticker || h.name || h.id).trim().toUpperCase()
  const ccy = (h.currency || 'USD').toUpperCase()
  return `${ticker}|${ccy}`
}

function weightedAvgBuyNative(lots: StackHolding[]): number {
  let cost = 0
  let qty = 0
  for (const h of lots) {
    const q = h.quantity ?? 0
    if (q <= 0) continue
    cost += effectiveAvgBuyNative(h) * q
    qty += q
  }
  return qty > 0 ? cost / qty : 0
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
    const gainPercent =
      totalCostInKES > 0 ? ((totalValueInKES - totalCostInKES) / totalCostInKES) * 100 : 0

    groups.push({
      key,
      ticker: first.ticker || first.name,
      displayName: first.name,
      marketTag: first.marketTag || '',
      currency: first.currency || 'USD',
      holdings: sorted,
      lotCount: sorted.length,
      totalQuantity,
      totalValueInKES,
      totalCostInKES,
      gainPercent,
      weightedAvgBuyNative: weightedAvgBuyNative(sorted),
    })
  }

  groups.sort((a, b) => a.ticker.localeCompare(b.ticker))
  return groups
}
