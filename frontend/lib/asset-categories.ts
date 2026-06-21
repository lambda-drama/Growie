/** Legacy holding.asset_class labels → Growe Asset Category doctype names. */
const LEGACY_TO_CATEGORY: Record<string, string> = {
  Global: 'Stock',
  'Global Stocks': 'Stock',
  'Global Stock': 'Stock',
  'global-stocks': 'Stock',
  NSE: 'Stock',
  'NSE Stocks': 'Stock',
  'NSE Stock': 'Stock',
  'nse-stocks': 'Stock',
  ETF: 'ETF',
  MMF: 'Money Market Fund',
  'Real Estate': 'Private Company/Other',
}

/** Internal market routing values — used for API/DB only, not user-facing labels. */
export function isInternalMarketRoutingLabel(label: string): boolean {
  const raw = (label || '').trim()
  if (!raw) return false
  if (LEGACY_TO_CATEGORY[raw]) return true
  const lower = raw.toLowerCase()
  if (lower === 'nse' || lower === 'global') return true
  if (lower === 'nse-stocks' || lower === 'global-stocks') return true
  if (lower.includes('nse') && lower.includes('stock')) return true
  if (lower.includes('global') && lower.includes('stock')) return true
  return false
}

/** Hide NSE/Global market tags on holding rows; show real exchange names only. */
export function displayMarketTagForUser(tag: string | undefined | null): string | null {
  const trimmed = (tag || '').trim()
  if (!trimmed || isInternalMarketRoutingLabel(trimmed)) return null
  return trimmed
}

/** Exchange bucket label — never surface bare NSE/Global routing. */
export function displayExchangeLabel(exchange: string): string {
  const trimmed = (exchange || '').trim()
  if (!trimmed || isInternalMarketRoutingLabel(trimmed)) return 'Unclassified'
  return trimmed
}

/** Never show NSE/Global routing labels as user-facing asset categories. */
export function normalizeAssetCategoryLabel(label: string): string {
  const raw = (label || '').trim()
  if (!raw) return ''
  if (LEGACY_TO_CATEGORY[raw]) return LEGACY_TO_CATEGORY[raw]
  const lower = raw.toLowerCase()
  if (LEGACY_TO_CATEGORY[lower]) return LEGACY_TO_CATEGORY[lower]
  if (lower.includes('nse') && lower.includes('stock')) return 'Stock'
  if (lower.includes('global') && lower.includes('stock')) return 'Stock'
  if (lower === 'nse' || lower === 'global') return 'Stock'
  return raw
}

/** StackStockPicker still uses legacy AssetClass slugs for create-stock defaults. */
export function categoryToPickerSlug(category: string): 'nse-stocks' | 'global-stocks' | 'etf' {
  if (category === 'ETF') return 'etf'
  return 'global-stocks'
}

/** Default market when creating a new Growe Stock from the + dialog. */
export function categoryDefaultMarket(category: string): 'NSE' | 'Global' | 'ETF' {
  if (category === 'ETF') return 'ETF'
  if (category === 'Stock') return 'Global'
  return 'Global'
}
