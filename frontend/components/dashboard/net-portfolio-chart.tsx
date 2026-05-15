'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatPercentage } from '@/lib/format'
import { getNetPortfolioSeries } from '@/lib/dashboard-data'
import type { Holding } from '@/types'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

const RANGES = [
  { value: '3', label: '3 months', months: 3 },
  { value: '6', label: '6 months', months: 6 },
  { value: '12', label: '12 months', months: 12 },
] as const

interface NetPortfolioChartProps {
  holdings: Holding[]
  gainPercent: number
}

export function NetPortfolioChart({ holdings, gainPercent }: NetPortfolioChartProps) {
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const [range, setRange] = useState('6')

  const months = RANGES.find((r) => r.value === range)?.months ?? 6
  const data = useMemo(
    () => getNetPortfolioSeries(holdings, months),
    [holdings, months]
  )

  const latestValue = data[data.length - 1]?.valueKES ?? 0
  const isPositive = gainPercent >= 0

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Net Portfolio Tracker</CardTitle>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {formatCurrency(latestValue, currency, { kesToDisplayMultiplier })}
            </span>
            {holdings.length > 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-sm font-medium',
                  isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}
              >
                <TrendingUp className={cn('h-3.5 w-3.5', !isPositive && 'rotate-180')} />
                {formatPercentage(gainPercent)}
              </span>
            )}
          </div>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          {data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Add holdings to see portfolio growth over time.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6b9ae8" />
                    <stop offset="100%" stopColor="#1246a8" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    formatCurrency(Number(v), currency, {
                      kesToDisplayMultiplier,
                      compact: true,
                    })
                  }
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null
                    const row = payload[0].payload as (typeof data)[0]
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        <p className="font-semibold">
                          {formatCurrency(row.valueKES, currency, { kesToDisplayMultiplier })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          MoM {formatPercentage(row.monthGrowthPercent)}
                        </p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="valueKES" fill="url(#barGradient)" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
