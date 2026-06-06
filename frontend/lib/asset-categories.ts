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
