'use client'

import { useState } from 'react'
import { Plus, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StackBreadcrumb } from '@/components/stack/stack-breadcrumb'
import { StackSummaryCards } from '@/components/stack/stack-summary-cards'
import { StackHoldingsCards } from '@/components/stack/stack-holdings-cards'
import { TradeDialog, type TradeMode } from '@/components/stack/trade-dialog'
import { useStackClass } from '@/hooks/use-stack'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatCurrencyNative, formatPercentage } from '@/lib/format'
import type { StackHolding } from '@/services/stack'
import type { AssetClass } from '@/types'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'

interface StackClassViewProps {
  assetClass: AssetClass
  onBack: () => void
  onOpenPosition: (holdingId: string) => void
}

export function StackClassView({ assetClass, onBack, onOpenPosition }: StackClassViewProps) {
  const { detail, isLoading, error, refresh } = useStackClass(assetClass)
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const [tradeOpen, setTradeOpen] = useState(false)
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy-new')
  const [activeHolding, setActiveHolding] = useState<StackHolding | null>(null)

  const openTrade = (mode: TradeMode, holding?: StackHolding) => {
    setTradeMode(mode)
    setActiveHolding(holding ?? null)
    setTradeOpen(true)
  }

  const summary = detail?.summary

  return (
    <div className="space-y-6">
      <StackBreadcrumb assetClass={assetClass} onOverview={onBack} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{detail?.label ?? 'Asset class'}</h1>
          <p className="text-muted-foreground">Positions and trades in this class</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2 sm:flex-none"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCcw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button className="flex-1 gap-2 sm:flex-none" size="sm" onClick={() => openTrade('buy-new')}>
            <Plus className="h-4 w-4" />
            Add position
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : summary ? (
        <>
          <StackSummaryCards
            totalValueKES={summary.totalValueKES}
            costKES={summary.totalCostKES}
            gainKES={summary.unrealizedGainKES}
            gainPercent={summary.gainPercent}
            positions={summary.positions}
          />

          <StackHoldingsCards
            holdings={detail?.holdings ?? []}
            currency={currency}
            kesToDisplayMultiplier={kesToDisplayMultiplier}
            onOpenPosition={onOpenPosition}
            onBuy={(h) => openTrade('buy-more', h)}
            onSell={(h) => openTrade('sell', h)}
          />

          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Avg buy</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Current</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail?.holdings ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      No positions in this class yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  detail?.holdings.map((h) => {
                    const positive = h.gainPercent >= 0
                    return (
                      <TableRow
                        key={h.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => onOpenPosition(h.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{h.ticker || h.name}</span>
                            {h.marketTag && (
                              <Badge variant="secondary" className="text-[10px] font-normal">
                                {h.marketTag}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{h.name}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {h.quantity.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums hidden sm:table-cell">
                          {formatCurrencyNative(h.avgBuyPrice, (h.currency || 'USD') as 'USD', {
                            compact: true,
                          })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums hidden md:table-cell">
                          {formatCurrencyNative(h.currentPrice, (h.currency || 'USD') as 'USD', {
                            compact: true,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium tabular-nums block">
                            {formatCurrency(h.valueKES, currency, { kesToDisplayMultiplier, compact: true })}
                          </span>
                          <span
                            className={cn(
                              'text-xs tabular-nums',
                              positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            )}
                          >
                            {formatPercentage(h.gainPercent)}
                          </span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className={STACK_BUY_BUTTON_CLASS}
                              onClick={() => openTrade('buy-more', h)}
                            >
                              Buy
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={STACK_SELL_BUTTON_CLASS}
                              onClick={() => openTrade('sell', h)}
                            >
                              Sell
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}

      <TradeDialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        mode={tradeMode}
        holding={activeHolding}
        defaultAssetClass={assetClass}
        onSuccess={refresh}
      />
    </div>
  )
}
