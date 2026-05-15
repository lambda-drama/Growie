'use client'

import { useState } from 'react'
import { Download, Eye, FileText, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/lib/store'
import {
  REPORT_CATALOG,
  previewReport,
  downloadReportPdf,
  type ReportType,
} from '@/services/reports'

export function ReportsView() {
  const { isAuthenticated } = useAuth()
  const { setAuthModal } = useAppStore()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [downloading, setDownloading] = useState<ReportType | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-16 text-center">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Sign in to download portfolio and goals reports.</p>
        <Button onClick={() => setAuthModal('login')}>Sign In</Button>
      </div>
    )
  }

  const handlePreview = async (id: ReportType) => {
    setError(null)
    setPreviewLoading(true)
    setPreviewOpen(true)
    setPreviewTitle('')
    setPreviewHtml('')
    try {
      const { title, html } = await previewReport(id)
      setPreviewTitle(title)
      setPreviewHtml(html)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
      setPreviewOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDownload = async (id: ReportType) => {
    setError(null)
    setDownloading(id)
    try {
      await downloadReportPdf(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Reports</h1>
        <p className="mt-1 text-muted-foreground">Download your portfolio or dashboard reports.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        {REPORT_CATALOG.map((report) => (
          <Card key={report.id} className="shadow-sm">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {report.title.split(' ')[0]}
                </p>
                <h2 className="mt-0.5 text-base font-semibold text-foreground">{report.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handlePreview(report.id)}
                  disabled={previewLoading}
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-primary text-primary hover:bg-primary/5"
                  onClick={() => handleDownload(report.id)}
                  disabled={downloading === report.id}
                >
                  {downloading === report.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">All reports are downloaded as PDF files.</p>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>{previewTitle || 'Report preview'}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
            {previewLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <iframe
                title={previewTitle}
                srcDoc={previewHtml}
                className="h-[min(70vh,720px)] w-full rounded-lg border bg-white shadow-sm"
                sandbox="allow-same-origin"
              />
            )}
          </div>
          <div className="shrink-0 flex justify-end gap-2 border-t px-6 py-3">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
