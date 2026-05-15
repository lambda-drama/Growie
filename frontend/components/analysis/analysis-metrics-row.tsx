'use client'

import { Shield } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatPercentage } from '@/lib/format'
import { cn } from '@/lib/utils'

interface AnalysisMetricsRowProps {
  totalValueKES: number
  gainPercent6Mo: number
  diversificationScore: number
  diversificationLabel: string
  riskLevel: string
  riskSub: string
  aiConfidence: number
}

function MiniSparkline({ positive }: { positive: boolean }) {
  const points = positive
    ? '4,28 12,22 20,18 28,14 36,10 44,8 52,12 60,6'
    : '4,8 12,12 20,14 28,18 36,20 44,22 52,18 60,24'
  return (
    <svg viewBox="0 0 64 32" className="mt-3 h-10 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2" points={points} />
      <polygon fill="url(#sparkGrad)" points={`${points} 60,32 4,32`} />
    </svg>
  )
}

function ConfidenceRing({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  const label = pct >= 80 ? 'High' : pct >= 60 ? 'Moderate' : 'Building'

  return (
    <div className="mt-2 flex items-center gap-4">
      <div
        className="relative flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full p-[3px] [--confidence-track:#e5e7eb] dark:[--confidence-track:#374151]"
        style={{
          background: `conic-gradient(#22c55e 0deg, #22c55e ${pct * 3.6}deg, var(--confidence-track) ${pct * 3.6}deg)`,
        }}
        aria-hidden
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-card text-sm font-bold tabular-nums text-foreground">
          {pct}%
        </span>
      </div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

export function AnalysisMetricsRow({
  totalValueKES,
  gainPercent6Mo,
  diversificationScore,
  diversificationLabel,
  riskLevel,
  riskSub,
  aiConfidence,
}: AnalysisMetricsRowProps) {
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const positive = gainPercent6Mo >= 0

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Portfolio value</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {formatCurrency(totalValueKES, currency, { kesToDisplayMultiplier })}
          </p>
          <p
            className={cn(
              'text-xs font-medium',
              positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {formatPercentage(gainPercent6Mo)} vs last 6 months
          </p>
          <MiniSparkline positive={positive} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Diversification score</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {diversificationScore}{' '}
            <span className="text-base font-normal text-muted-foreground">/ 100</span>
          </p>
          <p className="text-xs font-medium text-muted-foreground">{diversificationLabel}</p>
          <div className="mt-3">
            <Progress value={diversificationScore} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Risk level</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{riskLevel}</p>
              <p className="text-xs text-muted-foreground">{riskSub}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground">AI confidence</p>
          <ConfidenceRing value={aiConfidence} />
        </CardContent>
      </Card>
    </div>
  )
}
