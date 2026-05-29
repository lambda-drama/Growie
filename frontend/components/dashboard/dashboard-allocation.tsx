'use client'

import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency } from '@/lib/format'
import { getBucketIconColorHex } from '@/lib/stack-bucket-icons'
import { exchangeAllocationSlices } from '@/lib/dashboard-data'
import type { Holding } from '@/types'

interface DashboardAllocationProps {
  holdings: Holding[]
}

export function DashboardAllocation({ holdings }: DashboardAllocationProps) {
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const data = useMemo(() => exchangeAllocationSlices(holdings), [holdings])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Allocation by exchange
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No holdings yet
          </div>
        ) : (
          <>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {data.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={getBucketIconColorHex(entry.name, 'exchange')}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null
                      const row = payload[0].payload as (typeof data)[0]
                      return (
                        <div className="rounded-lg border border-border bg-card px-2 py-1.5 shadow-md text-sm">
                          <p className="font-medium">{row.name}</p>
                          <p className="text-muted-foreground">
                            {formatCurrency(row.value, currency, { kesToDisplayMultiplier })} (
                            {row.percentage}%)
                          </p>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 space-y-2">
              {data.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getBucketIconColorHex(item.name, 'exchange') }}
                    />
                    <span className="truncate text-foreground">{item.name}</span>
                  </div>
                  <span className="shrink-0 font-medium text-muted-foreground">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
