'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { useAppStore, useDisplayMoney } from '@/lib/store'
import { formatCurrency } from '@/lib/format'
import { getHoldingMovement, type HoldingMovementPoint } from '@/services/portfolio'
import { useFrappeCurrencySync } from '@/hooks/use-frappe-currency'

type Period = 'monthly' | 'yearly'

function buildXAxisTicks(points: HoldingMovementPoint[], period: Period): string[] {
  if (!points.length) return []

  if (period === 'monthly') {
    return points.map((p) => p.label)
  }

  const total = points.length
  if (total <= 19) {
    return points.map((p) => p.label)
  }

  const step = Math.ceil(total / Math.floor(total / 4))
  return points
    .filter((_, i) => i === 0 || i === total - 1 || i % step === 0)
    .map((p) => p.label)
}

export function HoldingMovementChart() {
  useFrappeCurrencySync()

  const holdings = useAppStore((s) => s.holdings)
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const [selectedHolding, setSelectedHolding] = useState<string>('')
  const [period, setPeriod] = useState<Period>('yearly')
  const [points, setPoints] = useState<HoldingMovementPoint[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!selectedHolding && holdings.length > 0) {
      setSelectedHolding(holdings[0].id)
    }
  }, [holdings, selectedHolding])

  useEffect(() => {
    if (!selectedHolding) return
    setIsLoading(true)
    getHoldingMovement(selectedHolding, period)
      .then((res) => setPoints(res?.points ?? []))
      .finally(() => setIsLoading(false))
  }, [selectedHolding, period])

  const selectedName = useMemo(
    () => holdings.find((h) => h.id === selectedHolding)?.name ?? '',
    [holdings, selectedHolding]
  )

  const ticks = useMemo(() => buildXAxisTicks(points, period), [points, period])

  const yDomain = useMemo(() => {
    if (!points.length) return ['auto', 'auto'] as const
    const values = points.map((p) => p.valueKES)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = (max - min) * 0.1
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [points])

  const rangeLabel = useMemo(() => {
    if (!points.length) return ''
    if (period === 'monthly') return `Last 12 months — ${points[0].label} to ${points.at(-1)?.label}`
    return `Since inception — ${points[0].label} to ${points.at(-1)?.label}`
  }, [points, period])

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Holding Movement</CardTitle>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <Select value={selectedHolding} onValueChange={setSelectedHolding}>
          <SelectTrigger><SelectValue placeholder="Select holding" /></SelectTrigger>
          <SelectContent>
            {holdings.map((h) => (
              <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isLoading ? (
          <div className="flex h-[190px] items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground">Select a holding to view movement.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">{selectedName}</p>
              <p className="text-xs text-muted-foreground">{rangeLabel}</p>
            </div>

            <div className="h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                  <XAxis
                    dataKey="label"
                    ticks={ticks}
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      formatCurrency(v, currency, { kesToDisplayMultiplier, compact: true })
                    }
                    width={64}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const data = payload[0].payload as HoldingMovementPoint
                      return (
                        <div className="rounded border bg-card p-2 text-sm shadow-md">
                          <p className="text-xs text-muted-foreground">
                            {period === 'monthly' ? data.label : `Year ${data.label}`}
                          </p>
                          <p className="font-semibold">
                            {formatCurrency(data.valueKES, currency, { kesToDisplayMultiplier })}
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="valueKES"
                    stroke="#0D9488"
                    strokeWidth={2}
                    dot={points.length <= 24}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}