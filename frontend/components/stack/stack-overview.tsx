'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StackHeroCard } from '@/components/stack/stack-hero-card'
import { StackMetricsGrid } from '@/components/stack/stack-metrics-grid'
import { StackClassList } from '@/components/stack/stack-class-list'
import { StackExcelBulkImport } from '@/components/stack/stack-excel-bulk-import'
import { TradeDialog } from '@/components/stack/trade-dialog'
import { useStackOverview } from '@/hooks/use-stack'
import { usePortfolio } from '@/hooks/use-portfolio'
import { useAuth } from '@/hooks/use-auth'
import { useDisplayMoney } from '@/lib/store'
import { computeDashboardMetrics } from '@/lib/dashboard-data'
import { firstNameFrom, timeGreeting } from '@/lib/stack-ui'
import type { StackClassSummary } from '@/services/stack'

interface StackOverviewProps {
  onOpenClass: (summary: StackClassSummary) => void
}

export function StackOverview({ onOpenClass }: StackOverviewProps) {
  const { user } = useAuth()
  const { classes, isLoading: stackLoading, refresh, reload: reloadStack } = useStackOverview()
  const { holdings, summary, isLoading: portfolioLoading, reload: reloadPortfolio } = usePortfolio()
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const [tradeOpen, setTradeOpen] = useState(false)

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
          <StackHeroCard
            totalValueKES={totals.value}
            monthlyGrowthPercent={metrics.monthlyGrowthPercent}
            monthlyGrowthKES={metrics.monthlyGrowthKES}
            classes={classes}
            currency={currency}
            kesToDisplayMultiplier={kesToDisplayMultiplier}
          />

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

          <StackClassList
            classes={classes}
            currency={currency}
            kesToDisplayMultiplier={kesToDisplayMultiplier}
            onOpenClass={onOpenClass}
          />
        </>
      )}

      <TradeDialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        mode="buy-new"
        onSuccess={refresh}
      />
    </div>
  )
}
