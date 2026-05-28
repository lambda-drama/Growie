'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  effectiveAvgBuyNative,
  formatCurrency,
  formatDate,
  formatHoldingMoney,
  formatHoldingPositionValue,
  formatPercentage,
} from '@/lib/format'
import { StackBucketIcon } from '@/components/stack/stack-bucket-icon'
import {
  bucketIconKind,
  bucketLabelForTickerGroup,
  groupingBackLabel,
  groupingBucketColumnLabel,
  type StackGroupingMode,
} from '@/lib/stack-grouping'
import { groupHoldingsByTicker, type StackTickerGroup } from '@/lib/stack-ticker-groups'
import type { StackHolding } from '@/services/stack'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'

interface StackClassHoldingsTableProps {
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
}

function HoldingTableRow({
  holding,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  onOpenHolding,
  onBuy,
  onSell,
  lotMode,
}: {
  holding: StackHolding
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  onOpenHolding: (h: StackHolding) => void
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
  lotMode?: boolean
}) {
  const positive = (holding.gainPercent ?? 0) >= 0
  const ccy = (holding.currency || 'USD') as 'USD'
  const initialInvestmentNative = effectiveAvgBuyNative(holding) * (holding.quantity ?? 0)

  return (
    <TableRow className={lotMode ? 'bg-muted/25' : undefined}>
      <TableCell
        className={cn('cursor-pointer hover:bg-muted/40', lotMode && 'pl-10')}
        onClick={() => onOpenHolding(holding)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{holding.marketTag || '—'}</span>
          {holding.ticker ? (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {holding.ticker}
            </Badge>
          ) : null}
        </div>
        {lotMode ? (
          <p className="text-xs text-muted-foreground">Lot · {formatDate(holding.dateAdded)}</p>
        ) : null}
      </TableCell>
      <TableCell
        className="cursor-pointer text-right tabular-nums hover:bg-muted/40"
        onClick={() => onOpenHolding(holding)}
      >
        {holding.quantity.toLocaleString()}
      </TableCell>
      <TableCell
        className="cursor-pointer text-right tabular-nums hover:bg-muted/40"
        onClick={() => onOpenHolding(holding)}
      >
        {formatHoldingMoney(effectiveAvgBuyNative(holding), ccy, displayCurrency as 'USD', {
          kesToDisplayMultiplier,
          kesPerUsd,
          compact: true,
        })}
      </TableCell>
      <TableCell
        className="cursor-pointer text-right tabular-nums hover:bg-muted/40"
        onClick={() => onOpenHolding(holding)}
      >
        {formatHoldingMoney(holding.currentPrice, ccy, displayCurrency as 'USD', {
          kesToDisplayMultiplier,
          kesPerUsd,
          compact: true,
        })}
      </TableCell>
      <TableCell
        className="cursor-pointer text-right tabular-nums hover:bg-muted/40"
        onClick={() => onOpenHolding(holding)}
      >
        {formatHoldingMoney(initialInvestmentNative, ccy, displayCurrency as 'USD', {
          kesToDisplayMultiplier,
          kesPerUsd,
          compact: true,
        })}
      </TableCell>
      <TableCell
        className="cursor-pointer text-right tabular-nums hover:bg-muted/40"
        onClick={() => onOpenHolding(holding)}
      >
        {formatHoldingPositionValue(holding, displayCurrency as 'USD', {
          kesToDisplayMultiplier,
          kesPerUsd,
          compact: true,
        })}
      </TableCell>
      <TableCell
        className="cursor-pointer text-right hover:bg-muted/40"
        onClick={() => onOpenHolding(holding)}
      >
        <span
          className={cn(
            'text-xs tabular-nums',
            positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}
        >
          {formatPercentage(holding.gainPercent)}
        </span>
      </TableCell>
      <TableCell className="w-[150px]">
        <div className="flex justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            className={STACK_BUY_BUTTON_CLASS}
            onClick={() => onBuy(holding)}
          >
            Buy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={STACK_SELL_BUTTON_CLASS}
            onClick={() => onSell(holding)}
          >
            Sell
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function GroupSummaryRow({
  group,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  onSelect,
}: {
  group: StackTickerGroup
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  onSelect?: () => void
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
    <TableRow className={cn(onSelect && 'cursor-pointer hover:bg-muted/40')} onClick={onSelect}>
      <TableCell className="w-[320px]">
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{group.ticker}</span>
              {group.marketTag ? (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {group.marketTag}
                </Badge>
              ) : null}
              <Badge variant="outline" className="text-[10px] font-normal">
                {group.lotCount} lot{group.lotCount === 1 ? '' : 's'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{group.displayName}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {avgBuy}
      </TableCell>
      <TableCell className="text-right tabular-nums hidden sm:table-cell">
        {current}
      </TableCell>
      <TableCell className="text-right tabular-nums font-semibold">{value}</TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {group.totalQuantity.toLocaleString()} shares
      </TableCell>
      <TableCell className="text-right">
        {onSelect ? <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" /> : null}
      </TableCell>
    </TableRow>
  )
}

export function StackClassHoldingsTable({
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
}: StackClassHoldingsTableProps) {
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

  if (groups.length === 0) return null

  if (selectedGroup) {
    return (
      <div className="hidden rounded-xl border md:block">
        <div className="border-b px-3 py-2">
          <Button variant="ghost" size="sm" className="gap-1 px-1" onClick={onBackToGroups}>
            <ChevronLeft className="h-4 w-4" />
            Back to tickers
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead colSpan={8}>
                <div className="flex flex-wrap items-center gap-2 py-1">
                  <span className="font-semibold">{selectedGroup.ticker}</span>
                  {selectedGroup.marketTag ? (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {selectedGroup.marketTag}
                    </Badge>
                  ) : null}
                  <span className="text-xs font-normal text-muted-foreground">
                    {selectedGroup.displayName}
                  </span>
                </div>
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead>Broker</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Avg buy</TableHead>
              <TableHead className="text-right">Current price</TableHead>
              <TableHead className="text-right">Initial inv.</TableHead>
              <TableHead className="text-right">Current val.</TableHead>
              <TableHead className="text-right">Delta %</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedGroup.holdings.map((h) => (
              <HoldingTableRow
                key={h.id}
                holding={h}
                displayCurrency={displayCurrency}
                kesToDisplayMultiplier={kesToDisplayMultiplier}
                kesPerUsd={kesPerUsd}
                onOpenHolding={onOpenHolding}
                onBuy={onBuy}
                onSell={onSell}
                lotMode
              />
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (groupingMode !== 'ticker' && !selectedBucketKey) {
    return (
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{groupingBucketColumnLabel(groupingMode)}</TableHead>
              <TableHead className="text-right">Tickers</TableHead>
              <TableHead className="text-right">Lots</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Delta %</TableHead>
              <TableHead className="w-[32px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bucketSummaries.map((b) => (
              <TableRow
                key={b.bucket}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => onSelectBucket(b.bucket)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <StackBucketIcon
                      label={b.bucket}
                      kind={bucketIconKind(groupingMode)}
                      className="h-9 w-9 sm:h-10 sm:w-10"
                    />
                    <span className="font-semibold">{b.bucket}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{b.tickerCount}</TableCell>
                <TableCell className="text-right tabular-nums">{b.lotCount}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatCurrency(b.totalValue, displayCurrency as 'USD', {
                    kesToDisplayMultiplier,
                    compact: true,
                  })}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    b.gainPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {formatPercentage(b.gainPercent)}
                </TableCell>
                <TableCell className="text-right">
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (groupingMode !== 'ticker' && selectedBucketKey) {
    return (
      <div className="hidden rounded-xl border md:block">
        <div className="border-b px-3 py-2">
          <Button variant="ghost" size="sm" className="gap-1 px-1" onClick={onBackToBuckets}>
            <ChevronLeft className="h-4 w-4" />
            Back to {groupingBackLabel(groupingMode)}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead colSpan={6}>
                <div className="flex items-center gap-2 py-1">
                  <span className="font-semibold">{selectedBucketKey}</span>
                </div>
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead>Broker</TableHead>
              <TableHead className="text-right">Avg buy</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Current</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Lots</TableHead>
              <TableHead className="w-[32px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedBucketGroups.map((group) => (
              <GroupSummaryRow
                key={group.key}
                group={group}
                displayCurrency={displayCurrency}
                kesToDisplayMultiplier={kesToDisplayMultiplier}
                kesPerUsd={kesPerUsd}
                onSelect={() => onSelectGroup(group.key)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="hidden overflow-hidden rounded-xl border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Broker</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="text-right">Avg buy</TableHead>
            <TableHead className="text-right">Current price</TableHead>
            <TableHead className="text-right">Initial inv.</TableHead>
            <TableHead className="text-right">Current val.</TableHead>
            <TableHead className="text-right">Delta %</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <GroupSummaryRow
              key={group.key}
              group={group}
              displayCurrency={displayCurrency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
              kesPerUsd={kesPerUsd}
              onSelect={() => onSelectGroup(group.key)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
