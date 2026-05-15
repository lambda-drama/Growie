'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { TradeDialog, type TradeMode } from '@/components/stack/trade-dialog'
import { useStackPosition } from '@/hooks/use-stack'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatCurrencyNative, formatPercentage } from '@/lib/format'
import type { AssetClass } from '@/types'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS, stackTradeBadgeClass } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'

interface StackPositionViewProps {
  holdingId: string
  assetClass: AssetClass
  onBackOverview: () => void
  onBackClass: () => void
}

function formatTxDate(value: string) {
  if (!value) return '—'
  try {
    const d = parseISO(value.includes('T') ? value : `${value}T00:00:00`)
    if (!Number.isNaN(d.getTime())) return format(d, 'd MMM yyyy')
  } catch { /**/ }
  return value
}

export function StackPositionView({
  holdingId,
  assetClass,
  onBackOverview,
  onBackClass,
}: StackPositionViewProps) {
  const { detail, isLoading, error, refresh } = useStackPosition(holdingId)
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const [tradeOpen, setTradeOpen] = useState(false)
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy-more')

  const holding = detail?.holding
  const label = holding ? `${holding.ticker || holding.name}` : 'Position'

  const openTrade = (mode: TradeMode) => {
    setTradeMode(mode)
    setTradeOpen(true)
  }

  return (
    <div className="space-y-6">
      <StackBreadcrumb
        assetClass={assetClass}
        positionLabel={label}
        onOverview={onBackOverview}
        onClass={onBackClass}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{holding?.ticker || holding?.name || 'Position'}</h1>
            {holding?.marketTag && <Badge variant="secondary">{holding.marketTag}</Badge>}
          </div>
          {holding?.name && holding.ticker && (
            <p className="text-muted-foreground">{holding.name}</p>
          )}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 sm:flex-none"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCcw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn('flex-1 sm:flex-none', STACK_BUY_BUTTON_CLASS)}
            onClick={() => openTrade('buy-more')}
            disabled={!holding}
          >
            Buy more
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn('flex-1 sm:flex-none', STACK_SELL_BUTTON_CLASS)}
            onClick={() => openTrade('sell')}
            disabled={!holding}
          >
            Sell
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : holding ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Quantity</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{holding.quantity.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Avg buy</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrencyNative(holding.avgBuyPrice, (holding.currency || 'USD') as 'USD')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Current price</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrencyNative(holding.currentPrice, (holding.currency || 'USD') as 'USD')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Value</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrency(holding.valueKES, currency, { kesToDisplayMultiplier })}
                </p>
                <p
                  className={cn(
                    'text-sm font-medium',
                    holding.gainPercent >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {formatPercentage(holding.gainPercent)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaction history</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detail?.transactions ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No transactions yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail?.transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{formatTxDate(tx.transactionDate)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={stackTradeBadgeClass(tx.type === 'Buy')}
                          >
                            {tx.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{tx.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums hidden sm:table-cell">
                          {formatCurrencyNative(tx.unitPrice, (tx.currency || 'USD') as 'USD')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(tx.amountKES, currency, { kesToDisplayMultiplier })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}

      <TradeDialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        mode={tradeMode}
        holding={holding ?? null}
        defaultAssetClass={assetClass}
        onSuccess={refresh}
      />
    </div>
  )
}
