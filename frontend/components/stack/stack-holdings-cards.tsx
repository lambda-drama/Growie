'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatCurrencyNative, formatPercentage } from '@/lib/format'
import type { StackHolding } from '@/services/stack'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'

interface StackHoldingsCardsProps {
  holdings: StackHolding[]
  currency: string
  kesToDisplayMultiplier: number
  onOpenPosition: (id: string) => void
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
}

/** Mobile-friendly holding rows (table used from md+). */
export function StackHoldingsCards({
  holdings,
  currency,
  kesToDisplayMultiplier,
  onOpenPosition,
  onBuy,
  onSell,
}: StackHoldingsCardsProps) {
  if (holdings.length === 0) {
    return (
      <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground md:hidden">
        No positions in this class yet.
      </p>
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
                      {formatCurrency(h.valueKES, currency as 'KES', {
                        kesToDisplayMultiplier,
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
                      {formatCurrencyNative(h.avgBuyPrice, (h.currency || 'USD') as 'USD', {
                        compact: true,
                      })}
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
