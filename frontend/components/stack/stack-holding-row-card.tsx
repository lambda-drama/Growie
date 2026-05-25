'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  effectiveAvgBuyNative,
  formatDate,
  formatHoldingMoney,
  formatHoldingPositionValue,
  formatPercentage,
} from '@/lib/format'
import type { StackHolding } from '@/services/stack'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'

export interface StackHoldingRowCardProps {
  holding: StackHolding
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
  /** Inside a ticker group (tier 3). */
  nested?: boolean
  /** Tier 3: show lot date instead of repeating the ticker header. */
  lotMode?: boolean
  showTradeButtons?: boolean
}

/** Single holding row — same layout as the original My Stack position cards. */
export function StackHoldingRowCard({
  holding,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  onBuy,
  onSell,
  nested = false,
  lotMode = false,
  showTradeButtons = true,
}: StackHoldingRowCardProps) {
  const positive = (holding.gainPercent ?? 0) >= 0
  const ccy = (holding.currency || 'USD') as 'USD'

  return (
    <div
      className={cn(
        'bg-card p-4 shadow-sm',
        nested ? 'border-t border-border first:border-t-0' : 'rounded-xl border border-border'
      )}
    >
      <div className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {lotMode ? (
                <span className="font-semibold">Lot · {formatDate(holding.dateAdded)}</span>
              ) : (
                <>
                  <span className="font-semibold">{holding.ticker || holding.name}</span>
                  {holding.marketTag ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {holding.marketTag}
                    </Badge>
                  ) : null}
                </>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {lotMode
                ? `${holding.quantity.toLocaleString()} shares · ${holding.name}`
                : holding.name}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold tabular-nums">
              {formatHoldingPositionValue(holding, displayCurrency as 'USD', {
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
              {formatPercentage(holding.gainPercent)}
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Shares</dt>
            <dd className="font-medium tabular-nums">{holding.quantity.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Avg buy</dt>
            <dd className="font-medium tabular-nums">
              {formatHoldingMoney(effectiveAvgBuyNative(holding), ccy, displayCurrency as 'USD', {
                kesToDisplayMultiplier,
                kesPerUsd,
                compact: true,
              })}
            </dd>
          </div>
        </dl>
      </div>
      {showTradeButtons ? (
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn('flex-1', STACK_BUY_BUTTON_CLASS)}
            onClick={() => onBuy(holding)}
          >
            Buy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn('flex-1', STACK_SELL_BUTTON_CLASS)}
            onClick={() => onSell(holding)}
          >
            Sell
          </Button>
        </div>
      ) : null}
    </div>
  )
}
