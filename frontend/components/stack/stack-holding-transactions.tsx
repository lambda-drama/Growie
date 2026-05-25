'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Loader2, MoreVertical, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatHoldingMoney } from '@/lib/format'
import { stackTradeBadgeClass } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'
import {
  deleteHoldingTransaction,
  getStackPosition,
  type HoldingTransaction,
  type StackHolding,
} from '@/services/stack'

function formatTxDate(value: string) {
  if (!value) return '—'
  try {
    const d = parseISO(value.includes('T') ? value : `${value}T00:00:00`)
    if (!Number.isNaN(d.getTime())) return format(d, 'd MMM yyyy')
  } catch {
    /**/
  }
  return value
}

interface StackHoldingTransactionsProps {
  holdingId: string
  refreshKey?: number
  compact?: boolean
  onHoldingUpdated?: (holding: StackHolding | null, fullyRemoved: boolean) => void
}

function TransactionActionsMenu({
  tx,
  deleting,
  onDelete,
}: {
  tx: HoldingTransaction
  deleting: boolean
  onDelete: (tx: HoldingTransaction) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={deleting}
          aria-label={`Actions for ${tx.type} on ${formatTxDate(tx.transactionDate)}`}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDelete(tx)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StackHoldingTransactions({
  holdingId,
  refreshKey = 0,
  compact = false,
  onHoldingUpdated,
}: StackHoldingTransactionsProps) {
  const { currency, kesToDisplayMultiplier, kesPerUsd } = useDisplayMoney()
  const [transactions, setTransactions] = useState<HoldingTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmTx, setConfirmTx] = useState<HoldingTransaction | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const detail = await getStackPosition(holdingId)
      setTransactions(detail.transactions ?? [])
    } catch (e) {
      toast.error('Could not load transactions', {
        description: e instanceof Error ? e.message : 'Request failed',
      })
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }, [holdingId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const handleConfirmDelete = async () => {
    if (!confirmTx) return
    setDeletingId(confirmTx.id)
    try {
      const result = await deleteHoldingTransaction(confirmTx.id)
      toast.success('Transaction deleted')
      setConfirmTx(null)
      await load()
      onHoldingUpdated?.(result.holding, result.fullyRemoved)
    } catch (e) {
      toast.error('Delete failed', {
        description: e instanceof Error ? e.message : 'Request failed',
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className={compact ? 'py-4' : 'py-6'}>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading trades…
        </div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <p
        className={
          compact
            ? 'py-3 text-center text-xs text-muted-foreground'
            : 'py-6 text-center text-sm text-muted-foreground'
        }
      >
        No buy/sell trades yet. Use Buy or Sell above to add one.
      </p>
    )
  }

  return (
    <>
      <ul className={cn('divide-y divide-border', compact ? '' : 'rounded-lg border border-border')}>
        {transactions.map((tx) => (
          <li
            key={tx.id}
            className={cn(
              'flex items-center gap-2 bg-card',
              compact ? 'px-2 py-2.5' : 'px-3 py-3'
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={stackTradeBadgeClass(tx.type === 'Buy')}>
                  {tx.type}
                </Badge>
                <span className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
                  {formatTxDate(tx.transactionDate)}
                </span>
              </div>
              <p className={cn('mt-1 tabular-nums text-foreground', compact ? 'text-xs' : 'text-sm')}>
                {tx.quantity.toLocaleString()} shares ·{' '}
                {formatHoldingMoney(tx.unitPrice, (tx.currency || 'USD') as 'USD', currency, {
                  kesToDisplayMultiplier,
                  kesPerUsd,
                  compact: true,
                })}{' '}
                ·{' '}
                <span className="font-medium">
                  {formatCurrency(tx.amountKES, currency, { kesToDisplayMultiplier })}
                </span>
              </p>
            </div>
            <TransactionActionsMenu
              tx={tx}
              deleting={deletingId === tx.id}
              onDelete={setConfirmTx}
            />
          </li>
        ))}
      </ul>

      <AlertDialog open={!!confirmTx} onOpenChange={(open) => !open && setConfirmTx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTx ? (
                <>
                  This will remove the {confirmTx.type.toLowerCase()} of{' '}
                  {confirmTx.quantity.toLocaleString()} shares on{' '}
                  {formatTxDate(confirmTx.transactionDate)} and update your position. This cannot be
                  undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!deletingId}
              onClick={(e) => {
                e.preventDefault()
                void handleConfirmDelete()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
