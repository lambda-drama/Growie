'use client'

import { useMemo } from 'react'
import { RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  NetPortfolioChart,
  DashboardAllocation,
  MetricCards,
  MyStackPanel,
  GoalsSnapshot,
  DashboardBarbsAI,
} from '@/components/dashboard'
import { usePortfolio } from '@/hooks/use-portfolio'
import { useGoals } from '@/hooks/use-goals'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/lib/store'
import { computeDashboardMetrics } from '@/lib/dashboard-data'
import { useFrappeCurrencySync } from '@/hooks/use-frappe-currency'
import { cn } from '@/lib/utils'

export function DashboardView() {
  useFrappeCurrencySync()
  const { isAuthenticated } = useAuth()
  const { setAuthModal } = useAppStore()
  const { holdings, summary, isLoading, error, refresh } = usePortfolio()
  const { goals, isLoading: goalsLoading } = useGoals()

  const metrics = useMemo(
    () => computeDashboardMetrics(holdings, summary),
    [holdings, summary]
  )

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Your portfolio at a glance</p>
        </div>
        <div className="rounded-lg border-2 border-dashed border-muted p-12 text-center">
          <h3 className="text-lg font-semibold">Sign in to view your dashboard</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            See allocation, performance by asset class, and goal progress.
          </p>
          <Button className="mt-4" onClick={() => setAuthModal('login')}>
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  const busy = isLoading && holdings.length === 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Aggregated view of your stack — expand each asset category for individual holdings.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={refresh} disabled={isLoading}>
          <RefreshCcw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {busy ? (
        <div className="space-y-4">
          <Skeleton className="h-[320px] w-full rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <NetPortfolioChart holdings={holdings} gainPercent={metrics.gainPercent} />
            <DashboardAllocation holdings={holdings} />
          </div>

          <MetricCards metrics={metrics} />

          <div className="grid gap-4 lg:grid-cols-2">
            <MyStackPanel holdings={holdings} />
            {goalsLoading && goals.length === 0 ? (
              <Skeleton className="h-[320px] w-full rounded-xl" />
            ) : (
              <GoalsSnapshot goals={goals} />
            )}
          </div>

          <DashboardBarbsAI />
        </>
      )}
    </div>
  )
}
