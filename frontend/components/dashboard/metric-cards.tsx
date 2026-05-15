'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatPercentage } from '@/lib/format'
import type { DashboardMetrics } from '@/lib/dashboard-data'
import { cn } from '@/lib/utils'

interface MetricCardsProps {
  metrics: DashboardMetrics
}

function MetricCard({
  label,
  value,
  sub,
  subPositive,
}: {
  label: string
  value: string
  sub?: string
  subPositive?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
        {sub ? (
          <p
            className={cn(
              'mt-1 text-xs font-medium',
              subPositive === true && 'text-green-600 dark:text-green-400',
              subPositive === false && 'text-red-600 dark:text-red-400',
              subPositive === undefined && 'text-muted-foreground'
            )}
          >
            {sub}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const fmt = (n: number, compact = true) =>
    formatCurrency(n, currency, { kesToDisplayMultiplier, compact })

  const gainPositive = metrics.gainPercent >= 0
  const monthPositive = metrics.monthlyGrowthPercent >= 0

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Total investments"
        value={fmt(metrics.totalCostKES)}
        sub={gainPositive ? formatPercentage(metrics.gainPercent) : formatPercentage(metrics.gainPercent)}
        subPositive={gainPositive}
      />
      <MetricCard
        label="Monthly growth"
        value={fmt(Math.abs(metrics.monthlyGrowthKES))}
        sub={formatPercentage(metrics.monthlyGrowthPercent)}
        subPositive={monthPositive}
      />
      <MetricCard
        label="Earnings (vs cost)"
        value={fmt(Math.abs(metrics.gainKES))}
        sub={formatPercentage(metrics.gainPercent)}
        subPositive={gainPositive}
      />
      <MetricCard
        label="Health score"
        value={`${metrics.healthScore} / 100`}
        sub={metrics.healthLabel}
        subPositive={metrics.healthScore >= 60 ? true : metrics.healthScore < 40 ? false : undefined}
      />
    </div>
  )
}
