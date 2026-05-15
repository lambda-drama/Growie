'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatPercentage } from '@/lib/format'
import { cn } from '@/lib/utils'

interface StackSummaryCardsProps {
  totalValueKES: number
  costKES: number
  gainKES: number
  gainPercent: number
  positions?: number
}

export function StackSummaryCards({
  totalValueKES,
  costKES,
  gainKES,
  gainPercent,
  positions,
}: StackSummaryCardsProps) {
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const positive = gainKES >= 0

  const items = [
    { label: 'Total value', value: formatCurrency(totalValueKES, currency, { kesToDisplayMultiplier }) },
    { label: 'Cost basis', value: formatCurrency(costKES, currency, { kesToDisplayMultiplier }) },
    {
      label: 'Unrealized gain',
      value: formatCurrency(gainKES, currency, { kesToDisplayMultiplier }),
      sub: formatPercentage(gainPercent),
      positive,
    },
    ...(positions !== undefined
      ? [{ label: 'Positions', value: String(positions), sub: undefined as string | undefined, positive: true }]
      : []),
  ]

  return (
    <div className={cn('grid gap-3', positions !== undefined ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3')}>
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{item.value}</p>
            {item.sub && (
              <p
                className={cn(
                  'text-sm font-medium tabular-nums',
                  item.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}
              >
                {item.sub}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
