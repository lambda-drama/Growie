import { effectiveAvgBuyNative, holdingPositionValueNative, nativeAmountToKes } from '@/lib/format'
import type { Holding } from '@/types'
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

/** Per-line initial investment in the holding's native currency. */
export function holdingInitialInvestmentNative(holding: Holding): number {
  const init = holding.initialInvestmentValue
  if (init != null && init > 0) return init
  const q = holding.quantity ?? 0
  if (q > 0) return effectiveAvgBuyNative(holding) * q
  return holding.costBasisKES ?? holding.costAtAvgKES ?? 0
}

/** Per-line current value in the holding's native currency. */
export function holdingCurrentValueNative(holding: Holding): number {
  const fromNative = holdingPositionValueNative(holding)
  if (fromNative > 0) return fromNative
  return holding.currentValue ?? holding.valueNative ?? holding.valueKES ?? 0
}

/**
 * Weighted portfolio return for a set of holdings.
 * Return % = (Σ current − Σ initial) / Σ initial × 100 — never average line-level %.
 */
export function computeWeightedPortfolioReturn(
  holdings: Holding[],
  kesPerUsd = 0
): Pick<HoldingsSummaryMetrics, 'totalValueInKES' | 'totalCostInKES' | 'deltaKES' | 'gainPercent'> {
  const lines: {
    ccy: string
    initial: number
    current: number
    valKes: number
    costKesFallback: number
  }[] = []

  for (const h of holdings) {
    const initial = holdingInitialInvestmentNative(h)
    const current = holdingCurrentValueNative(h)
    if (initial <= 0 && current <= 0) continue
    lines.push({
      ccy: (h.currency || 'USD').toUpperCase(),
      initial,
      current,
      valKes: h.valueInKES ?? h.valueKES ?? 0,
      costKesFallback: h.costAtAvgKES ?? h.costBasisKES ?? 0,
    })
  }

  if (!lines.length) {
    return { totalValueInKES: 0, totalCostInKES: 0, deltaKES: 0, gainPercent: 0 }
  }

  const currencies = new Set(lines.map((l) => l.ccy))
  const totalValueInKES = lines.reduce(
    (s, l) => s + (l.valKes > 0 ? l.valKes : nativeAmountToKes(l.current, l.ccy, kesPerUsd)),
    0
  )

  // Single non-KES currency (e.g. all USD): return in native terms — matches spreadsheet math.
  if (currencies.size === 1) {
    const only = [...currencies][0]
    if (only !== 'KES') {
      const totalInitialNative = lines.reduce((s, l) => s + l.initial, 0)
      const totalCurrentNative = lines.reduce((s, l) => s + l.current, 0)
      const deltaNative = totalCurrentNative - totalInitialNative
      return {
        totalValueInKES,
        totalCostInKES: totalInitialNative,
        deltaKES: deltaNative,
        gainPercent:
          totalInitialNative > 0 ? (deltaNative / totalInitialNative) * 100 : 0,
      }
    }
  }

  let totalInitialKES = 0
  let totalCurrentKES = 0
  for (const l of lines) {
    const initKes = nativeAmountToKes(l.initial, l.ccy, kesPerUsd)
    const currKes = l.valKes > 0 ? l.valKes : nativeAmountToKes(l.current, l.ccy, kesPerUsd)
    totalInitialKES += initKes > 0 ? initKes : l.costKesFallback
    totalCurrentKES += currKes
  }

  const deltaKES = totalCurrentKES - totalInitialKES
  return {
    totalValueInKES,
    totalCostInKES: totalInitialKES,
    deltaKES,
    gainPercent: totalInitialKES > 0 ? (deltaKES / totalInitialKES) * 100 : 0,
  }
}

export function summarizeHoldingsMetrics(holdings: StackHolding[]): HoldingsSummaryMetrics {
  let totalQuantity = 0
  let totalInitialNative = 0
  let weightedCurrentSum = 0
  const currencies = new Set<string>()

  for (const h of holdings) {
    const q = h.quantity ?? 0
    const initialNative = holdingInitialInvestmentNative(h)
    const currentNative = holdingCurrentValueNative(h)
    if (q <= 0 && initialNative <= 0 && currentNative <= 0) continue

    if (q > 0) totalQuantity += q
    totalInitialNative += initialNative
    weightedCurrentSum += (h.currentPrice ?? 0) * (q > 0 ? q : 0)
    currencies.add((h.currency || 'USD').toUpperCase())
  }

  const weighted = computeWeightedPortfolioReturn(holdings)

  return {
    totalQuantity,
    totalValueInKES: weighted.totalValueInKES,
    totalCostInKES: weighted.totalCostInKES,
    deltaKES: weighted.deltaKES,
    gainPercent: weighted.gainPercent,
    weightedAvgBuyNative: totalQuantity > 0 ? totalInitialNative / totalQuantity : 0,
    weightedCurrentNative: totalQuantity > 0 ? weightedCurrentSum / totalQuantity : 0,
    totalInitialInvestmentNative: totalInitialNative,
    currency: currencies.size === 1 ? [...currencies][0] : '',
  }
}
