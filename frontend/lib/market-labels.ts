/** User-facing Kenya / Global market labels (legacy API value NSE = Kenya). */

export const MARKET_KENYA = 'Kenya' as const
export const MARKET_GLOBAL = 'Global' as const
export const MARKET_ETF = 'ETF' as const

/** Internal/API bucket still uses NSE for Kenya until responses are fully migrated. */
export const LEGACY_MARKET_KENYA = 'NSE' as const

export type MarketFilter = typeof MARKET_KENYA | typeof MARKET_GLOBAL | typeof MARKET_ETF

export const MARKET_FILTER_OPTIONS = [
  { id: 'all' as const, label: 'All Markets' },
  { id: MARKET_KENYA, label: '🇰🇪 Kenya' },
  { id: MARKET_GLOBAL, label: '🌍 Global' },
] as const

/** Map API/stored market to filter tab id. */
export function marketToFilterId(market: string | undefined | null): MarketFilter | null {
  const m = (market || '').trim().toLowerCase()
  if (m === 'kenya' || m === 'nse') return MARKET_KENYA
  if (m === 'global') return MARKET_GLOBAL
  if (m === 'etf') return MARKET_ETF
  return null
}

/** User-facing label for a market routing value. */
export function marketUiLabel(market: string | undefined | null): string {
  const id = marketToFilterId(market)
  if (id) return id
  return (market || '').trim() || MARKET_KENYA
}

/** Value sent to APIs when filtering Kenya-market instruments. */
export function marketApiFilterValue(market: MarketFilter): string {
  return market
}
