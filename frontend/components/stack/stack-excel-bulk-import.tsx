'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Download, FileSpreadsheet, Link2, Loader2, Sheet, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  importHoldingsFromCsv,
  importHoldingsFromExcel,
  importHoldingsFromSpreadsheet,
  type HoldingsBulkImportResult,
} from '@/services/portfolio'
import {
  downloadHoldingsBulkTemplate,
  HOLDINGS_BULK_TEMPLATE_EXAMPLE_ROW_NOTE,
} from '@/lib/holdings-bulk-template'
import { cn } from '@/lib/utils'

type ImportMethod = 'excel' | 'csv' | 'spreadsheet'
type DialogStep = 'template-offer' | 'choose' | 'spreadsheet-url' | 'confirm'

interface StackExcelBulkImportProps {
  onSuccess: () => void | Promise<void>
  variant?: 'default' | 'compact'
  className?: string
  disabled?: boolean
}

export function StackExcelBulkImport({
  onSuccess,
  variant = 'default',
  className,
  disabled = false,
}: StackExcelBulkImportProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<DialogStep>('choose')
  const [method, setMethod] = useState<ImportMethod | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [running, setRunning] = useState(false)
  const excelInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep('template-offer')
    setMethod(null)
    setPendingFile(null)
    setSheetUrl('')
  }

  const handleDownloadTemplate = () => {
    downloadHoldingsBulkTemplate()
    toast.success('Template download started', {
      description: HOLDINGS_BULK_TEMPLATE_EXAMPLE_ROW_NOTE,
      duration: 8000,
    })
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const openChooser = () => {
    if (running || disabled) return
    reset()
    setOpen(true)
  }

  const pickExcel = () => {
    excelInputRef.current?.click()
  }

  const pickCsv = () => {
    csvInputRef.current?.click()
  }

  const pickSpreadsheet = () => {
    setMethod('spreadsheet')
    setStep('spreadsheet-url')
  }

  const handleExcelPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      toast.error('Invalid file', { description: 'Choose an Excel file (.xlsx or .xls).' })
      return
    }
    setMethod('excel')
    setPendingFile(file)
    setStep('confirm')
  }

  const handleCsvPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.csv')) {
      toast.error('Invalid file', { description: 'Choose a CSV file (.csv).' })
      return
    }
    setMethod('csv')
    setPendingFile(file)
    setStep('confirm')
  }

  const formatSuccessMessage = (result: HoldingsBulkImportResult) => {
    const errs = (result.errors || []).filter(Boolean)
    const lines = [
      `Created ${result.created} position(s).`,
      `Sheet: ${result.active_rows ?? '—'} active row(s), ${result.sold_rows ?? '—'} sold row(s).`,
    ]
    if (errs.length) {
      lines.push(`Some rows were skipped: ${errs.slice(0, 5).join(' · ')}`)
    }
    return lines.join(' ')
  }

  const runImport = async () => {
    setRunning(true)
    const toastId = toast.loading('Importing positions…')
    try {
      let result: HoldingsBulkImportResult
      if (method === 'excel' && pendingFile) {
        result = await importHoldingsFromExcel(pendingFile)
      } else if (method === 'csv' && pendingFile) {
        result = await importHoldingsFromCsv(pendingFile)
      } else if (method === 'spreadsheet' && sheetUrl.trim()) {
        result = await importHoldingsFromSpreadsheet(sheetUrl.trim())
      } else {
        throw new Error('Nothing to import. Choose a file or paste a spreadsheet link.')
      }
      toast.success(formatSuccessMessage(result), { id: toastId })
      setOpen(false)
      reset()
      void Promise.resolve(onSuccess()).catch(() => {
        toast.error('Import succeeded but the list could not be refreshed. Try Refresh.')
      })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Import failed. Check your connection and try again.',
        { id: toastId },
      )
    } finally {
      setRunning(false)
    }
  }

  const methodLabel =
    method === 'excel' ? 'Excel' : method === 'csv' ? 'CSV' : method === 'spreadsheet' ? 'Google Sheets' : ''

  return (
    <>
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handleExcelPick}
      />
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvPick}
      />

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          {step === 'template-offer' && (
            <>
              <DialogHeader>
                <DialogTitle>Bulk upload</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Do you need a sample template for global stocks? It matches the Scope layout (active
                positions and sold rows).
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                {HOLDINGS_BULK_TEMPLATE_EXAMPLE_ROW_NOTE}
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <Button type="button" className="gap-2" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4" />
                  Download sample template (.xlsx)
                </Button>
                <Button type="button" variant="outline" onClick={() => setStep('choose')}>
                  I have my file — continue to upload
                </Button>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'choose' && (
            <>
              <DialogHeader>
                <DialogTitle>How do you want to upload?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Import Scope / global stocks template (active and sold sections). Same column layout for
                all options.
              </p>
              <button
                type="button"
                className="text-left text-sm text-primary underline-offset-4 hover:underline"
                onClick={handleDownloadTemplate}
              >
                Download sample template (.xlsx)
              </button>
              <div className="grid gap-2 py-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto justify-start gap-3 px-4 py-3"
                  onClick={pickExcel}
                >
                  <Sheet className="h-5 w-5 shrink-0 text-green-600" />
                  <span className="text-left">
                    <span className="block font-medium">Excel file</span>
                    <span className="block text-xs text-muted-foreground">.xlsx or .xls</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto justify-start gap-3 px-4 py-3"
                  onClick={pickCsv}
                >
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-blue-600" />
                  <span className="text-left">
                    <span className="block font-medium">CSV file</span>
                    <span className="block text-xs text-muted-foreground">.csv (UTF-8)</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto justify-start gap-3 px-4 py-3"
                  onClick={pickSpreadsheet}
                >
                  <Link2 className="h-5 w-5 shrink-0 text-orange-600" />
                  <span className="text-left">
                    <span className="block font-medium">Spreadsheet link</span>
                    <span className="block text-xs text-muted-foreground">Public Google Sheets URL</span>
                  </span>
                </Button>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setStep('template-offer')}>
                  Back
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'spreadsheet-url' && (
            <>
              <DialogHeader>
                <DialogTitle>Spreadsheet link</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Paste a Google Sheets link. The sheet must be shared so{' '}
                  <strong className="font-medium text-foreground">anyone with the link can view</strong>{' '}
                  it.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="bulk-sheet-url">Google Sheets URL</Label>
                  <Input
                    id="bulk-sheet-url"
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    disabled={running}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStep('choose')
                    setSheetUrl('')
                  }}
                  disabled={running}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={running || !sheetUrl.trim()}
                  onClick={() => setStep('confirm')}
                >
                  Continue
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'confirm' && (
            <>
              <DialogHeader>
                <DialogTitle>Confirm import</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Import via <span className="font-medium text-foreground">{methodLabel}</span>
                  {pendingFile ? (
                    <>
                      : <span className="font-medium text-foreground">{pendingFile.name}</span>
                    </>
                  ) : sheetUrl.trim() ? (
                    <>
                      {' '}
                      from your linked spreadsheet.
                    </>
                  ) : null}
                </p>
                <p>Uses the Scope / global stocks layout. New tickers create Growe Stock records (USD).</p>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (method === 'spreadsheet') {
                      setStep('spreadsheet-url')
                    } else {
                      setStep('choose')
                      setPendingFile(null)
                    }
                  }}
                  disabled={running}
                >
                  Back
                </Button>
                <Button type="button" onClick={runImport} disabled={running}>
                  {running ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Working…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Start import
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(variant === 'compact' ? 'gap-1.5' : 'gap-2', className)}
        disabled={disabled || running}
        onClick={openChooser}
        title="Bulk upload — Excel, CSV, or Google Sheets"
      >
        <Sheet className="h-4 w-4" />
        <span className={variant === 'compact' ? 'hidden sm:inline' : undefined}>Bulk upload</span>
      </Button>
    </>
  )
}
