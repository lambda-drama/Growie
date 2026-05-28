'use client'

import { useEffect } from 'react'
import { StackOverview } from '@/components/stack/stack-overview'
import { StackClassView } from '@/components/stack/stack-class-view'
import { useAppStore } from '@/lib/store'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import type { StackClassSummary } from '@/services/stack'

export function MyStackView() {
  const { isAuthenticated } = useAuth()
  const { setAuthModal, stackNav, setStackNav, hydrateStackGroupingMode } = useAppStore()

  useEffect(() => {
    hydrateStackGroupingMode()
  }, [hydrateStackGroupingMode])

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My stack</h1>
          <p className="text-muted-foreground">Track holdings and record buy/sell transactions</p>
        </div>
        <div className="rounded-lg border-2 border-dashed border-muted p-12 text-center">
          <h3 className="text-lg font-semibold">Sign in to manage your stack</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add positions, view performance by asset class, and review trade history.
          </p>
          <Button className="mt-4" onClick={() => setAuthModal('login')}>
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  const handleOpenClass = (row: StackClassSummary) => {
    setStackNav({ screen: 'class', assetClass: row.assetClass })
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-6 sm:space-y-6 sm:pb-8">
      {stackNav.screen === 'overview' && <StackOverview onOpenClass={handleOpenClass} />}

      {stackNav.screen === 'class' && (
        <StackClassView
          assetClass={stackNav.assetClass}
          onBack={() => setStackNav({ screen: 'overview' })}
        />
      )}
    </div>
  )
}
