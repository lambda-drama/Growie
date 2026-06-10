import { effectiveAvgBuyNative } from '@/lib/format'
import type { StackHolding } from '@/services/stack'

export interface HoldingsSummaryMetrics {
  totalQuantity: number
  totalValueInKES: number
  totalCostInKES: number
  deltaKES: number
  gainPercent: number
  weightedAvgBuyNative: number
  weightedCurrentNative: number
  totalInitialInvestmentNative: number
  /** Set when all lots share one currency; empty when mixed. */
  currency: string
}

export function summarizeHoldingsMetrics(holdings: StackHolding[]): HoldingsSummaryMetrics {
  let totalQuantity = 0
  let totalValueInKES = 0
  let totalCostInKES = 0
  let totalInitialNative = 0
  let weightedCurrentSum = 0
  const currencies = new Set<string>()

  for (const h of holdings) {
    const q = h.quantity ?? 0
    if (q <= 0) continue
    totalQuantity += q
    totalValueInKES += h.valueInKES ?? h.valueKES ?? 0
    totalCostInKES += h.costAtAvgKES ?? h.costBasisKES ?? 0
    const avg = effectiveAvgBuyNative(h)
    totalInitialNative += avg * q
    weightedCurrentSum += (h.currentPrice ?? 0) * q
    currencies.add((h.currency || 'USD').toUpperCase())
  }

  const deltaKES = totalValueInKES - totalCostInKES
  const gainPercent = totalCostInKES > 0 ? (deltaKES / totalCostInKES) * 100 : 0

  return {
    totalQuantity,
    totalValueInKES,
    totalCostInKES,
    deltaKES,
    gainPercent,
    weightedAvgBuyNative: totalQuantity > 0 ? totalInitialNative / totalQuantity : 0,
    weightedCurrentNative: totalQuantity > 0 ? weightedCurrentSum / totalQuantity : 0,
    totalInitialInvestmentNative: totalInitialNative,
    currency: currencies.size === 1 ? [...currencies][0] : '',
  }
}
