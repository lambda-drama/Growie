'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppStore, useDisplayMoney } from '@/lib/store'
import { getAssetClassName, getAssetClassColorHex, formatCurrency } from '@/lib/format'
import type { AssetClass } from '@/lib/types'

export function AllocationChart() {
  const holdings = useAppStore((s) => s.holdings)
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  
  const allocationData = useMemo(() => {
    const byClass: Record<AssetClass, number> = {
      'mmf': 0,
      'real-estate': 0,
      'nse-stocks': 0,
      'global-stocks': 0,
    }
    
    holdings.forEach((h) => {
      byClass[h.assetClass] += h.valueKES
    })
    
    const total = Object.values(byClass).reduce((a, b) => a + b, 0)
    
    return Object.entries(byClass)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => ({
        name: getAssetClassName(key),
        value,
        percentage: ((value / total) * 100).toFixed(1),
        color: getAssetClassColorHex(key),
      }))
  }, [holdings])

  const totalValue = holdings.reduce((sum, h) => sum + h.valueKES, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Asset Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocationData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {allocationData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="rounded-lg border border-border bg-card p-2 shadow-lg">
                        <p className="font-medium text-card-foreground">{data.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(data.value, currency, { kesToDisplayMultiplier })}{' '}
                          ({data.percentage}%)
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {allocationData.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <div className="flex-1 truncate">
                <p className="truncate text-xs font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.percentage}%</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
