'use client'

import { formatCurrency, formatPercentage } from '@/lib/format'
import { ASSET_CLASS_SHORT } from '@/lib/stack-ui'
import { getAssetClassColorHex } from '@/lib/format'
import type { StackClassSummary } from '@/services/stack'
import type { AssetClass } from '@/types'
import { cn } from '@/lib/utils'

interface StackHeroCardProps {
  totalValueKES: number
  monthlyGrowthPercent: number
  monthlyGrowthKES: number
  classes: StackClassSummary[]
  currency: string
  kesToDisplayMultiplier: number
}

export function StackHeroCard({
  totalValueKES,
  monthlyGrowthPercent,
  monthlyGrowthKES,
  classes,
  currency,
  kesToDisplayMultiplier,
}: StackHeroCardProps) {
  const positive = monthlyGrowthPercent >= 0
  const total = classes.reduce((s, c) => s + c.valueKES, 0) || totalValueKES || 1

  const segments = classes
    .filter((c) => c.valueKES > 0)
    .map((c) => ({
      assetClass: c.assetClass as AssetClass,
      pct: (c.valueKES / total) * 100,
      color: getAssetClassColorHex(c.assetClass),
    }))

  return (
    <section className="rounded-2xl bg-primary px-4 py-5 text-primary-foreground shadow-md sm:px-6 sm:py-6">
      <p className="text-sm font-medium text-primary-foreground/85">My stack</p>
      <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
        {formatCurrency(totalValueKES, currency as 'KES', { kesToDisplayMultiplier })}
      </p>
      <p className="mt-2 text-sm text-primary-foreground/90">
        <span className={cn('font-semibold', positive ? 'text-emerald-200' : 'text-red-200')}>
          {formatPercentage(monthlyGrowthPercent)}
        </span>
        <span className="text-primary-foreground/80"> this month </span>
        <span className={cn('font-medium', positive ? 'text-emerald-200' : 'text-red-200')}>
          {positive ? '+' : ''}
          {formatCurrency(monthlyGrowthKES, currency as 'KES', {
            kesToDisplayMultiplier,
            compact: true,
          })}
        </span>
      </p>

      {segments.length > 0 && (
        <div className="mt-5">
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-primary-foreground/20"
            role="img"
            aria-label="Asset allocation"
          >
            {segments.map((seg) => (
              <div
                key={seg.assetClass}
                className="h-full min-w-[2px] transition-all"
                style={{
                  width: `${Math.max(seg.pct, 0.5)}%`,
                  backgroundColor: seg.color,
                }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-primary-foreground/90">
            {segments.map((seg) => (
              <li key={seg.assetClass} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                {ASSET_CLASS_SHORT[seg.assetClass]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
