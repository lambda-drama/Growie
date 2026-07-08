/** Scope / stocks bulk import sample (shipped under growie_app/public/file/). */
export const HOLDINGS_BULK_TEMPLATE_FILENAME = 'Final Web Data Import Template.xlsx'

export const HOLDINGS_BULK_TEMPLATE_URL = `/assets/growie_app/file/${encodeURIComponent(HOLDINGS_BULK_TEMPLATE_FILENAME)}`

export const HOLDINGS_BULK_TEMPLATE_EXAMPLE_ROW_NOTE =
  'Columns: Purchase Dates, Exchange, Ticker #, Broker, Shares Breakdown, Buying Price, Currency, Goal. Delete any example rows you do not want imported, then upload. Each row must include a Currency value that matches that row’s amounts (e.g. USD, EUR, GBP, KES). The Goal column (e.g. Retirement) creates and updates a matching goal for you.'

export function downloadHoldingsBulkTemplate(): void {
  const a = document.createElement('a')
  a.href = HOLDINGS_BULK_TEMPLATE_URL
  a.download = HOLDINGS_BULK_TEMPLATE_FILENAME
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
