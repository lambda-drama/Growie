'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/lib/store'
import { formatCurrencyNative } from '@/lib/format'
import type { Currency } from '@/types'
import type { GroweGoal } from '@/services/goals'
import { cn } from '@/lib/utils'

interface GoalsSnapshotProps {
  goals: GroweGoal[]
}

export function GoalsSnapshot({ goals }: GoalsSnapshotProps) {
  const { setActiveTab } = useAppStore()
  const snapshot = [...goals]
    .filter((g) => g.status !== 'Paused')
    .sort((a, b) => b.progressPercent - a.progressPercent)
    .slice(0, 4)

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Goals snapshot</CardTitle>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-primary"
          onClick={() => setActiveTab('goals')}
        >
          View all
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {snapshot.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No goals yet. Create a savings goal to track progress here.
          </p>
        ) : (
          snapshot.map((goal, i) => {
            const pct = Math.min(goal.progressPercent, 100)
            const ccy = (goal.currency || 'USD') as Currency
            return (
              <div key={goal.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{goal.goalName}</span>
                  <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
                </div>
                <Progress
                  value={pct}
                  className={cn(
                    'h-2',
                    i % 4 === 0 && '[&_[data-slot=progress-indicator]]:bg-green-500',
                    i % 4 === 1 && '[&_[data-slot=progress-indicator]]:bg-primary',
                    i % 4 === 2 && '[&_[data-slot=progress-indicator]]:bg-primary/80',
                    i % 4 === 3 && '[&_[data-slot=progress-indicator]]:bg-orange-500'
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {formatCurrencyNative(goal.currentAmount, ccy)} of{' '}
                  {formatCurrencyNative(goal.targetAmount, ccy)}
                </p>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
