'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StackHeroCard } from '@/components/stack/stack-hero-card'
import { StackMetricsGrid } from '@/components/stack/stack-metrics-grid'
import { StackAnalyticsSection } from '@/components/stack/stack-analytics-section'
import { StackBucketIcon } from '@/components/stack/stack-bucket-icon'
import { StackClassList } from '@/components/stack/stack-class-list'
import { StackTickerGroups } from '@/components/stack/stack-ticker-groups'
import { StackClassHoldingsTable } from '@/components/stack/stack-class-holdings-table'
import { StackExcelBulkImport } from '@/components/stack/stack-excel-bulk-import'
import { TradeDialog, type TradeMode } from '@/components/stack/trade-dialog'
import { useStackOverview } from '@/hooks/use-stack'
import { usePortfolio } from '@/hooks/use-portfolio'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore, useDisplayMoney } from '@/lib/store'
import { computeDashboardMetrics } from '@/lib/dashboard-data'
import {
  bucketIconKind,
  bucketLabelForHolding,
  groupingListTitle,
  isBucketGroupingMode,
} from '@/lib/stack-grouping'
import { firstNameFrom, timeGreeting } from '@/lib/stack-ui'
import type { StackClassSummary } from '@/services/stack'
import type { StackHolding } from '@/services/stack'
import { formatCurrency, formatPercentage } from '@/lib/format'
import { cn } from '@/lib/utils'

interface StackOverviewProps {
  onOpenClass: (summary: StackClassSummary) => void
}

