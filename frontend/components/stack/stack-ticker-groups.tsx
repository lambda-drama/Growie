'use client'

import { useMemo, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StackBucketIcon } from '@/components/stack/stack-bucket-icon'
import { StackDrilldownMetricsGrid } from '@/components/stack/stack-drilldown-metrics'
import { StackHoldingRowCard } from '@/components/stack/stack-holding-row-card'
import { formatCurrency, formatPercentage } from '@/lib/format'
import {
  bucketIconKind,
  bucketLabelForTickerGroup,
  filterHoldingsByCountry,
  groupingBackLabel,
  metricsFromCountrySummary,
  regionGroupingUsesCountryTier,
  summarizeHoldingsByCountry,
  type StackGroupingMode,
} from '@/lib/stack-grouping'
import { groupHoldingsByTicker, metricsFromTickerGroup, type StackTickerGroup } from '@/lib/stack-ticker-groups'
import { computeWeightedPortfolioReturn } from '@/lib/stack-holdings-summary'
import type { StackHolding } from '@/services/stack'
import { cn } from '@/lib/utils'

interface StackTickerGroupsProps {
  holdings: StackHolding[]
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  onOpenHolding: (h: StackHolding) => void
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
  groupingMode: StackGroupingMode
  selectedBucketKey: string | null
  onSelectBucket: (bucket: string) => void
  onBackToBuckets: () => void
  selectedGroupKey: string | null
  onSelectGroup: (groupKey: string) => void
  onBackToGroups: () => void
  selectedCountryKey?: string | null
  onSelectCountry?: (country: string) => void
  onBackToCountries?: () => void
  emptyMessage?: string
  emptyActions?: ReactNode
}

function TickerSummaryCard({
  group,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
}: {
  group: StackTickerGroup
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
}) {
  return (
    <div className="flex items-start gap-2 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{group.ticker}</span>
          <Badge variant="outline" className="text-[10px] font-normal">
            {group.lotCount} lot{group.lotCount === 1 ? '' : 's'}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{group.displayName}</p>
        <StackDrilldownMetricsGrid
          className="mt-2"
          metrics={metricsFromTickerGroup(group)}
          displayCurrency={displayCurrency}
          kesToDisplayMultiplier={kesToDisplayMultiplier}
          kesPerUsd={kesPerUsd}
          currency={group.currency}
        />
      </div>
    </div>
  )
}

