'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { StackHoldingRowCard } from '@/components/stack/stack-holding-row-card'
import { formatCurrency, formatPercentage } from '@/lib/format'
import { groupHoldingsByTicker, type StackTickerGroup } from '@/lib/stack-ticker-groups'
import type { StackHolding } from '@/services/stack'
import { cn } from '@/lib/utils'

interface StackTickerGroupsProps {
  holdings: StackHolding[]
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
  emptyMessage?: string
  emptyActions?: ReactNode
}

/** Tier 2: one-line aggregated ticker summary (original card header style). */
function TickerSummaryLine({
  group,
  displayCurrency,
  kesToDisplayMultiplier,
  open,
  collapsible,
}: {
  group: StackTickerGroup
  displayCurrency: string
  kesToDisplayMultiplier: number
  open: boolean
  collapsible: boolean
}) {
  const positive = group.gainPercent >= 0
  const headerValue = formatCurrency(group.totalValueInKES, displayCurrency as 'USD', {
    kesToDisplayMultiplier,
    compact: true,
  })

  const inner = (
    <>
      {collapsible ? (
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      ) : (
        <span className="h-4 w-4 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{group.ticker}</span>
          {group.marketTag ? (
            <Badge variant="secondary" className="text-[10px]">
              {group.marketTag}
            </Badge>
          ) : null}
          {group.lotCount > 1 ? (
            <Badge variant="outline" className="text-[10px] font-normal">
              {group.lotCount} lots
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {group.displayName}
          {group.lotCount > 1
            ? ` · ${group.totalQuantity.toLocaleString()} shares total`
            : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold tabular-nums">{headerValue}</p>
        <p
          className={cn(
            'text-xs font-medium tabular-nums',
            positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}
        >
          {formatPercentage(group.gainPercent)}
        </p>
      </div>
    </>
  )

  if (collapsible) {
    return (
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-start gap-2 p-4 text-left">
          {inner}
        </button>
      </CollapsibleTrigger>
    )
  }

  return <div className="flex w-full items-start gap-2 p-4">{inner}</div>
}

function TickerGroupBlock({
  group,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  onBuy,
  onSell,
}: {
  group: StackTickerGroup
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
}) {
  const singleLot = group.lotCount === 1
  const primary = group.holdings[0]
  const [open, setOpen] = useState(false)

  if (singleLot) {
    return (
      <StackHoldingRowCard
        holding={primary}
        displayCurrency={displayCurrency}
        kesToDisplayMultiplier={kesToDisplayMultiplier}
        kesPerUsd={kesPerUsd}
        onBuy={onBuy}
        onSell={onSell}
      />
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border border-border bg-card shadow-sm">
      <TickerSummaryLine
        group={group}
        displayCurrency={displayCurrency}
        kesToDisplayMultiplier={kesToDisplayMultiplier}
        open={open}
        collapsible
      />
      <CollapsibleContent>
        {group.holdings.map((h) => (
          <StackHoldingRowCard
            key={h.id}
            holding={h}
            displayCurrency={displayCurrency}
            kesToDisplayMultiplier={kesToDisplayMultiplier}
            kesPerUsd={kesPerUsd}
            onBuy={onBuy}
            onSell={onSell}
            nested
            lotMode
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function StackTickerGroups({
  holdings,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  onBuy,
  onSell,
  emptyMessage,
  emptyActions,
}: StackTickerGroupsProps) {
  const groups = useMemo(() => groupHoldingsByTicker(holdings), [holdings])

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

  return (
    <ul className="space-y-3">
      {groups.map((group) => (
        <li key={group.key}>
          <TickerGroupBlock
            group={group}
            displayCurrency={displayCurrency}
            kesToDisplayMultiplier={kesToDisplayMultiplier}
            kesPerUsd={kesPerUsd}
            onBuy={onBuy}
            onSell={onSell}
          />
        </li>
      ))}
    </ul>
  )
}
