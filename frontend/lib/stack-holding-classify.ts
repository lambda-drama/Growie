import type { Holding } from '@/types'

/** ETF is an asset class (Growe Stock market = ETF), not a sector. */
export function isEtfHolding(h: Pick<Holding, 'assetClass'>): boolean {
  return h.assetClass === 'etf'
}

export function isEquityHolding(h: Pick<Holding, 'assetClass'>): boolean {
  return (
    h.assetClass === 'nse-stocks' ||
    h.assetClass === 'global-stocks' ||
    h.assetClass === 'etf'
  )
}

export function holdingValueKES(h: Holding): number {
  return h.valueInKES ?? h.valueKES ?? 0
}

export function normalizeBrokerLabel(broker?: string | null): string {
  const b = (broker || '').trim()
  return b || 'Unassigned broker'
}