export function StackTickerGroups({
  holdings,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  onOpenHolding,
  onBuy,
  onSell,
  groupingMode,
  selectedBucketKey,
  onSelectBucket,
  onBackToBuckets,
  selectedGroupKey,
  onSelectGroup,
  onBackToGroups,
  selectedCountryKey = null,
  onSelectCountry,
  onBackToCountries,
  emptyMessage,
  emptyActions,
}: StackTickerGroupsProps) {
  const usesCountryTier = regionGroupingUsesCountryTier(groupingMode)
  const scopedHoldings = useMemo(() => {
    if (!usesCountryTier || !selectedBucketKey || !selectedCountryKey) return holdings
    return filterHoldingsByCountry(holdings, selectedCountryKey)
  }, [holdings, usesCountryTier, selectedBucketKey, selectedCountryKey])
  const groups = useMemo(() => groupHoldingsByTicker(scopedHoldings), [scopedHoldings])
  const countrySummaries = useMemo(
    () => (usesCountryTier && selectedBucketKey ? summarizeHoldingsByCountry(holdings) : []),
    [holdings, usesCountryTier, selectedBucketKey]
  )
  const bucketedGroups = useMemo(() => {
    const map = new Map<string, StackTickerGroup[]>()
    for (const group of groups) {
      const bucket = bucketLabelForTickerGroup(group, groupingMode)
      const list = map.get(bucket) ?? []
      list.push(group)
      map.set(bucket, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [groups, groupingMode])
  const selectedBucketGroups = useMemo(
    () => (selectedBucketKey ? bucketedGroups.find(([b]) => b === selectedBucketKey)?.[1] ?? [] : []),
    [bucketedGroups, selectedBucketKey]
  )
  const bucketSummaries = useMemo(
    () =>
      bucketedGroups.map(([bucket, bucketGroups]) => {
        const bucketHoldings = bucketGroups.flatMap((g) => g.holdings)
        const weighted = computeWeightedPortfolioReturn(bucketHoldings, kesPerUsd)
        const totalLots = bucketGroups.reduce((s, g) => s + g.lotCount, 0)
        return {
          bucket,
          tickerCount: bucketGroups.length,
          lotCount: totalLots,
          gainPercent: weighted.gainPercent,
          totalValue: weighted.totalValueInKES,
        }
      }),
    [bucketedGroups, kesPerUsd]
  )
  const selectedGroup = useMemo(
    () => groups.find((g) => g.key === selectedGroupKey) ?? null,
    [groups, selectedGroupKey]
  )

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
        <p>{emptyMessage ?? 'No positions in this class yet.'}</p>
        {emptyActions ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">{emptyActions}</div>
        ) : null}
      </div>
    )
  }

  if (selectedGroup) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="gap-1 px-1" onClick={onBackToGroups}>
          <ChevronLeft className="h-4 w-4" />
          Back to tickers
        </Button>
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border/70 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{selectedGroup.ticker}</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{selectedGroup.displayName}</p>
          </div>
          {selectedGroup.holdings.map((h) => (
            <StackHoldingRowCard
              key={h.id}
              holding={h}
              displayCurrency={displayCurrency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
              kesPerUsd={kesPerUsd}
              onOpen={onOpenHolding}
              onBuy={onBuy}
              onSell={onSell}
              nested
              lotMode
            />
          ))}
        </div>
      </div>
    )
  }

  if (groupingMode !== 'ticker' && !selectedBucketKey) {
    return (
      <ul className="space-y-3">
        {bucketSummaries.map((b) => (
          <li key={b.bucket}>
            <button
              type="button"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/20"
              onClick={() => onSelectBucket(b.bucket)}
            >
              <div className="flex items-center gap-3">
                <StackBucketIcon
                  label={b.bucket}
                  kind={bucketIconKind(groupingMode)}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{b.bucket}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.tickerCount} ticker{b.tickerCount === 1 ? '' : 's'} • {b.lotCount} lot
                    {b.lotCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <div className="text-right">
                  <p className="font-semibold tabular-nums">
                    {formatCurrency(b.totalValue, displayCurrency as 'USD', {
                      kesToDisplayMultiplier,
                      compact: true,
                    })}
                  </p>
                  <p
                    className={cn(
                      'text-xs font-medium tabular-nums',
                      b.gainPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {formatPercentage(b.gainPercent)}
                  </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  if (usesCountryTier && selectedBucketKey && !selectedCountryKey) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="gap-1 px-1" onClick={onBackToBuckets}>
          <ChevronLeft className="h-4 w-4" />
          Back to {groupingBackLabel(groupingMode)}
        </Button>
        <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold">
          {selectedBucketKey}
        </div>
        <ul className="space-y-3">
          {countrySummaries.map((c) => (
            <li key={c.country}>
              <button
                type="button"
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/20"
                onClick={() => onSelectCountry?.(c.country)}
              >
                <div className="flex items-start gap-3">
                  <StackBucketIcon label={c.country} kind="region" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.country}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.tickerCount} ticker{c.tickerCount === 1 ? '' : 's'} • {c.lotCount} lot
                      {c.lotCount === 1 ? '' : 's'}
                    </p>
                    <StackDrilldownMetricsGrid
                      className="mt-2"
                      metrics={metricsFromCountrySummary(c)}
                      displayCurrency={displayCurrency}
                      kesToDisplayMultiplier={kesToDisplayMultiplier}
                      kesPerUsd={kesPerUsd}
                    />
                  </div>
                  <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (groupingMode !== 'ticker' && selectedBucketKey) {
    return (
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-1"
          onClick={usesCountryTier && selectedCountryKey ? onBackToCountries : onBackToBuckets}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to {usesCountryTier && selectedCountryKey ? 'countries' : groupingBackLabel(groupingMode)}
        </Button>
        <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold">
          {usesCountryTier && selectedCountryKey
            ? `${selectedBucketKey} · ${selectedCountryKey}`
            : selectedBucketKey}
        </div>
        <ul className="space-y-3">
          {(usesCountryTier && selectedCountryKey ? groups : selectedBucketGroups).map((group) => (
            <li key={group.key}>
              <button
                type="button"
                className="w-full rounded-xl border border-border bg-card text-left shadow-sm transition-colors hover:bg-muted/20"
                onClick={() => onSelectGroup(group.key)}
              >
                <div className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <TickerSummaryCard
                      group={group}
                      displayCurrency={displayCurrency}
                      kesToDisplayMultiplier={kesToDisplayMultiplier}
                      kesPerUsd={kesPerUsd}
                    />
                  </div>
                  <ChevronRight className="mr-4 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {groups.map((group) => (
        <li key={group.key}>
          <button
            type="button"
            className="w-full rounded-xl border border-border bg-card text-left shadow-sm transition-colors hover:bg-muted/20"
            onClick={() => onSelectGroup(group.key)}
          >
            <TickerSummaryCard
              group={group}
              displayCurrency={displayCurrency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
              kesPerUsd={kesPerUsd}
            />
          </button>
        </li>
      ))}
    </ul>
  )
}
