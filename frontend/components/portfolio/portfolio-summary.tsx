'use client'

import { TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatPercentage } from '@/lib/format'
import { usePortfolio } from '@/hooks/use-portfolio'
import { Skeleton } from '@/components/ui/skeleton'
import { useFrappeCurrencySync } from '@/hooks/use-frappe-currency'

export function PortfolioSummary() {
  useFrappeCurrencySync()

  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const { holdings, summary, isLoading } = usePortfolio()

  const totalValue = summary?.totalValueKES ?? holdings.reduce((s, h) => s + h.valueKES, 0)
  const gainKES = summary?.gainKES ?? 0
  const gainPercent = summary?.gainPercent ?? 0
  const isPositive = gainKES >= 0
  const lastUpdated = holdings.length > 0
    ? (() => {
        const dates = holdings.map((h) => h.lastUpdated).filter(Boolean).sort()
        return dates.at(-1) ? new Date(dates.at(-1)!).toLocaleDateString() : 'Today'
      })()
    : '—'

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />
  }

  return (
    <Card className="bg-linear-to-br from-primary to-primary/80 text-primary-foreground">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-primary-foreground/80">
              Total Portfolio Value
            </p>
            <h2 className="mt-1 text-3xl font-bold">
              {formatCurrency(totalValue, currency, { kesToDisplayMultiplier })}
            </h2>
            {summary && (
              <div className="mt-2 flex items-center gap-1.5">
                {isPositive ? (
                  <TrendingUp className="h-4 w-4 text-green-300" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-300" />
                )}
                <span className={isPositive ? 'text-green-300' : 'text-red-300'}>
                  {formatCurrency(Math.abs(gainKES), currency, { kesToDisplayMultiplier })}
                </span>
                <span className={`text-sm ${isPositive ? 'text-green-300' : 'text-red-300'}`}>
                  ({formatPercentage(Math.abs(gainPercent))})
                </span>
                <span className="text-xs text-primary-foreground/60">vs cost basis</span>
              </div>
            )}
          </div>
          <div className="rounded-full bg-primary-foreground/10 p-3">
            <Wallet className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-primary-foreground/20 pt-4">
          <div>
            <p className="text-xs text-primary-foreground/70">Holdings</p>
            <p className="text-lg font-semibold">{holdings.length} assets</p>
          </div>
          <div>
            <p className="text-xs text-primary-foreground/70">Last Updated</p>
            <p className="text-lg font-semibold">{lastUpdated}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}