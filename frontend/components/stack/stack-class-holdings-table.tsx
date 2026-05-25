'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  effectiveAvgBuyNative,
  formatCurrency,
  formatDate,
  formatHoldingMoney,
  formatHoldingPositionValue,
  formatPercentage,
} from '@/lib/format'
import { groupHoldingsByTicker, type StackTickerGroup } from '@/lib/stack-ticker-groups'
import type { StackHolding } from '@/services/stack'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'

interface StackClassHoldingsTableProps {
  holdings: StackHolding[]
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
}

function HoldingTableRow({
  holding,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  onBuy,
  onSell,
  lotMode,
}: {
  holding: StackHolding
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
  lotMode?: boolean
}) {
  const positive = (holding.gainPercent ?? 0) >= 0
  const ccy = (holding.currency || 'USD') as 'USD'

  return (
    <TableRow className={lotMode ? 'bg-muted/25' : undefined}>
      <TableCell className={lotMode ? 'pl-10' : undefined}>
        {lotMode ? (
          <>
            <span className="font-medium">Lot · {formatDate(holding.dateAdded)}</span>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{holding.name}</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{holding.ticker || holding.name}</span>
              {holding.marketTag && (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {holding.marketTag}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{holding.name}</p>
          </>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{holding.quantity.toLocaleString()}</TableCell>
      <TableCell className="text-right tabular-nums hidden sm:table-cell">
        {formatHoldingMoney(effectiveAvgBuyNative(holding), ccy, displayCurrency as 'USD', {
          kesToDisplayMultiplier,
          kesPerUsd,
          compact: true,
        })}
      </TableCell>
      <TableCell className="text-right tabular-nums hidden md:table-cell">
        {formatHoldingMoney(holding.currentPrice, ccy, displayCurrency as 'USD', {
          kesToDisplayMultiplier,
          kesPerUsd,
          compact: true,
        })}
      </TableCell>
      <TableCell className="text-right">
        <span className="font-medium tabular-nums block">
          {formatHoldingPositionValue(holding, displayCurrency as 'USD', {
            kesToDisplayMultiplier,
            kesPerUsd,
            compact: true,
          })}
        </span>
        <span
          className={cn(
            'text-xs tabular-nums',
            positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}
        >
          {formatPercentage(holding.gainPercent)}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            className={STACK_BUY_BUTTON_CLASS}
            onClick={() => onBuy(holding)}
          >
            Buy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={STACK_SELL_BUTTON_CLASS}
            onClick={() => onSell(holding)}
          >
            Sell
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function GroupSummaryRow({
  group,
  displayCurrency,
  kesToDisplayMultiplier,
  open,
  onToggle,
}: {
  group: StackTickerGroup
  displayCurrency: string
  kesToDisplayMultiplier: number
  open: boolean
  onToggle: () => void
}) {
  const positive = group.gainPercent >= 0
  const multi = group.lotCount > 1

  return (
    <TableRow
      className={cn(multi && 'cursor-pointer hover:bg-muted/40')}
      onClick={multi ? onToggle : undefined}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          {multi ? (
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
            />
          ) : null}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{group.ticker}</span>
              {group.marketTag ? (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {group.marketTag}
                </Badge>
              ) : null}
              {multi ? (
                <Badge variant="outline" className="text-[10px] font-normal">
                  {group.lotCount} lots
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{group.displayName}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {group.totalQuantity.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums hidden sm:table-cell text-muted-foreground">
        —
      </TableCell>
      <TableCell className="text-right tabular-nums hidden md:table-cell text-muted-foreground">
        —
      </TableCell>
      <TableCell className="text-right">
        <span className="font-medium tabular-nums block">
          {formatCurrency(group.totalValueInKES, displayCurrency as 'USD', {
            kesToDisplayMultiplier,
            compact: true,
          })}
        </span>
        <span
          className={cn(
            'text-xs tabular-nums',
            positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}
        >
          {formatPercentage(group.gainPercent)}
        </span>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()} />
    </TableRow>
  )
}

function TickerGroupTableRows({
  group,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  onBuy,
  onSell,
}: {
  group: StackTickerGroup
  displayCurrency: string
  kesToDisplayMultiplier: number
  kesPerUsd: number
  onBuy: (h: StackHolding) => void
  onSell: (h: StackHolding) => void
}) {
  const singleLot = group.lotCount === 1
  const [open, setOpen] = useState(false)

  if (singleLot) {
    return (
      <HoldingTableRow
        holding={group.holdings[0]}
        displayCurrency={displayCurrency}
        kesToDisplayMultiplier={kesToDisplayMultiplier}
        kesPerUsd={kesPerUsd}
        onBuy={onBuy}
        onSell={onSell}
      />
    )
  }

  return (
    <>
      <GroupSummaryRow
        group={group}
        displayCurrency={displayCurrency}
        kesToDisplayMultiplier={kesToDisplayMultiplier}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      {open
        ? group.holdings.map((h) => (
            <HoldingTableRow
              key={h.id}
              holding={h}
              displayCurrency={displayCurrency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
              kesPerUsd={kesPerUsd}
              onBuy={onBuy}
              onSell={onSell}
              lotMode
            />
          ))
        : null}
    </>
  )
}

export function StackClassHoldingsTable({
  holdings,
  displayCurrency,
  kesToDisplayMultiplier,
  kesPerUsd,
  onBuy,
  onSell,
}: StackClassHoldingsTableProps) {
  const groups = useMemo(() => groupHoldingsByTicker(holdings), [holdings])

  if (groups.length === 0) return null

  return (
    <div className="hidden overflow-hidden rounded-xl border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Stock</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="text-right hidden sm:table-cell">Avg buy</TableHead>
            <TableHead className="text-right hidden md:table-cell">Current</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="w-[140px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TickerGroupTableRows
              key={group.key}
              group={group}
              displayCurrency={displayCurrency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
              kesPerUsd={kesPerUsd}
              onBuy={onBuy}
              onSell={onSell}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
