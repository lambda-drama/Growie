'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCcw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { StackBreadcrumb } from '@/components/stack/stack-breadcrumb'
import { StackSummaryCards } from '@/components/stack/stack-summary-cards'
import { StackTickerGroups } from '@/components/stack/stack-ticker-groups'
import { StackClassHoldingsTable } from '@/components/stack/stack-class-holdings-table'
import { StackExcelBulkImport } from '@/components/stack/stack-excel-bulk-import'
import { StackHoldingDetailSheet } from '@/components/stack/stack-holding-detail-sheet'
import { TradeDialog, type TradeMode } from '@/components/stack/trade-dialog'
import { useStackClass } from '@/hooks/use-stack'
import { useAppStore, useDisplayMoney } from '@/lib/store'
import { groupHoldingsByTicker } from '@/lib/stack-ticker-groups'
import type { StackHolding } from '@/services/stack'
import type { AssetClass } from '@/types'
import { cn } from '@/lib/utils'

interface StackClassViewProps {
  assetClass: AssetClass
  onBack: () => void
}

function filterHoldingsByQuery(holdings: StackHolding[], query: string): StackHolding[] {
  const q = query.trim().toLowerCase()
  if (!q) return holdings
  return holdings.filter((h) => {
    const ticker = (h.ticker || '').toLowerCase()
    const name = (h.name || '').toLowerCase()
    const tag = (h.marketTag || '').toLowerCase()
    return ticker.includes(q) || name.includes(q) || tag.includes(q)
  })
}

