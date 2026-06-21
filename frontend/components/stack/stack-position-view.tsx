'use client'

import { useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StackBreadcrumb } from '@/components/stack/stack-breadcrumb'
import { StackHoldingTransactions } from '@/components/stack/stack-holding-transactions'
import { TradeDialog, type TradeMode } from '@/components/stack/trade-dialog'
import { useStackPosition } from '@/hooks/use-stack'
import { useDisplayMoney } from '@/lib/store'
import {
  effectiveAvgBuyNative,
  formatHoldingMoney,
  formatHoldingPositionValue,
  formatPercentage,
} from '@/lib/format'
import type { AssetClass } from '@/types'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS } from '@/lib/stack-ui'
import { displayMarketTagForUser } from '@/lib/asset-categories'
import { cn } from '@/lib/utils'

interface StackPositionViewProps {
  holdingId: string
  assetClass: AssetClass
  onBackOverview: () => void
  onBackClass: () => void
}

export function StackPositionView({
  holdingId,
  assetClass,
  onBackOverview,
  onBackClass,
}: StackPositionViewProps) {
  const { detail, isLoading, error, refresh } = useStackPosition(holdingId)
  const { currency, kesToDisplayMultiplier, kesPerUsd } = useDisplayMoney()
  const [tradeOpen, setTradeOpen] = useState(false)
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy-more')
  const [txRefreshKey, setTxRefreshKey] = useState(0)

  const holding = detail?.holding
  const label = holding ? `${holding.ticker || holding.name}` : 'Position'

  const openTrade = (mode: TradeMode) => {
    setTradeMode(mode)
    setTradeOpen(true)
  }

  const bumpTransactions = () => setTxRefreshKey((k) => k + 1)

  const marketBadge = displayMarketTagForUser(holding?.marketTag)

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
            {marketBadge ? <Badge variant="secondary">{marketBadge}</Badge> : null}
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
                  {formatHoldingMoney(
                    effectiveAvgBuyNative(holding),
                    (holding.currency || 'USD') as 'USD',
                    currency,
                    { kesToDisplayMultiplier, kesPerUsd }
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Current price</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatHoldingMoney(holding.currentPrice, (holding.currency || 'USD') as 'USD', currency, {
                    kesToDisplayMultiplier,
                    kesPerUsd,
                  })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Value</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatHoldingPositionValue(holding, currency, {
                    kesToDisplayMultiplier,
                    kesPerUsd,
                  })}
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
              <CardTitle className="text-base">Trades — use ⋮ on a row to delete</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0 pb-2">
              <StackHoldingTransactions
                holdingId={holdingId}
                refreshKey={txRefreshKey}
                onHoldingUpdated={(_h, fullyRemoved) => {
                  if (fullyRemoved) {
                    onBackClass()
                    return
                  }
                  void refresh()
                }}
              />
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
        onSuccess={({ fullySold } = {}) => {
          bumpTransactions()
          if (fullySold) {
            onBackClass()
            return
          }
          void refresh()
        }}
      />
    </div>
  )
}
