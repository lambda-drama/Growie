/** Scope / global stocks bulk import sample (shipped under growie_app/public/file/). */
export const HOLDINGS_BULK_TEMPLATE_FILENAME = 'Sample Stocks Template.xlsx'

export const HOLDINGS_BULK_TEMPLATE_URL = `/assets/growie_app/file/${encodeURIComponent(HOLDINGS_BULK_TEMPLATE_FILENAME)}`

export const HOLDINGS_BULK_TEMPLATE_EXAMPLE_ROW_NOTE =
  'The first data row in the template is an example only. Delete that row after you add your own holdings, then upload.'

export function downloadHoldingsBulkTemplate(): void {
  const a = document.createElement('a')
  a.href = HOLDINGS_BULK_TEMPLATE_URL
  a.download = HOLDINGS_BULK_TEMPLATE_FILENAME
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
