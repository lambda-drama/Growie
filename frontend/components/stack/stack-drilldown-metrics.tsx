'use client'

import type { ReactNode } from 'react'
import { TableCell } from '@/components/ui/table'
import {
  formatCurrency,
  formatHoldingMoney,
  formatPercentage,
} from '@/lib/format'
import type { HoldingsSummaryMetrics } from '@/lib/stack-holdings-summary'
import { cn } from '@/lib/utils'

interface StackDrilldownMetricsProps {
  metrics: HoldingsSummaryMetrics
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  /** Native currency when known (e.g. ticker group); falls back to KES totals when mixed. */
  currency?: string
  className?: string
}

function formatSummaryMoney(
  nativeAmount: number,
  kesAmount: number,
  currency: string,
  displayCurrency: string,
  kesToDisplayMultiplier: number,
  kesPerUsd: number,
  compact = true
): string {
  if (currency) {
    return formatHoldingMoney(nativeAmount, currency as 'USD', displayCurrency as 'USD', {
      kesToDisplayMultiplier,
      kesPerUsd,
      compact,
    })
  }
  return formatCurrency(kesAmount, displayCurrency as 'USD', { kesToDisplayMultiplier, compact })
}

function formatSummaryPrice(
  metrics: HoldingsSummaryMetrics,
  kind: 'avgBuy' | 'current',
  displayCurrency: string,
  kesToDisplayMultiplier: number,
  kesPerUsd: number,
  currency?: string
): string {
  const ccy = currency || metrics.currency
  const qty = metrics.totalQuantity
  if (qty <= 0) return '—'
  if (ccy) {
    const perShare =
      kind === 'avgBuy' ? metrics.weightedAvgBuyNative : metrics.weightedCurrentNative
    return formatHoldingMoney(perShare, ccy as 'USD', displayCurrency as 'USD', {
      kesToDisplayMultiplier,
      kesPerUsd,
      compact: true,
    })
  }
  const kesPerShare =
    kind === 'avgBuy'
      ? metrics.totalCostInKES / qty
      : metrics.totalValueInKES / qty
  return formatCurrency(kesPerShare, displayCurrency as 'USD', {
    kesToDisplayMultiplier,
    compact: true,
  })
}

/** Mobile grid: shares, avg buy, initial inv., current price, current value, delta %. */
export function StackDrilldownMetricsGrid({
  metrics,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  currency,
  className,
}: StackDrilldownMetricsProps) {
  const ccy = currency || metrics.currency
  const positive = metrics.gainPercent >= 0
  const avgBuy = formatSummaryPrice(
    metrics,
    'avgBuy',
    displayCurrency,
    kesToDisplayMultiplier,
    kesPerUsd,
    currency
  )
  const current = formatSummaryPrice(
    metrics,
    'current',
    displayCurrency,
    kesToDisplayMultiplier,
    kesPerUsd,
    currency
  )
  const initialInv = formatSummaryMoney(
    metrics.totalInitialInvestmentNative,
    metrics.totalCostInKES,
    ccy,
    displayCurrency,
    kesToDisplayMultiplier,
    kesPerUsd
  )
  const currentVal = formatCurrency(metrics.totalValueInKES, displayCurrency as 'USD', {
    kesToDisplayMultiplier,
    compact: true,
  })
  return (
    <dl className={cn('grid grid-cols-3 gap-x-2 gap-y-2 text-[11px]', className)}>
      <div>
        <dt className="text-muted-foreground">Shares</dt>
        <dd className="font-medium tabular-nums">{metrics.totalQuantity.toLocaleString()}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Avg buy</dt>
        <dd className="font-medium tabular-nums">{avgBuy}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Initial inv.</dt>
        <dd className="font-medium tabular-nums">{initialInv}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Current price</dt>
        <dd className="font-medium tabular-nums">{current}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Current val.</dt>
        <dd className="font-semibold tabular-nums">{currentVal}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Delta %</dt>
        <dd
          className={cn(
            'font-medium tabular-nums',
            positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}
        >
          {formatPercentage(metrics.gainPercent)}
        </dd>
      </div>
    </dl>
  )
}

export const STACK_DRILLDOWN_TABLE_COLUMNS = [
  'Shares',
  'Avg buy',
  'Initial inv.',
  'Current price',
  'Current val.',
  'Delta %',
] as const

interface StackDrilldownMetricsCellsProps extends StackDrilldownMetricsProps {
  name: ReactNode
  nameSubtitle?: ReactNode
}

export function StackDrilldownMetricsCells({
  metrics,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  currency,
  name,
  nameSubtitle,
}: StackDrilldownMetricsCellsProps) {
  const ccy = currency || metrics.currency
  const positive = metrics.gainPercent >= 0
  const avgBuy = formatSummaryPrice(
    metrics,
    'avgBuy',
    displayCurrency,
    kesToDisplayMultiplier,
    kesPerUsd,
    currency
  )
  const current = formatSummaryPrice(
    metrics,
    'current',
    displayCurrency,
    kesToDisplayMultiplier,
    kesPerUsd,
    currency
  )
  const initialInv = formatSummaryMoney(
    metrics.totalInitialInvestmentNative,
    metrics.totalCostInKES,
    ccy,
    displayCurrency,
    kesToDisplayMultiplier,
    kesPerUsd
  )
  const currentVal = formatCurrency(metrics.totalValueInKES, displayCurrency as 'USD', {
    kesToDisplayMultiplier,
    compact: true,
  })
  return (
    <>
      <TableCell className="min-w-[140px]">
        <div>{name}</div>
        {nameSubtitle ? <p className="text-xs text-muted-foreground">{nameSubtitle}</p> : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">{metrics.totalQuantity.toLocaleString()}</TableCell>
      <TableCell className="text-right tabular-nums">{avgBuy}</TableCell>
      <TableCell className="text-right tabular-nums">{initialInv}</TableCell>
      <TableCell className="text-right tabular-nums">{current}</TableCell>
      <TableCell className="text-right tabular-nums font-semibold">{currentVal}</TableCell>
      <TableCell
        className={cn(
          'text-right tabular-nums text-xs',
          positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        )}
      >
        {formatPercentage(metrics.gainPercent)}
      </TableCell>
    </>
  )
}
