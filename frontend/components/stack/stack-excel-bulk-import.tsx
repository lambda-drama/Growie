'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Loader2, Sheet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { importHoldingsFromExcel } from '@/services/portfolio'
import { cn } from '@/lib/utils'

interface StackExcelBulkImportProps {
  onSuccess: () => void | Promise<void>
  /** Outline button next to Add position; `compact` for icon-first toolbar. */
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [running, setRunning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      toast.error('Invalid file', {
        description: 'Please choose an Excel file (.xlsx or .xls).',
      })
      return
    }
    setPendingFile(file)
    setConfirmOpen(true)
  }

  const handleCancel = () => {
    setConfirmOpen(false)
    setPendingFile(null)
  }

  const formatSuccessMessage = (result: Awaited<ReturnType<typeof importHoldingsFromExcel>>) => {
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

  const handleStart = async () => {
    const file = pendingFile
    if (!file) return
    setConfirmOpen(false)
    setPendingFile(null)
    setRunning(true)
    const toastId = toast.loading('Uploading file and importing positions…')
    try {
      const result = await importHoldingsFromExcel(file)
      toast.success(formatSuccessMessage(result), { id: toastId })
      // Reload lists only — do not await live price refresh (keeps toast from hanging).
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

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handlePick}
      />

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) handleCancel() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk import from Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Ready to import{' '}
              <span className="font-medium text-foreground">{pendingFile?.name ?? 'your file'}</span>.
              Uses the Scope / global stocks layout (active positions and sold rows).
            </p>
            <p>
              New tickers create <strong className="font-medium text-foreground">Growe Stock</strong>{' '}
              records. Values are stored in USD.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={running}>
              Cancel
            </Button>
            <Button type="button" onClick={handleStart} disabled={running || !pendingFile}>
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : (
                'Start import'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          variant === 'compact' ? 'gap-1.5' : 'gap-2',
          className,
        )}
        disabled={disabled || running}
        onClick={() => inputRef.current?.click()}
        title="Scope-style global stocks template (.xlsx)"
      >
        <Sheet className="h-4 w-4" />
        <span className={variant === 'compact' ? 'hidden sm:inline' : undefined}>Bulk upload</span>
      </Button>
    </>
  )
}