export function StackOverview({ onOpenClass }: StackOverviewProps) {
  const { user } = useAuth()
  const { classes, isLoading: stackLoading, refresh, reload: reloadStack } = useStackOverview()
  const { holdings, summary, isLoading: portfolioLoading, reload: reloadPortfolio } = usePortfolio()
  const { currency, kesToDisplayMultiplier, kesPerUsd } = useDisplayMoney()
  const [tradeOpen, setTradeOpen] = useState(false)
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy-new')
  const [activeHolding, setActiveHolding] = useState<StackHolding | null>(null)
  const { stackGroupingMode, setStackGroupingMode } = useAppStore()
  const [selectedOverviewBucket, setSelectedOverviewBucket] = useState<string | null>(null)
  const [selectedOverviewGroupKey, setSelectedOverviewGroupKey] = useState<string | null>(null)

  const openTrade = (mode: TradeMode, holding?: StackHolding) => {
    setTradeMode(mode)
    setActiveHolding(holding ?? null)
    setTradeOpen(true)
  }

  const groupedOverviewRows = useMemo(() => {
    if (!isBucketGroupingMode(stackGroupingMode)) return []
    const map = new Map<string, { value: number; cost: number; positions: number; classCounts: Record<string, number> }>()
    for (const h of holdings) {
      const key = bucketLabelForHolding(h, stackGroupingMode)
      const row = map.get(key) ?? { value: 0, cost: 0, positions: 0, classCounts: {} }
      row.value += h.valueInKES ?? h.valueKES ?? 0
      row.cost += h.costAtAvgKES ?? h.costBasisKES ?? 0
      row.positions += 1
      row.classCounts[h.assetClass] = (row.classCounts[h.assetClass] || 0) + 1
      map.set(key, row)
    }
    return [...map.entries()]
      .map(([label, row]) => ({
        label,
        value: row.value,
        gainPercent: row.cost > 0 ? ((row.value - row.cost) / row.cost) * 100 : 0,
        positions: row.positions,
        breakdown: Object.entries(row.classCounts)
          .map(([k, v]) => `${k.replace('-', ' ')} ${v}`)
          .join(' • '),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [holdings, stackGroupingMode])

  const selectedBucketHoldings = useMemo(() => {
    if (!selectedOverviewBucket || !isBucketGroupingMode(stackGroupingMode)) return []
    return holdings.filter(
      (h) => bucketLabelForHolding(h, stackGroupingMode) === selectedOverviewBucket
    )
  }, [holdings, selectedOverviewBucket, stackGroupingMode])

  const metrics = useMemo(
    () => computeDashboardMetrics(holdings, summary),
    [holdings, summary]
  )

  const totals = useMemo(
    () =>
      classes.reduce(
        (acc, c) => ({
          value: acc.value + c.valueKES,
          positions: acc.positions + c.positions,
        }),
        { value: 0, positions: 0 }
      ),
    [classes]
  )

  const assetClassCount = classes.filter((c) => c.positions > 0).length || classes.length
  const isLoading = stackLoading && classes.length === 0
  const metricsReady = !portfolioLoading || holdings.length > 0

  const afterBulkImport = () => Promise.all([reloadStack(), reloadPortfolio()])

  const greeting = timeGreeting()
  const firstName = user?.fullName
    ? firstNameFrom(user.fullName)
    : user?.email?.split('@')[0] ?? 'there'

  /** Region/exchange tier 2+ — hide blue hero only; keep the four metric cards (same as ticker class view). */
  const overviewInDrillDown = isBucketGroupingMode(stackGroupingMode) && selectedOverviewBucket != null

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {greeting}, {firstName}
        </h1>
        <div className="hidden shrink-0 gap-2 sm:flex">
          <StackExcelBulkImport variant="compact" onSuccess={afterBulkImport} disabled={stackLoading} />
          <Button size="sm" className="gap-1.5" onClick={() => setTradeOpen(true)}>
            <Plus className="h-4 w-4" />
            Add position
          </Button>
        </div>
      </div>

      <div className="flex w-full gap-2 sm:hidden">
        <StackExcelBulkImport
          variant="compact"
          className="flex-1"
          onSuccess={afterBulkImport}
          disabled={stackLoading}
        />
        <Button className="flex-1 gap-2" onClick={() => setTradeOpen(true)}>
          <Plus className="h-4 w-4" />
          Add position
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-2xl sm:h-48" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              No holdings yet. Add a position manually or bulk-import your Scope / global stocks Excel.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <StackExcelBulkImport onSuccess={afterBulkImport} />
              <Button className="gap-2" onClick={() => setTradeOpen(true)}>
                <Plus className="h-4 w-4" />
                Add position
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {!overviewInDrillDown ? (
            <StackHeroCard
              totalValueKES={totals.value}
              monthlyGrowthPercent={metrics.monthlyGrowthPercent}
              monthlyGrowthKES={metrics.monthlyGrowthKES}
              classes={classes}
              currency={currency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
            />
          ) : null}

          {metricsReady ? (
            <StackMetricsGrid
              metrics={metrics}
              totalPositions={totals.positions}
              assetClassCount={assetClassCount}
              currency={currency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Group by:</span>
            <Button
              size="sm"
              variant={stackGroupingMode === 'ticker' ? 'default' : 'outline'}
              onClick={() => {
                setStackGroupingMode('ticker')
                setSelectedOverviewBucket(null)
                setSelectedOverviewGroupKey(null)
              }}
            >
              Ticker
            </Button>
            <Button
              size="sm"
              variant={stackGroupingMode === 'region' ? 'default' : 'outline'}
              onClick={() => {
                setStackGroupingMode('region')
                setSelectedOverviewBucket(null)
                setSelectedOverviewGroupKey(null)
              }}
            >
              Region
            </Button>
            <Button
              size="sm"
              variant={stackGroupingMode === 'exchange' ? 'default' : 'outline'}
              onClick={() => {
                setStackGroupingMode('exchange')
                setSelectedOverviewBucket(null)
                setSelectedOverviewGroupKey(null)
              }}
            >
              Exchange
            </Button>
          </div>

          {stackGroupingMode === 'ticker' ? (
            <StackClassList
              classes={classes}
              currency={currency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
              onOpenClass={onOpenClass}
            />
          ) : (
            <section>
              {!overviewInDrillDown ? (
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  My stack by {groupingListTitle(stackGroupingMode)}
                </h2>
              ) : null}
              {!selectedOverviewBucket ? (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  {groupedOverviewRows.map((row) => (
                    <li key={row.label}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-3.5 text-left transition-colors hover:bg-muted/50 sm:gap-4 sm:px-4 sm:py-4"
                        onClick={() => {
                          setSelectedOverviewBucket(row.label)
                          setSelectedOverviewGroupKey(null)
                        }}
                      >
                      <StackBucketIcon
                        label={row.label}
                        kind={bucketIconKind(stackGroupingMode)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground sm:text-base">
                          {row.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground sm:text-sm">
                          {row.breakdown} • {row.positions} positions
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums sm:text-base">
                          {formatCurrency(row.value, currency as 'KES', {
                            kesToDisplayMultiplier,
                            compact: true,
                          })}
                        </span>
                        <span
                          className={cn(
                            'block text-xs font-medium tabular-nums sm:text-sm',
                            row.gainPercent >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          )}
                        >
                          {formatPercentage(row.gainPercent)}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-1"
                    onClick={() => {
                      setSelectedOverviewBucket(null)
                      setSelectedOverviewGroupKey(null)
                    }}
                  >
                    Back to {groupingListTitle(stackGroupingMode)}
                  </Button>
                  <div className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">
                    {selectedOverviewBucket}
                  </div>
                  <div className="md:hidden">
                    <StackTickerGroups
                      holdings={selectedBucketHoldings}
                      displayCurrency={currency}
                      kesToDisplayMultiplier={kesToDisplayMultiplier}
                      kesPerUsd={kesPerUsd}
                      onOpenHolding={() => {}}
                      onBuy={(h) => openTrade('buy-more', h)}
                      onSell={(h) => openTrade('sell', h)}
                      groupingMode="ticker"
                      selectedBucketKey={null}
                      onSelectBucket={() => {}}
                      onBackToBuckets={() => {}}
                      selectedGroupKey={selectedOverviewGroupKey}
                      onSelectGroup={setSelectedOverviewGroupKey}
                      onBackToGroups={() => setSelectedOverviewGroupKey(null)}
                    />
                  </div>
                  <StackClassHoldingsTable
                    holdings={selectedBucketHoldings}
                    displayCurrency={currency}
                    kesToDisplayMultiplier={kesToDisplayMultiplier}
                    kesPerUsd={kesPerUsd}
                    onOpenHolding={() => {}}
                    onBuy={(h) => openTrade('buy-more', h)}
                    onSell={(h) => openTrade('sell', h)}
                    groupingMode="ticker"
                    selectedBucketKey={null}
                    onSelectBucket={() => {}}
                    onBackToBuckets={() => {}}
                    selectedGroupKey={selectedOverviewGroupKey}
                    onSelectGroup={setSelectedOverviewGroupKey}
                    onBackToGroups={() => setSelectedOverviewGroupKey(null)}
                  />
                </div>
              )}
            </section>
          )}
          {!overviewInDrillDown ? (
            <StackAnalyticsSection holdings={holdings as StackHolding[]} />
          ) : null}
        </>
      )}

      <TradeDialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        mode={tradeMode}
        holding={activeHolding}
        onSuccess={refresh}
      />
    </div>
  )
}
