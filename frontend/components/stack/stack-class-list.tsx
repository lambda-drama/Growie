'use client'

import { ChevronRight } from 'lucide-react'
import { formatCurrency, formatPercentage, getAssetClassColorHex } from '@/lib/format'
import {
  ASSET_CLASS_INITIAL,
  ASSET_CLASS_MOBILE_LABEL,
  stackPositionsLabel,
} from '@/lib/stack-ui'
import type { StackClassSummary } from '@/services/stack'
import type { AssetClass } from '@/types'
import { cn } from '@/lib/utils'

interface StackClassListProps {
  classes: StackClassSummary[]
  currency: string
  kesToDisplayMultiplier: number
  onOpenClass: (summary: StackClassSummary) => void
}

function iconTint(assetClass: AssetClass): string {
  const map: Record<AssetClass, string> = {
    'nse-stocks': 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    mmf: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    'real-estate': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
    'global-stocks': 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  }
  return map[assetClass]
}

export function StackClassList({ classes, currency, kesToDisplayMultiplier, onOpenClass }: StackClassListProps) {
  if (classes.length === 0) return null

  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        My stack
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {classes.map((row) => {
          const ac = row.assetClass as AssetClass
          const positive = row.gainPercent >= 0
          return (
            <li key={row.assetClass}>
              <button
                type="button"
                onClick={() => onOpenClass(row)}
                className="flex w-full items-center gap-3 px-3 py-3.5 text-left transition-colors hover:bg-muted/50 active:bg-muted sm:gap-4 sm:px-4 sm:py-4"
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold sm:h-11 sm:w-11',
                    iconTint(ac)
                  )}
                  style={{ boxShadow: `inset 0 0 0 1px ${getAssetClassColorHex(ac)}22` }}
                >
                  {ASSET_CLASS_INITIAL[ac]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground sm:text-base">
                    {ASSET_CLASS_MOBILE_LABEL[ac]}
                  </span>
                  <span className="block text-xs text-muted-foreground sm:text-sm">
                    {stackPositionsLabel(ac, row.positions)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums sm:text-base">
                    {formatCurrency(row.valueKES, currency as 'KES', {
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
