import type { Holding } from '@/types'

export type InstrumentType = 'stock' | 'etf'

/** ETF from Growe Stock instrument_type (preferred) or holding asset class. */
export function isEtfHolding(
  h: Pick<Holding, 'assetClass' | 'instrumentType'>
): boolean {
  if (h.instrumentType === 'etf') return true
  if (h.instrumentType === 'stock') return false
  return h.assetClass === 'etf'
}

export function isStockHolding(
  h: Pick<Holding, 'assetClass' | 'instrumentType'>
): boolean {
  if (h.instrumentType === 'stock') return true
  if (h.instrumentType === 'etf') return false
  return h.assetClass === 'nse-stocks' || h.assetClass === 'global-stocks'
}

export function isEquityHolding(h: Pick<Holding, 'assetClass' | 'instrumentType'>): boolean {
  return isStockHolding(h) || isEtfHolding(h)
}

export function holdingValueKES(h: Holding): number {
  return h.valueInKES ?? h.valueKES ?? 0
}

export function normalizeBrokerLabel(broker?: string | null): string {
  const b = (broker || '').trim()
  return b || 'Unassigned broker'
}
