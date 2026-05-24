'use client'

import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { effectiveAvgBuyNative, formatHoldingMoney, formatHoldingPositionValue, formatPercentage } from '@/lib/format'
import type { StackHolding } from '@/services/stack'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'

interface StackHoldingsCardsProps {
  holdings: StackHolding[]
  currency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  displayCurrency: string
  onOpenPosition: (id: string) => void
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
  /** Shown under the empty message on mobile (e.g. Bulk + Add position). */
  emptyActions?: ReactNode
  /** Override default empty copy (e.g. no search matches). */
  emptyMessage?: string
}

/** Mobile-friendly holding rows (table used from md+). */
export function StackHoldingsCards({
  holdings,
  currency,
  kesToDisplayMultiplier,
  kesPerUsd,
  displayCurrency,
  onOpenPosition,
  onBuy,
  onSell,
  emptyActions,
  emptyMessage,
}: StackHoldingsCardsProps) {
  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground md:hidden">
        <p>{emptyMessage ?? 'No positions in this class yet.'}</p>
        {emptyActions ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">{emptyActions}</div>
        ) : null}
      </div>
    )
  }

  return (
    <ul className="space-y-3 md:hidden">
      {holdings.map((h) => {
        const positive = h.gainPercent >= 0
        return (
          <li key={h.id}>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <button
                type="button"
                onClick={() => onOpenPosition(h.id)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{h.ticker || h.name}</span>
                      {h.marketTag ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {h.marketTag}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{h.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">
                      {formatHoldingPositionValue(h, displayCurrency as 'USD', {
                        kesToDisplayMultiplier,
                        kesPerUsd,
                        compact: true,
                      })}
                    </p>
                    <p
                      className={cn(
                        'text-xs font-medium tabular-nums',
                        positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {formatPercentage(h.gainPercent)}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Shares</dt>
                    <dd className="font-medium tabular-nums">{h.quantity.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Avg buy</dt>
                    <dd className="font-medium tabular-nums">
                      {formatHoldingMoney(
                        effectiveAvgBuyNative(h),
                        (h.currency || 'USD') as 'USD',
                        displayCurrency as 'USD',
                        { kesToDisplayMultiplier, kesPerUsd, compact: true }
                      )}
                    </dd>
                  </div>
                </dl>
              </button>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('flex-1', STACK_BUY_BUTTON_CLASS)}
                  onClick={() => onBuy(h)}
                >
                  Buy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('flex-1', STACK_SELL_BUTTON_CLASS)}
                  onClick={() => onSell(h)}
                >
                  Sell
                </Button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
