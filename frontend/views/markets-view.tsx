'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, RefreshCcw, Search,
  ChevronDown, ChevronUp, ArrowRight, Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDateRelative } from '@/lib/format'
import { useAuth } from '@/hooks/use-auth'
import {
  getStocksWithPrices, refreshStockPrices, getStockPicks,
  type StockWithPrice, type StockPickRaw,
} from '@/services/markets'

// ─── Constants ────────────────────────────────────────────────────────────────

const MARKET_TABS = [
  { id: 'all',    label: 'All Markets' },
  { id: 'NSE',    label: '🇰🇪 NSE Kenya' },
  { id: 'Global', label: '🌍 Global' },
]

const SECTOR_COLORS: Record<string, string> = {
  Banking:       'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Technology:    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Energy:        'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  Healthcare:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Insurance:     'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  Manufacturing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Agriculture:   'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300',
  ETF:           'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  MMF:           'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
}

function sectorBadge(sector: string) {
  return SECTOR_COLORS[sector] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

const sentimentColors: Record<string, string> = {
  buy:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  hold:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  watch: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
}

// ─── Stock row ────────────────────────────────────────────────────────────────

function StockRow({ stock }: { stock: StockWithPrice }) {
  const isUp = stock.changePercent >= 0
  const hasPriceData = stock.hasPrice

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors border-b last:border-0">
      {/* Ticker */}
      <div className="w-20 shrink-0">
        <span className="rounded bg-secondary/10 px-2 py-0.5 text-xs font-bold text-secondary font-mono">
          {stock.ticker}
        </span>
      </div>

      {/* Company + sector */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{stock.companyName}</p>
        <span className={cn('mt-0.5 inline-block rounded-full px-2 py-px text-xs', sectorBadge(stock.sector))}>
          {stock.sector || 'Other'}
        </span>
      </div>

      {/* Price */}
      <div className="w-28 shrink-0 text-right">
        {hasPriceData ? (
          <>
            <p className="text-sm font-semibold">
              {stock.currency === 'USD'
                ? `$${stock.priceUSD.toFixed(2)}`
                : `KSh ${stock.priceKES.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </p>
            {stock.currency === 'USD' && stock.priceKES > 0 && (
              <p className="text-xs text-muted-foreground">
                KSh {stock.priceKES.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>

      {/* Change */}
      <div className={cn(
        'w-16 shrink-0 flex items-center justify-end gap-0.5 text-sm font-medium',
        !hasPriceData && 'text-muted-foreground',
        hasPriceData && (isUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'),
      )}>
        {hasPriceData ? (
          <>
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(stock.changePercent).toFixed(2)}%
          </>
        ) : '—'}
      </div>
    </div>
  )
}

// ─── Sector group ─────────────────────────────────────────────────────────────

function SectorGroup({ sector, stocks }: { sector: string; stocks: StockWithPrice[] }) {
  const [open, setOpen] = useState(true)
  const withPrice = stocks.filter((s) => s.hasPrice).length

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between bg-muted/30 px-4 py-2 text-left text-sm font-semibold hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-xs', sectorBadge(sector))}>
            {sector}
          </span>
          <span className="text-muted-foreground font-normal">
            {stocks.length} stock{stocks.length !== 1 ? 's' : ''}
            {withPrice > 0 && ` · ${withPrice} priced`}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && stocks.map((s) => <StockRow key={s.name} stock={s} />)}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function MarketsView() {
  const { isAuthenticated } = useAuth()
  const [activeMarket, setActiveMarket] = useState('all')
  const [search, setSearch] = useState('')
  const [stocks, setStocks] = useState<StockWithPrice[]>([])
  const [picks, setPicks] = useState<StockPickRaw[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [groupBySector, setGroupBySector] = useState(true)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [stockList, stockPicks] = await Promise.all([
        getStocksWithPrices(),
        getStockPicks().catch(() => []),
      ])
      setStocks(stockList)
      setPicks(stockPicks)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleRefresh = async () => {
    if (!isAuthenticated) return
    setIsRefreshing(true)
    setRefreshMsg('')
    try {
      const result = await refreshStockPrices()
      if (result.queued) {
        setRefreshMsg(result.message ?? 'Price refresh started in the background.')
      } else {
        setRefreshMsg(`Updated: NSE ${result.nse_updated ?? 0} · Global ${result.global_updated ?? 0}`)
      }
      await loadData()
    } catch (err) {
      setRefreshMsg(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setIsRefreshing(false)
    }
  }

  // Filter stocks
  const filtered = useMemo(() => {
    let list = stocks
    if (activeMarket !== 'all') list = list.filter((s) => s.market === activeMarket)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          s.companyName.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q)
      )
    }
    return list
  }, [stocks, activeMarket, search])

  // Group by sector
  const sectors = useMemo(() => {
    if (!groupBySector) return {}
    const map: Record<string, StockWithPrice[]> = {}
    filtered.forEach((s) => {
      const sec = s.sector || 'Other'
      if (!map[sec]) map[sec] = []
      map[sec].push(s)
    })
    return map
  }, [filtered, groupBySector])

  // Last updated time
  const lastUpdated = useMemo(() => {
    const priced = stocks.filter((s) => s.fetchedAt)
    if (!priced.length) return null
    const latest = priced.reduce((a, b) => (a.fetchedAt > b.fetchedAt ? a : b))
    return latest.fetchedAt
  }, [stocks])

  const pricedCount = filtered.length

  return (
    <div className="mx-auto max-w-5xl space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Markets</h1>
          <p className="text-sm text-muted-foreground">
            {stocks.length} stock{stocks.length !== 1 ? 's' : ''} with price and daily change
            {lastUpdated && (
              <span className="ml-2">· Updated {formatDateRelative(lastUpdated)}</span>
            )}
          </p>
          {refreshMsg && (
            <p className="mt-1 text-xs text-primary">{refreshMsg}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="gap-2"
            >
              {isRefreshing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCcw className="h-4 w-4" />}
              {isRefreshing ? 'Updating all APIs…' : 'Refresh Prices'}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Sign in to refresh prices</p>
          )}
        </div>
      </div>

      {/* Market tabs + search */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1">
          {MARKET_TABS.map((tab) => (
            <Button
              key={tab.id}
              variant={activeMarket === tab.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveMarket(tab.id)}
              className="h-8 shrink-0 text-xs"
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search ticker, company, sector…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setGroupBySector((v) => !v)}
          className="h-8 text-xs text-muted-foreground"
        >
          {groupBySector ? 'Flat list' : 'Group by sector'}
        </Button>
      </div>

      {/* Stock list */}
      <Card className="overflow-hidden">
        {/* Column headers */}
        <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
          <div className="w-20 shrink-0">Ticker</div>
          <div className="flex-1">Company / Sector</div>
          <div className="w-28 shrink-0 text-right">Price</div>
          <div className="w-16 shrink-0 text-right">Change</div>
        </div>

        {isLoading ? (
          <div className="space-y-0 divide-y">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-5 w-16 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Search className="mx-auto h-8 w-8 opacity-40" />
            <p className="mt-2">
              {search
                ? `No stocks match "${search}" with a live price and change.`
                : 'No listed stocks have both a live price and change % yet. Sign in and use Refresh Prices, or check your Growe Price API records.'}
            </p>
          </div>
        ) : groupBySector ? (
          <div className="divide-y">
            {Object.entries(sectors)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([sector, sectorStocks]) => (
                <SectorGroup key={sector} sector={sector} stocks={sectorStocks} />
              ))}
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((s) => <StockRow key={s.name} stock={s} />)}
          </div>
        )}

        {/* Footer stats */}
        {!isLoading && filtered.length > 0 && (
          <div className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            Listed instruments have a cached price and daily change %. Refresh runs every
            configured provider (in order), twice for symbols that still lack data, with
            portfolio tickers fetched first.
          </div>
        )}
      </Card>

      {/* Weekly Picks */}
      {picks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weekly Stock Picks</CardTitle>
            <p className="text-sm text-muted-foreground">Curated insights from the Sumstack team</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {picks.map((pick) => (
              <div key={pick.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {pick.ticker && (
                    <span className="rounded bg-secondary/10 px-2 py-0.5 text-xs font-bold text-secondary font-mono">
                      {pick.ticker}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{pick.market}</span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                    sentimentColors[pick.sentiment] ?? sentimentColors.watch,
                  )}>
                    {pick.sentiment}
                  </span>
                  {pick.isPro && (
                    <Badge variant="secondary" className="text-xs">PRO</Badge>
                  )}
                </div>
                <h3 className="font-semibold text-sm">{pick.title}</h3>
                <div
                  className="text-sm text-muted-foreground line-clamp-3 prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: pick.commentary }}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Partner CTA */}
      <Card className="border-secondary/30 bg-secondary/5">
        <CardContent className="flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Start Trading Global Stocks</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Open a Scope Markets account and invest in 10,000+ global securities.
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-2 border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground">
            Open Account <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
