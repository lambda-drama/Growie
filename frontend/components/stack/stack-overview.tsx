'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StackHeroCard } from '@/components/stack/stack-hero-card'
import { StackMetricsGrid } from '@/components/stack/stack-metrics-grid'
import { StackAnalyticsSection } from '@/components/stack/stack-analytics-section'
import { StackBucketIcon } from '@/components/stack/stack-bucket-icon'
import { StackCategoryList } from '@/components/stack/stack-category-list'
import { StackTickerGroups } from '@/components/stack/stack-ticker-groups'
import { StackClassHoldingsTable } from '@/components/stack/stack-class-holdings-table'
import { StackExcelBulkImport } from '@/components/stack/stack-excel-bulk-import'
import { StackHoldingDetailSheet } from '@/components/stack/stack-holding-detail-sheet'
import { TradeDialog, type TradeMode } from '@/components/stack/trade-dialog'
import { useStackOverview } from '@/hooks/use-stack'
import { usePortfolio } from '@/hooks/use-portfolio'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore, useDisplayMoney } from '@/lib/store'
import { computeDashboardMetrics, groupByAssetCategory } from '@/lib/dashboard-data'
import {
  bucketIconKind,
  bucketLabelForHolding,
  GROUP_BY_OPTIONS,
  groupingListTitle,
  holdingMatchesGroupingMode,
  isAssetClassOverviewMode,
  isBucketGroupingMode,
} from '@/lib/stack-grouping'
import { firstNameFrom, timeGreeting } from '@/lib/stack-ui'
import type { StackHolding } from '@/services/stack'
import { formatCurrency, formatPercentage } from '@/lib/format'
import { cn } from '@/lib/utils'

interface StackOverviewProps {
  onOpenClass?: (summary: import('@/services/stack').StackClassSummary) => void
}

