'use client'

import { useMemo, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StackBucketIcon } from '@/components/stack/stack-bucket-icon'
import { StackHoldingRowCard } from '@/components/stack/stack-holding-row-card'
import { formatCurrency, formatHoldingMoney, formatPercentage } from '@/lib/format'
import {
  bucketIconKind,
  bucketLabelForTickerGroup,
  groupingBackLabel,
  type StackGroupingMode,
} from '@/lib/stack-grouping'
import { groupHoldingsByTicker, type StackTickerGroup } from '@/lib/stack-ticker-groups'
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
  const ccy = (group.currency || 'USD') as 'USD'
  const avgBuy = formatHoldingMoney(group.weightedAvgBuyNative, ccy, displayCurrency as 'USD', {
    kesToDisplayMultiplier,
    kesPerUsd,
    compact: true,
  })
  const current = formatHoldingMoney(group.weightedCurrentNative, ccy, displayCurrency as 'USD', {
    kesToDisplayMultiplier,
    kesPerUsd,
    compact: true,
  })
  const value = formatCurrency(group.totalValueInKES, displayCurrency as 'USD', {
    kesToDisplayMultiplier,
    compact: true,
  })

  return (
    <div className="flex items-start gap-2 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{group.ticker}</span>
          {group.marketTag ? (
            <Badge variant="secondary" className="text-[10px]">
              {group.marketTag}
            </Badge>
          ) : null}
          <Badge variant="outline" className="text-[10px] font-normal">
            {group.lotCount} lot{group.lotCount === 1 ? '' : 's'}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{group.displayName}</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <dt className="text-muted-foreground">Avg buy</dt>
            <dd className="font-medium tabular-nums">{avgBuy}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Current</dt>
            <dd className="font-medium tabular-nums">{current}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Value</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        </dl>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {group.totalQuantity.toLocaleString()} shares · {formatPercentage(group.gainPercent)}
        </p>
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
  emptyMessage,
  emptyActions,
}: StackTickerGroupsProps) {
  const groups = useMemo(() => groupHoldingsByTicker(holdings), [holdings])
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
        const totalValue = bucketGroups.reduce((s, g) => s + g.totalValueInKES, 0)
        const totalCost = bucketGroups.reduce((s, g) => s + g.totalCostInKES, 0)
        const totalLots = bucketGroups.reduce((s, g) => s + g.lotCount, 0)
        return {
          bucket,
          tickerCount: bucketGroups.length,
          lotCount: totalLots,
          gainPercent: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
          totalValue,
        }
      }),
    [bucketedGroups]
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
              {selectedGroup.marketTag ? (
                <Badge variant="secondary" className="text-[10px]">
                  {selectedGroup.marketTag}
                </Badge>
              ) : null}
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

  if (groupingMode !== 'ticker' && selectedBucketKey) {
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
          {selectedBucketGroups.map((group) => (
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
