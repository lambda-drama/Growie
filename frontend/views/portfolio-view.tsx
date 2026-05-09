'use client'

import { PortfolioSummary, PortfolioAnalytics, HoldingsTable, HealthScoreCard } from '@/components/portfolio'
import { usePortfolio } from '@/hooks/use-portfolio'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'
import { RefreshCcw } from 'lucide-react'

export function PortfolioView() {
  const { isAuthenticated } = useAuth()
  const { setAuthModal } = useAppStore()
  const { isLoading, error, refresh } = usePortfolio()

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
          <p className="text-muted-foreground">Track and manage your investments</p>
        </div>
        <div className="rounded-lg border-2 border-dashed border-muted p-12 text-center">
          <h3 className="text-lg font-semibold">Sign in to view your portfolio</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your holdings, performance, and asset allocation.
          </p>
          <Button className="mt-4" onClick={() => setAuthModal('login')}>
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
          <p className="text-muted-foreground">
            Track and manage your investments — use <span className="font-medium text-foreground">Import Excel</span> in Your
            Holdings for bulk upload.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={refresh} disabled={isLoading}>
          <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-[420px] w-full rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <PortfolioSummary />
          <PortfolioAnalytics />
          <HealthScoreCard />
          <HoldingsTable />
        </>
      )}
    </div>
  )
}