export function StackOverview({ onOpenClass: _onOpenClass }: StackOverviewProps) {
  const { user } = useAuth()
  const { classes, isLoading: stackLoading, refresh, reload: reloadStack } = useStackOverview()
  const { holdings, summary, isLoading: portfolioLoading, reload: reloadPortfolio } = usePortfolio()
  const { currency, kesToDisplayMultiplier, kesPerUsd } = useDisplayMoney()
  const [tradeOpen, setTradeOpen] = useState(false)
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy-new')
  const [activeHolding, setActiveHolding] = useState<StackHolding | null>(null)
  const [detailHolding, setDetailHolding] = useState<StackHolding | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const { stackGroupingMode, setStackGroupingMode, stackDrilldown, setStackDrilldown } = useAppStore()
  const [selectedOverviewBucket, setSelectedOverviewBucket] = useState<string | null>(null)
  const [selectedOverviewCountry, setSelectedOverviewCountry] = useState<string | null>(null)
  const [selectedOverviewGroupKey, setSelectedOverviewGroupKey] = useState<string | null>(null)

  useEffect(() => {
    if (!stackDrilldown) return
    setStackGroupingMode(stackDrilldown.groupingMode)
    setSelectedOverviewBucket(stackDrilldown.bucket)
    setSelectedOverviewCountry(null)
    setSelectedOverviewGroupKey(null)
    setStackDrilldown(null)
  }, [stackDrilldown, setStackDrilldown, setStackGroupingMode])

  const openTrade = (mode: TradeMode, holding?: StackHolding) => {
    setTradeMode(mode)
    setActiveHolding(holding ?? null)
    setTradeOpen(true)
  }

  const openHoldingDetail = (holding: StackHolding) => {
    setDetailHolding(holding)
    setDetailOpen(true)
  }

  const groupedOverviewRows = useMemo(() => {
    if (!isBucketGroupingMode(stackGroupingMode)) return []
    const map = new Map<string, { value: number; cost: number; positions: number }>()
    for (const h of holdings) {
      if (!holdingMatchesGroupingMode(h, stackGroupingMode)) continue
      const key = bucketLabelForHolding(h, stackGroupingMode)
      const row = map.get(key) ?? { value: 0, cost: 0, positions: 0 }
      row.value += h.valueInKES ?? h.valueKES ?? 0
      row.cost += h.costAtAvgKES ?? h.costBasisKES ?? 0
      row.positions += 1
      map.set(key, row)
    }
    return [...map.entries()]
      .map(([label, row]) => ({
        label,
        value: row.value,
        gainPercent: row.cost > 0 ? ((row.value - row.cost) / row.cost) * 100 : 0,
        positions: row.positions,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [holdings, stackGroupingMode])

  const categoryGroups = useMemo(() => groupByAssetCategory(holdings), [holdings])
  const assetCategoryCount = categoryGroups.length

  const selectedBucketHoldings = useMemo(() => {
    if (!selectedOverviewBucket || !isBucketGroupingMode(stackGroupingMode)) return []
    return holdings.filter(
      (h) =>
        holdingMatchesGroupingMode(h, stackGroupingMode) &&
        bucketLabelForHolding(h, stackGroupingMode) === selectedOverviewBucket
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
              No holdings yet. Add a position manually or bulk-import your holdings Excel.
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
              assetClassCount={assetCategoryCount}
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
            {GROUP_BY_OPTIONS.filter((o) => !o.hidden).map(({ mode, label }) => (
              <Button
                key={mode}
                size="sm"
                variant={stackGroupingMode === mode ? 'default' : 'outline'}
                onClick={() => {
                  setStackGroupingMode(mode)
                  setSelectedOverviewBucket(null)
                  setSelectedOverviewCountry(null)
                  setSelectedOverviewGroupKey(null)
                }}
              >
                {label}
              </Button>
            ))}
            {GROUP_BY_OPTIONS.filter((o) => o.hidden).map(({ mode, label }) => (
              <Button
                key={mode}
                size="sm"
                variant={isAssetClassOverviewMode(stackGroupingMode) ? 'secondary' : 'ghost'}
                className="text-muted-foreground"
                onClick={() => {
                  setStackGroupingMode(mode)
                  setSelectedOverviewBucket(null)
                  setSelectedOverviewCountry(null)
                  setSelectedOverviewGroupKey(null)
                }}
              >
                {label}
              </Button>
            ))}
          </div>

          {isAssetClassOverviewMode(stackGroupingMode) ? (
            <StackCategoryList
              groups={categoryGroups}
              currency={currency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
              onOpenCategory={(category) => {
                setStackGroupingMode('assetCategory')
                setSelectedOverviewBucket(category)
              }}
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
                          setSelectedOverviewCountry(null)
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
                          {row.positions} position{row.positions === 1 ? '' : 's'}
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
                      setSelectedOverviewCountry(null)
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
                      onOpenHolding={openHoldingDetail}
                      onBuy={(h) => openTrade('buy-more', h)}
                      onSell={(h) => openTrade('sell', h)}
                      groupingMode={stackGroupingMode}
                      selectedBucketKey={selectedOverviewBucket}
                      onSelectBucket={setSelectedOverviewBucket}
                      onBackToBuckets={() => {
                        setSelectedOverviewBucket(null)
                        setSelectedOverviewCountry(null)
                        setSelectedOverviewGroupKey(null)
                      }}
                      selectedCountryKey={selectedOverviewCountry}
                      onSelectCountry={(country) => {
                        setSelectedOverviewCountry(country)
                        setSelectedOverviewGroupKey(null)
                      }}
                      onBackToCountries={() => {
                        setSelectedOverviewCountry(null)
                        setSelectedOverviewGroupKey(null)
                      }}
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
                    onOpenHolding={openHoldingDetail}
                    onBuy={(h) => openTrade('buy-more', h)}
                    onSell={(h) => openTrade('sell', h)}
                    groupingMode={stackGroupingMode}
                    selectedBucketKey={selectedOverviewBucket}
                    onSelectBucket={setSelectedOverviewBucket}
                    onBackToBuckets={() => {
                      setSelectedOverviewBucket(null)
                      setSelectedOverviewCountry(null)
                      setSelectedOverviewGroupKey(null)
                    }}
                    selectedCountryKey={selectedOverviewCountry}
                    onSelectCountry={(country) => {
                      setSelectedOverviewCountry(country)
                      setSelectedOverviewGroupKey(null)
                    }}
                    onBackToCountries={() => {
                      setSelectedOverviewCountry(null)
                      setSelectedOverviewGroupKey(null)
                    }}
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

      <StackHoldingDetailSheet
        holding={detailHolding}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) setDetailHolding(null)
        }}
        onBuy={(h) => {
          setDetailOpen(false)
          openTrade('buy-more', h)
        }}
        onSell={(h) => {
          setDetailOpen(false)
          openTrade('sell', h)
        }}
        onEdit={(h) => {
          setDetailOpen(false)
          openTrade('buy-more', h)
        }}
        onDeleted={() => void afterBulkImport()}
      />

      <TradeDialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        mode={tradeMode}
        holding={activeHolding}
        onSuccess={() => void afterBulkImport()}
      />
    </div>
  )
}
