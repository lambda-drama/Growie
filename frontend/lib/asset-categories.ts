/** Legacy holding.asset_class labels → Growe Asset Category doctype names. */
const LEGACY_TO_CATEGORY: Record<string, string> = {
  Global: 'Stock',
  'Global Stocks': 'Stock',
  NSE: 'Stock',
  'NSE Stocks': 'Stock',
  ETF: 'ETF',
  MMF: 'Money Market Fund',
  'Real Estate': 'Private Company/Other',
}

/** Normalize stored labels to Growe Asset Category names (never show NSE/Global as categories). */
export function normalizeAssetCategoryLabel(label: string): string {
  const raw = (label || '').trim()
  if (!raw) return ''
  return LEGACY_TO_CATEGORY[raw] ?? raw
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
