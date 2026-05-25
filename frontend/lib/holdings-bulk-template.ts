/** Scope / stocks bulk import sample (shipped under growie_app/public/file/). */
export const HOLDINGS_BULK_TEMPLATE_FILENAME = 'Sample Stocks Template with Data.xlsx'

export const HOLDINGS_BULK_TEMPLATE_URL = `/assets/growie_app/file/${encodeURIComponent(HOLDINGS_BULK_TEMPLATE_FILENAME)}`

export const HOLDINGS_BULK_TEMPLATE_EXAMPLE_ROW_NOTE =
  'The template includes example rows for reference. Delete any rows you do not want imported, then upload. Each active row must include a Currency value that matches that row’s amounts (any supported code or symbol, e.g. EUR, GBP, $).'

export function downloadHoldingsBulkTemplate(): void {
  const a = document.createElement('a')
  a.href = HOLDINGS_BULK_TEMPLATE_URL
  a.download = HOLDINGS_BULK_TEMPLATE_FILENAME
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
