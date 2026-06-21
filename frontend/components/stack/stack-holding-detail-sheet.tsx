'use client'

import { useEffect, useState } from 'react'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useStackPosition } from '@/hooks/use-stack'
import { useDisplayMoney } from '@/lib/store'
import {
  effectiveAvgBuyNative,
  formatDate,
  formatHoldingMoney,
  formatHoldingPositionValue,
  formatPercentage,
} from '@/lib/format'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'
import type { StackHolding } from '@/services/stack'
import { displayMarketTagForUser } from '@/lib/asset-categories'

interface StackHoldingDetailSheetProps {
  holding: StackHolding | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onBuy: (holding: StackHolding) => void
  onSell: (holding: StackHolding) => void
  onEdit: (holding: StackHolding) => void
  onDeleted: () => void
}

export function StackHoldingDetailSheet({
  holding: holdingProp,
  open,
  onOpenChange,
  onBuy,
  onSell,
  onEdit,
  onDeleted,
}: StackHoldingDetailSheetProps) {
  const holdingId = open && holdingProp ? holdingProp.id : null
  const { detail, isLoading, refresh } = useStackPosition(holdingId)
  const { currency, kesToDisplayMultiplier, kesPerUsd } = useDisplayMoney()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const holding = detail?.holding ?? holdingProp
  const ccy = (holding?.currency || 'USD') as 'USD'
  const positive = (holding?.gainPercent ?? 0) >= 0

  useEffect(() => {
    if (open && holdingId) void refresh()
  }, [open, holdingId, refresh])

  useEffect(() => {
    if (!open) setConfirmDelete(false)
  }, [open])

  const handleDelete = async () => {
    if (!holding) return
    setDeleting(true)
    try {
      await deleteHolding(holding.id)
      toast.success('Position removed')
      setConfirmDelete(false)
      onOpenChange(false)
      onDeleted()
    } catch (e) {
      toast.error('Could not delete position', {
        description: e instanceof Error ? e.message : 'Request failed',
      })
    } finally {
      setDeleting(false)
    }
  }

  const marketBadge = displayMarketTagForUser(holding?.marketTag)

  const title = holding
    ? holding.ticker
      ? `${holding.ticker}${marketBadge ? ` · ${marketBadge}` : ''}`
      : holding.name
    : 'Position'

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription className="line-clamp-2">
              {holding?.name && holding.ticker ? holding.name : null}
              {holding?.dateAdded ? (
                <span className="block text-muted-foreground">
                  Lot added {formatDate(holding.dateAdded)}
                </span>
              ) : null}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4">
            {isLoading && !holding ? (
              <div className="space-y-3 py-4">
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            ) : holding ? (
              <div className="space-y-4 pb-4">
                {marketBadge && !holding.ticker ? (
                  <Badge variant="secondary">{marketBadge}</Badge>
                ) : null}
                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">Current value</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatHoldingPositionValue(holding, currency as 'USD', {
                      kesToDisplayMultiplier,
                      kesPerUsd,
                    })}
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-sm font-medium tabular-nums',
                      positive
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {formatPercentage(holding.gainPercent)}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Shares</dt>
                    <dd className="font-medium tabular-nums">
                      {holding.quantity.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Avg buy</dt>
                    <dd className="font-medium tabular-nums">
                      {formatHoldingMoney(effectiveAvgBuyNative(holding), ccy, currency as 'USD', {
                        kesToDisplayMultiplier,
                        kesPerUsd,
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Current price</dt>
                    <dd className="font-medium tabular-nums">
                      {formatHoldingMoney(holding.currentPrice, ccy, currency as 'USD', {
                        kesToDisplayMultiplier,
                        kesPerUsd,
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cost basis</dt>
                    <dd className="font-medium tabular-nums">
                      {formatHoldingMoney(effectiveAvgBuyNative(holding), ccy, currency as 'USD', {
                        kesToDisplayMultiplier,
                        kesPerUsd,
                      })}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Position not found.</p>
            )}
          </div>

          <SheetFooter className="border-t pt-4">
            <div className="flex w-full flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className={cn('flex-1', STACK_BUY_BUTTON_CLASS)}
                  disabled={!holding}
                  onClick={() => holding && onBuy(holding)}
                >
                  Buy
                </Button>
                <Button
                  variant="outline"
                  className={cn('flex-1', STACK_SELL_BUTTON_CLASS)}
                  disabled={!holding}
                  onClick={() => holding && onSell(holding)}
                >
                  Sell
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={!holding}
                  onClick={() => holding && onEdit(holding)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={!holding || deleting}
                  onClick={() => setConfirmDelete(true)}
                >
                  {deleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this position?</AlertDialogTitle>
            <AlertDialogDescription>
              {holding ? (
                <>
                  This removes the entire lot ({holding.quantity.toLocaleString()} shares of{' '}
                  {holding.ticker || holding.name}) and all its trade history. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
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
