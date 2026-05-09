'use client'

import { ArrowRight, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400'
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function getProgressColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function HealthScoreCard() {
  const { healthScore, setActiveTab } = useAppStore()

  if (!healthScore) return null

  const topComponents = healthScore.components.slice(0, 3)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Financial Health Score</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setActiveTab('analysis')}
        >
          View Details
          <ArrowRight className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent>
        {/* Score Ring */}
        <div className="flex items-center gap-6">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${healthScore.totalScore * 2.51} 251`}
                className={getScoreColor(healthScore.totalScore)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn('text-2xl font-bold', getScoreColor(healthScore.totalScore))}>
                {healthScore.totalScore}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
          </div>
          
          {/* Components Summary */}
          <div className="flex-1 space-y-3">
            {topComponents.map((component) => (
              <div key={component.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{component.name}</span>
                  <span className="font-medium">{component.score}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-all', getProgressColor(component.score))}
                    style={{ width: `${component.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Tip */}
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-accent/10 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-sm text-muted-foreground">
            {topComponents[0]?.tip || 'Keep tracking your investments to improve your score.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
