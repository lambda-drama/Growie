'use client'

import { ChevronRight } from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/format'
import type { AssetCategoryGroup } from '@/lib/dashboard-data'
import { StackBucketIcon } from '@/components/stack/stack-bucket-icon'
import { cn } from '@/lib/utils'

interface StackCategoryListProps {
  groups: AssetCategoryGroup[]
  currency: string
  kesToDisplayMultiplier: number
  onOpenCategory: (category: string) => void
}

export function StackCategoryList({
  groups,
  currency,
  kesToDisplayMultiplier,
  onOpenCategory,
}: StackCategoryListProps) {
  if (groups.length === 0) return null

  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        My stack
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {groups.map((row) => {
          const positive = row.gainPercent >= 0
          return (
            <li key={row.category}>
              <button
                type="button"
                onClick={() => onOpenCategory(row.category)}
                className="flex w-full items-center gap-3 px-3 py-3.5 text-left transition-colors hover:bg-muted/50 active:bg-muted sm:gap-4 sm:px-4 sm:py-4"
              >
                <StackBucketIcon label={row.category} kind="security" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground sm:text-base">
                    {row.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground sm:text-sm">
                    {row.holdings.length} position{row.holdings.length === 1 ? '' : 's'}
                    {row.tickersPreview && row.tickersPreview !== '—'
                      ? ` · ${row.tickersPreview}`
                      : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums sm:text-base">
                    {formatCurrency(row.totalValueKES, currency as 'KES', {
                      kesToDisplayMultiplier,
                      compact: true,
                    })}
                  </span>
                  <span
                    className={cn(
                      'block text-xs font-medium tabular-nums sm:text-sm',
                      positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {formatPercentage(row.gainPercent)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
