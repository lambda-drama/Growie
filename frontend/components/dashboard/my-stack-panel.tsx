'use client'

import { useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useAppStore, useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatPercentage, getAssetClassColorHex } from '@/lib/format'
import { groupByAssetClass, type AssetClassGroup } from '@/lib/dashboard-data'
import type { Holding } from '@/types'
import { cn } from '@/lib/utils'

interface MyStackPanelProps {
  holdings: Holding[]
}

function AssetClassRow({
  group,
  onOpenClass,
}: {
  group: AssetClassGroup
  onOpenClass: (assetClass: AssetClassGroup['assetClass']) => void
}) {
  const [open, setOpen] = useState(false)
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const positive = group.gainPercent >= 0

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          onClick={() => onOpenClass(group.assetClass)}
          className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: getAssetClassColorHex(group.assetClass) }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{group.name}</p>
            <p className="truncate text-xs text-muted-foreground">{group.tickersPreview}</p>
          </div>
          <div className="hidden shrink-0 text-right sm:block">
            <p className="text-sm font-semibold">
              {formatCurrency(group.totalValueKES, currency, { kesToDisplayMultiplier, compact: true })}
            </p>
            <p
              className={cn(
                'text-xs font-medium',
                positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {formatPercentage(group.gainPercent)}
            </p>
          </div>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 space-y-1 border-l-2 border-border ml-4 pl-3 py-1">
          {group.holdings.map((h) => {
            const hGain =
              h.costBasisKES > 0
                ? ((h.valueKES - h.costBasisKES) / h.costBasisKES) * 100
                : 0
            const hPos = hGain >= 0
            return (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
              >
                <span className="truncate font-medium">
                  {h.ticker || h.name}
                  {h.quantity > 0 ? (
                    <span className="ml-1 font-normal text-muted-foreground">
                      · {h.quantity.toLocaleString()} units
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-medium">
                    {formatCurrency(h.valueKES, currency, { kesToDisplayMultiplier, compact: true })}
                  </span>
                  <span
                    className={cn(
                      'text-xs',
                      hPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {formatPercentage(hGain)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function MyStackPanel({ holdings }: MyStackPanelProps) {
  const { setActiveTab, setStackNav } = useAppStore()
  const groups = groupByAssetClass(holdings)

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">My stack — Performance</CardTitle>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-primary"
          onClick={() => {
            setStackNav({ screen: 'overview' })
            setActiveTab('stack')
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add position
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No holdings yet. Add positions from My Stack to see them grouped by class here.
          </p>
        ) : (
          groups.map((g) => (
            <AssetClassRow
              key={g.assetClass}
              group={g}
              onOpenClass={(assetClass) => {
                setStackNav({ screen: 'class', assetClass })
                setActiveTab('stack')
              }}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}