export function StackClassView({ assetClass, onBack }: StackClassViewProps) {
  const { detail, isLoading, error, refresh, reload } = useStackClass(assetClass)
  const { currency, kesToDisplayMultiplier, kesPerUsd } = useDisplayMoney()
  const { stackGroupingMode } = useAppStore()
  const [tradeOpen, setTradeOpen] = useState(false)
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy-new')
  const [activeHolding, setActiveHolding] = useState<StackHolding | null>(null)
  const [positionSearch, setPositionSearch] = useState('')
  const [detailHolding, setDetailHolding] = useState<StackHolding | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedTickerGroup, setSelectedTickerGroup] = useState<string | null>(null)
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)

  const showPositionSearch =
    assetClass === 'nse-stocks' || assetClass === 'global-stocks' || assetClass === 'etf'

  useEffect(() => {
    setPositionSearch('')
    setSelectedTickerGroup(null)
    setSelectedBucket(null)
  }, [assetClass])

  useEffect(() => {
    setSelectedTickerGroup(null)
    setSelectedBucket(null)
  }, [positionSearch, stackGroupingMode])

  const allHoldings = detail?.holdings ?? []
  const filteredHoldings = useMemo(
    () => filterHoldingsByQuery(allHoldings, positionSearch),
    [allHoldings, positionSearch]
  )
  const tickerGroupCount = useMemo(
    () => groupHoldingsByTicker(filteredHoldings).length,
    [filteredHoldings]
  )

  const openTrade = (mode: TradeMode, holding?: StackHolding) => {
    setTradeMode(mode)
    setActiveHolding(holding ?? null)
    setTradeOpen(true)
  }

  const openHoldingDetail = (holding: StackHolding) => {
    setDetailHolding(holding)
    setDetailOpen(true)
  }

  const summary = detail?.summary
  const showBulkImport = assetClass === 'global-stocks' || assetClass === 'etf'

  return (
    <div className="space-y-6">
      <StackBreadcrumb assetClass={assetClass} onOverview={onBack} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{detail?.label ?? 'Asset class'}</h1>
          <p className="text-muted-foreground">Positions in this class</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2 sm:flex-none"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCcw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          {showBulkImport && (
            <StackExcelBulkImport
              variant="compact"
              className="flex-1 sm:flex-none"
              onSuccess={reload}
              disabled={isLoading}
            />
          )}
          <Button className="flex-1 gap-2 sm:flex-none" size="sm" onClick={() => openTrade('buy-new')}>
            <Plus className="h-4 w-4" />
            Add position
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : summary ? (
        <>
          <StackSummaryCards
            totalValueKES={summary.totalValueKES}
            costKES={summary.totalCostKES}
            gainKES={summary.unrealizedGainKES}
            gainPercent={summary.gainPercent}
            positions={summary.positions}
          />

          {showPositionSearch && allHoldings.length > 0 && (
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={positionSearch}
                onChange={(e) => setPositionSearch(e.target.value)}
                placeholder="Search by ticker or company name…"
                className="h-10 pl-9 pr-9"
                aria-label="Search positions"
              />
              {positionSearch ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                  onClick={() => setPositionSearch('')}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
              {positionSearch.trim() && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {tickerGroupCount === 0
                    ? 'No tickers match your search.'
                    : `${tickerGroupCount} ticker${tickerGroupCount === 1 ? '' : 's'} · ${filteredHoldings.length} lot${
                        filteredHoldings.length === 1 ? '' : 's'
                      }`}
                </p>
              )}
            </div>
          )}

          <div className="md:hidden">
            <StackTickerGroups
              holdings={filteredHoldings}
              displayCurrency={currency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
              kesPerUsd={kesPerUsd}
              onOpenHolding={openHoldingDetail}
              onBuy={(h) => openTrade('buy-more', h)}
              onSell={(h) => openTrade('sell', h)}
              groupingMode={stackGroupingMode}
              selectedBucketKey={selectedBucket}
              onSelectBucket={(bucket) => {
                setSelectedTickerGroup(null)
                setSelectedBucket(bucket)
              }}
              onBackToBuckets={() => {
                setSelectedTickerGroup(null)
                setSelectedBucket(null)
              }}
              selectedGroupKey={selectedTickerGroup}
              onSelectGroup={(group) => setSelectedTickerGroup(group)}
              onBackToGroups={() => setSelectedTickerGroup(null)}
              emptyMessage={
                allHoldings.length > 0 && positionSearch.trim()
                  ? `No tickers match "${positionSearch.trim()}".`
                  : undefined
              }
              emptyActions={
                allHoldings.length === 0 ? (
                  showBulkImport ? (
                    <>
                      <StackExcelBulkImport onSuccess={reload} disabled={isLoading} />
                      <Button size="sm" className="gap-2" onClick={() => openTrade('buy-new')}>
                        <Plus className="h-4 w-4" />
                        Add position
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" className="gap-2" onClick={() => openTrade('buy-new')}>
                      <Plus className="h-4 w-4" />
                      Add position
                    </Button>
                  )
                ) : positionSearch.trim() && filteredHoldings.length === 0 ? (
                  <Button size="sm" variant="outline" onClick={() => setPositionSearch('')}>
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          </div>

          {filteredHoldings.length > 0 ? (
            <StackClassHoldingsTable
              holdings={filteredHoldings}
              displayCurrency={currency}
              kesToDisplayMultiplier={kesToDisplayMultiplier}
              kesPerUsd={kesPerUsd}
              onOpenHolding={openHoldingDetail}
              onBuy={(h) => openTrade('buy-more', h)}
              onSell={(h) => openTrade('sell', h)}
              groupingMode={stackGroupingMode}
              selectedBucketKey={selectedBucket}
              onSelectBucket={(bucket) => {
                setSelectedTickerGroup(null)
                setSelectedBucket(bucket)
              }}
              onBackToBuckets={() => {
                setSelectedTickerGroup(null)
                setSelectedBucket(null)
              }}
              selectedGroupKey={selectedTickerGroup}
              onSelectGroup={setSelectedTickerGroup}
              onBackToGroups={() => setSelectedTickerGroup(null)}
            />
          ) : allHoldings.length > 0 && positionSearch.trim() ? (
            <div className="hidden rounded-xl border py-12 text-center text-muted-foreground md:block">
              <p>No tickers match &ldquo;{positionSearch.trim()}&rdquo;.</p>
              <Button variant="link" size="sm" className="mt-2" onClick={() => setPositionSearch('')}>
                Clear search
              </Button>
            </div>
          ) : allHoldings.length === 0 ? (
            <div className="hidden rounded-xl border py-12 text-center md:block">
              <p className="text-muted-foreground">No positions in this class yet.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {showBulkImport && (
                  <StackExcelBulkImport onSuccess={reload} disabled={isLoading} />
                )}
                <Button size="sm" className="gap-2" onClick={() => openTrade('buy-new')}>
                  <Plus className="h-4 w-4" />
                  Add position
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <StackHoldingDetailSheet
        holding={detailHolding}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) setDetailHolding(null)
        }}
        onBuy={(h) => {
          setDetailOpen(false)
          openTrade('buy-more', h)
        }}
        onSell={(h) => {
          setDetailOpen(false)
          openTrade('sell', h)
        }}
        onEdit={(h) => {
          setDetailOpen(false)
          openTrade('buy-more', h)
        }}
        onDeleted={() => void reload()}
      />

      <TradeDialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        mode={tradeMode}
        holding={activeHolding}
        defaultAssetClass={assetClass}
        onSuccess={() => void refresh()}
      />
    </div>
  )
}
