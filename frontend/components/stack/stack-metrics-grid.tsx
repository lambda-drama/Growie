'use client'

import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatPercentage } from '@/lib/format'
import type { DashboardMetrics } from '@/lib/dashboard-data'
import { cn } from '@/lib/utils'

interface StackMetricsGridProps {
  metrics: DashboardMetrics
  totalPositions: number
  assetClassCount: number
  currency: string
  kesToDisplayMultiplier: number
}

function MiniMetric({
  label,
  value,
  sub,
  subClassName,
}: {
  label: string
  value: string
  sub?: string
  subClassName?: string
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="p-3.5 sm:p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
          {label}
        </p>
        <p className="mt-1 text-lg font-bold tabular-nums text-foreground sm:text-xl">{value}</p>
        {sub ? (
          <p className={cn('mt-0.5 text-xs font-medium', subClassName)}>{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function StackMetricsGrid({
  metrics,
  totalPositions,
  assetClassCount,
  currency,
  kesToDisplayMultiplier,
}: StackMetricsGridProps) {
  const fmt = (n: number, compact = true) =>
    formatCurrency(n, currency as 'KES', { kesToDisplayMultiplier, compact })

  const monthPos = metrics.monthlyGrowthPercent >= 0
  const healthWarm = metrics.healthScore >= 60 && metrics.healthScore < 80

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <MiniMetric
        label="Monthly growth"
        value={fmt(Math.abs(metrics.monthlyGrowthKES))}
        sub={formatPercentage(metrics.monthlyGrowthPercent)}
        subClassName={monthPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
      />
      <MiniMetric
        label="Earnings YTD"
        value={fmt(Math.abs(metrics.gainKES))}
        sub={formatPercentage(metrics.gainPercent)}
        subClassName={
          metrics.gainPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }
      />
      <MiniMetric
        label="Total assets"
        value={String(totalPositions)}
        sub={`${assetClassCount} class${assetClassCount === 1 ? '' : 'es'}`}
        subClassName="text-muted-foreground"
      />
      <MiniMetric
        label="Health score"
        value={`${metrics.healthScore}/100`}
        sub={metrics.healthLabel}
        subClassName={
          healthWarm
            ? 'text-amber-600 dark:text-amber-400'
            : metrics.healthScore >= 60
              ? 'text-green-600 dark:text-green-400'
              : 'text-muted-foreground'
        }
      />
    </div>
  )
}
