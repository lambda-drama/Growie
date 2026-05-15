export type ReportType = 'dashboard' | 'portfolio' | 'goals' | 'tax'

export interface ReportMeta {
  id: ReportType
  title: string
  description: string
}

export const REPORT_CATALOG: ReportMeta[] = [
  {
    id: 'dashboard',
    title: 'Overall Dashboard Report',
    description: 'Comprehensive overview of your portfolio, performance, and goals.',
  },
  {
    id: 'portfolio',
    title: 'Portfolio Performance Report',
    description: 'Detailed performance breakdown of your investments.',
  },
  {
    id: 'goals',
    title: 'Goals Report',
    description: 'Summary of your goals and progress.',
  },
  {
    id: 'tax',
    title: 'Tax Summary Report',
    description: 'Summary of gains, income, and tax-related data.',
  },
]

async function getCSRF(): Promise<string> {
  let token = (window as unknown as Record<string, string>).csrf_token
  if (token) return token
  try {
    const r = await fetch('/api/method/frappe.sessions.get_csrf_token', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    const data = await r.json()
    token = data?.message ?? ''
    if (token) (window as unknown as Record<string, string>).csrf_token = token
  } catch {
    token = ''
  }
  return token
}

export async function previewReport(reportType: ReportType): Promise<{ title: string; html: string }> {
  const params = new URLSearchParams({ report_type: reportType })
  const res = await fetch(`/api/method/growie_app.api.reports.preview_report?${params}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (data?.exc) throw new Error('Failed to load preview')
  const m = data.message as { title: string; html: string }
  return { title: m.title, html: m.html }
}

export async function downloadReportPdf(reportType: ReportType): Promise<void> {
  const csrf = await getCSRF()
  const res = await fetch('/api/method/growie_app.api.reports.download_report', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ report_type: reportType }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (err?.exc) throw new Error('PDF download failed')
    throw new Error('PDF download failed')
  }

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition')
  let filename = `growe-${reportType}-report.pdf`
  const match = disposition?.match(/filename="?([^";\n]+)"?/)
  if (match?.[1]) filename = match[1]

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
