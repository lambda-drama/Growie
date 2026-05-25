'use client'

import type { ReactNode } from 'react'
import { StackHoldingRowCard } from '@/components/stack/stack-holding-row-card'
import type { StackHolding } from '@/services/stack'

interface StackHoldingsCardsProps {
  holdings: StackHolding[]
  currency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  displayCurrency: string
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
  emptyActions?: ReactNode
  emptyMessage?: string
}

/** Flat list of holding cards (legacy; class view uses StackTickerGroups). */
export function StackHoldingsCards({
  holdings,
  currency,
  kesToDisplayMultiplier,
  kesPerUsd,
  displayCurrency,
  onBuy,
  onSell,
  emptyActions,
  emptyMessage,
}: StackHoldingsCardsProps) {
  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground md:hidden">
        <p>{emptyMessage ?? 'No positions in this class yet.'}</p>
        {emptyActions ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">{emptyActions}</div>
        ) : null}
      </div>
    )
  }

  return (
    <ul className="space-y-3 md:hidden">
      {holdings.map((h) => (
        <li key={h.id}>
          <StackHoldingRowCard
            holding={h}
            displayCurrency={displayCurrency}
            kesToDisplayMultiplier={kesToDisplayMultiplier}
            kesPerUsd={kesPerUsd}
            onBuy={onBuy}
            onSell={onSell}
          />
        </li>
      ))}
    </ul>
  )
}
