'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppStore, useDisplayMoney } from '@/lib/store'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Currency } from '@/types'
import { useFrappeCurrencySync } from '@/hooks/use-frappe-currency'
import {
  type ChartPeriod,
  type PortfolioViewLevel,
  buildTimelineBuckets,
  buildPortfolioHoldingLineRows,
  buyUnitPrice,
  currentUnitPrice,
  getFirstInvestmentDate,
  groupByTicker,
  holdingLineLabel,
  lineColorForIndex,
  LINE_PALETTE,
} from '@/lib/portfolio-chart-data'
import { Maximize2 } from 'lucide-react'

function shortAxisMoney(v: number, currency: string, mult: number): string {
  if (!Number.isFinite(v)) return '—'
  return formatCurrency(v, currency as Currency, { kesToDisplayMultiplier: mult, compact: true })
}

const VIEW_LEVELS = [
  { value: 'portfolio', label: 'All holdings' },
  { value: 'by_ticker', label: 'By stock' },
  { value: 'single', label: 'One stock' },
] as const

const PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
] as const

export function PortfolioAnalytics() {
  useFrappeCurrencySync()

  const holdings = useAppStore((s) => s.holdings)
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()

  const [level, setLevel] = useState<PortfolioViewLevel>(() => {
    if (typeof window === 'undefined') return 'portfolio'
    const raw = window.localStorage.getItem('portfolio.analytics.level')
    return raw === 'portfolio' || raw === 'by_ticker' || raw === 'single' ? raw : 'portfolio'
  })
  const [period, setPeriod] = useState<ChartPeriod>(() => {
    if (typeof window === 'undefined') return 'yearly'
    const raw = window.localStorage.getItem('portfolio.analytics.period')
    return raw === 'monthly' || raw === 'yearly' ? raw : 'yearly'
  })
  const [selectedTicker, setSelectedTicker] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('portfolio.analytics.selectedTicker') ?? ''
  })
  const [expanded, setExpanded] = useState<null | 'timeline' | 'bar' | 'pie'>(null)
  const chartFillInline = useId().replace(/:/g, '')
  const chartFillModal = `${chartFillInline}-modal`

  const aggregates = useMemo(() => groupByTicker(holdings), [holdings])
  const firstInvest = useMemo(() => getFirstInvestmentDate(holdings), [holdings])

  const holdingsForTimeline = useMemo(() => {
    if (level !== 'single' || !selectedTicker) return holdings
    return holdings.filter((h) => {
      const t = (h.ticker || h.name || h.id).trim() || h.id
      return t === selectedTicker
    })
  }, [holdings, level, selectedTicker])

  const timelineBuckets = useMemo(
    () => buildTimelineBuckets(holdingsForTimeline, period),
    [holdingsForTimeline, period],
  )

  const { lineChartData, lineKeys, tickerColors, lineNames, chartMode } = useMemo(() => {
    const colors = new Map<string, string>()
    aggregates.forEach((a, i) => colors.set(a.ticker, lineColorForIndex(i)))
    const emptyNames = new Map<string, string>()

    if (level === 'portfolio') {
      const data = buildPortfolioHoldingLineRows(holdings, period)
      const keys = holdings.map((h) => h.id)
      const holdingColors = new Map<string, string>()
      const names = new Map<string, string>()
      holdings.forEach((h, i) => {
        holdingColors.set(h.id, lineColorForIndex(i))
        names.set(h.id, holdingLineLabel(h))
      })
      return {
        lineChartData: data,
        lineKeys: keys,
        tickerColors: holdingColors,
        lineNames: names,
        chartMode: 'lines' as const,
      }
    }

    if (level === 'single') {
      // Single-stock view: show invested at buy(s) vs current live value.
      // Current live value uses cached live unit price (API) * quantity when available.
      const investedAtBuys = holdingsForTimeline.reduce((s, h) => s + (h.costBasisKES ?? 0), 0)
      const liveCurrentValue = holdingsForTimeline.reduce((s, h) => {
        const qty = h.quantity ?? 0
        const livePx = h.currentPriceKES ?? 0
        if (qty > 0 && livePx > 0) return s + qty * livePx
        return s + (h.valueKES ?? 0)
      }, 0)

      const buyDate = holdingsForTimeline.length
        ? new Date(
            Math.min(
              ...holdingsForTimeline.map((h) => new Date(h.dateAdded).getTime()),
            ),
          )
        : new Date()
      const buyLabel = buyDate.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
      const buyTitle = buyDate.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
      const now = new Date()
      const nowLabel = now.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
      const nowTitle = now.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })

      const data = [
        {
          label: buyLabel,
          tooltipTitle: `${buyTitle} (buy basis)`,
          sortKey: buyDate.getTime(),
          market: investedAtBuys,
          invested: investedAtBuys,
        },
        {
          label: 'Today',
          tooltipTitle: `${nowTitle} (live)`,
          sortKey: now.getTime(),
          market: liveCurrentValue,
          invested: investedAtBuys,
        },
      ]

      return {
        lineChartData: data,
        lineKeys: [] as string[],
        tickerColors: colors,
        lineNames: emptyNames,
        chartMode: 'area' as const,
      }
    }

    const sorted = [...aggregates].sort((a, b) => b.marketValue - a.marketValue)
    const keys = sorted.map((p) => p.ticker)

    const data = timelineBuckets.map((b) => {
      const row: Record<string, string | number> = {
        label: b.label,
        tooltipTitle: b.tooltipTitle,
        sortKey: b.sortKey,
      }
      for (const k of keys) {
        row[k] = b.byTickerMarket[k] ?? 0
      }
      return row
    })

    return {
      lineChartData: data,
      lineKeys: keys,
      tickerColors: colors,
      lineNames: emptyNames,
      chartMode: 'lines' as const,
    }
  }, [timelineBuckets, level, aggregates, holdings, period])

  const barData = useMemo(() => {
    if (!holdings.length) return []

    if (level === 'single' && selectedTicker) {
      const g = aggregates.find((x) => x.ticker === selectedTicker)
      if (!g) return []
      return g.holdings.map((h) => ({
        name: new Date(h.dateAdded).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' }),
        buy: buyUnitPrice(h),
        current: currentUnitPrice(h),
        id: h.id,
      }))
    }

    if (level === 'by_ticker') {
      return aggregates.map((g) => ({
        name: g.ticker,
        buy: g.quantity > 0 ? g.costBasis / g.quantity : 0,
        current: g.quantity > 0 ? g.marketValue / g.quantity : 0,
      }))
    }

    return holdings.map((h) => ({
      name: (h.ticker || h.name.slice(0, 14)).slice(0, 16),
      buy: buyUnitPrice(h),
      current: currentUnitPrice(h),
      id: h.id,
    }))
  }, [holdings, level, selectedTicker, aggregates])

  const pieData = useMemo(() => {
    const total = aggregates.reduce((s, a) => s + a.marketValue, 0)
    if (total <= 0) return []
    return aggregates.map((a, i) => ({
      name: a.displayName.length > 22 ? `${a.ticker}` : `${a.displayName} (${a.ticker})`,
      shortName: a.ticker,
      value: a.marketValue,
      percentage: ((a.marketValue / total) * 100).toFixed(1),
      color: LINE_PALETTE[i % LINE_PALETTE.length],
    }))
  }, [aggregates])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('portfolio.analytics.level', level)
  }, [level])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('portfolio.analytics.period', period)
  }, [period])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (selectedTicker) window.localStorage.setItem('portfolio.analytics.selectedTicker', selectedTicker)
    else window.localStorage.removeItem('portfolio.analytics.selectedTicker')
  }, [selectedTicker])

  useEffect(() => {
    if (level !== 'single') return
    const valid = new Set(aggregates.map((a) => a.ticker))
    if (!selectedTicker || !valid.has(selectedTicker)) {
      setSelectedTicker(aggregates[0]?.ticker ?? '')
    }
  }, [level, aggregates, selectedTicker])

  const singleGroup = useMemo(
    () => (selectedTicker ? aggregates.find((a) => a.ticker === selectedTicker) : undefined),
    [aggregates, selectedTicker],
  )

  const rangeHint = useMemo(() => {
    if (!firstInvest) return ''
    const end = new Date()
    const a = firstInvest.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
    const b = end.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
    return `From your first investment (${a}) through ${b} — ${period === 'monthly' ? 'month-end snapshots' : 'year-end snapshots'} using today's marks on positions you held.`
  }, [firstInvest, period])

  const fmtMoney = (v: number) => formatCurrency(v, currency, { kesToDisplayMultiplier })

  const LineTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: Array<{
      payload: Record<string, unknown>
      dataKey?: string
      value?: number
      color?: string
      name?: string
    }>
  }) => {
    if (!active || !payload?.length) return null
    const row = payload[0].payload as Record<string, number | string>
    const title = String(row.tooltipTitle ?? row.label ?? '')
    const items = payload
      .filter((p) => p.dataKey && p.value != null && typeof p.value === 'number')
      .slice()
      .sort((a, b) => (b.value as number) - (a.value as number))

    const labelFor = (p: (typeof items)[number]) => {
      if (p.dataKey === 'market') return 'Market value'
      if (p.dataKey === 'invested') return 'Invested (cost)'
      return p.name || String(p.dataKey)
    }

    return (
      <div className="rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
          {items.map((p) => (
            <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="truncate">{labelFor(p)}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-card-foreground">
                {fmtMoney(p.value as number)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const BarTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: Array<{ name?: string; value?: number; dataKey?: string; color?: string }>
  }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm">
        <p className="text-xs font-medium text-muted-foreground">Unit price</p>
        <div className="mt-2 space-y-1">
          {payload.map((p) => (
            <div key={p.dataKey} className="flex justify-between gap-6 text-sm">
              <span style={{ color: p.color }}>{p.name}</span>
              <span className="font-mono tabular-nums">{fmtMoney(p.value ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const PieTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: Array<{ payload: { name: string; value: number; percentage: string } }>
  }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm">
        <p className="font-medium text-card-foreground">{d.name}</p>
        <p className="text-sm text-muted-foreground">
          {fmtMoney(d.value)} ({d.percentage}%)
        </p>
      </div>
    )
  }

  const renderTimelineChart = (mode: 'inline' | 'modal') => {
    const isModal = mode === 'modal'
    const gradientId = isModal ? chartFillModal : chartFillInline
    const boxClass = isModal
      ? 'h-[min(78vh,820px)] min-h-[400px] w-full'
      : 'h-[min(440px,55vh)] w-full min-h-[280px]'
    const rightM = lineKeys.length > 12 ? (isModal ? 220 : 196) : isModal ? 20 : 12
    const legMaxH = lineKeys.length > 10 ? (isModal ? 560 : 320) : undefined
    const tickFs = isModal ? 12 : 11
    const legFs =
      lineKeys.length > 24 ? (isModal ? 10 : 9) : lineKeys.length > 15 ? (isModal ? 11 : 10) : isModal ? 13 : 12

    return (
      <div className={boxClass}>
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'lines' ? (
            <ComposedChart data={lineChartData} margin={{ top: 8, right: rightM, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/60" />
              <XAxis dataKey="label" tick={{ fontSize: tickFs }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: tickFs }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => shortAxisMoney(Number(v), currency, kesToDisplayMultiplier)}
                width={isModal ? 64 : 56}
              />
              <Tooltip content={<LineTooltip />} />
              <Legend
                layout={lineKeys.length > 10 ? 'vertical' : 'horizontal'}
                align={lineKeys.length > 10 ? 'right' : 'center'}
                verticalAlign={lineKeys.length > 10 ? 'middle' : 'bottom'}
                wrapperStyle={{
                  fontSize: legFs,
                  maxHeight: legMaxH,
                  overflowY: lineKeys.length > 10 ? 'auto' : undefined,
                  paddingLeft: lineKeys.length > 10 ? 8 : 0,
                  lineHeight: 1.15,
                }}
              />
              {lineKeys.map((k) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={lineNames.get(k) || k}
                  stroke={tickerColors.get(k) ?? lineColorForIndex(0)}
                  strokeWidth={lineKeys.length > 25 ? 1.1 : lineKeys.length > 15 ? 1.35 : 2}
                  dot={false}
                  activeDot={{ r: lineKeys.length > 25 ? 3 : 4 }}
                  isAnimationActive={lineKeys.length < 40 && !isModal}
                />
              ))}
            </ComposedChart>
          ) : (
            <ComposedChart data={lineChartData} margin={{ top: 8, right: isModal ? 20 : 12, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1246a8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#1246a8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/60" />
              <XAxis dataKey="label" tick={{ fontSize: tickFs }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: tickFs }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => shortAxisMoney(Number(v), currency, kesToDisplayMultiplier)}
                width={isModal ? 64 : 56}
              />
              <Tooltip content={<LineTooltip />} />
              <Legend wrapperStyle={{ fontSize: isModal ? 13 : 12 }} />
              <Area
                type="monotone"
                dataKey="market"
                name="Market value"
                stroke="#1246a8"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="invested"
                name="Invested (cost)"
                stroke="#64748b"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="5 4"
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    )
  }

  const renderBarChart = (mode: 'inline' | 'modal') => {
    const isModal = mode === 'modal'
    const boxClass = isModal
      ? 'h-[min(72vh,760px)] min-h-[400px] w-full'
      : 'h-[min(380px,50vh)] w-full min-h-[260px]'
    const bottomM = level === 'portfolio' ? (isModal ? 58 : 52) : isModal ? 48 : 40
    const tickFs = isModal ? 11 : 10
    const angle = barData.length > (isModal ? 6 : 8) ? -32 : 0
    const xh = barData.length > (isModal ? 6 : 8) ? 72 : 28

    return (
      <div className={boxClass}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: bottomM }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/60" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: tickFs }}
              interval={0}
              angle={angle}
              textAnchor={angle ? 'end' : 'middle'}
              height={xh}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: isModal ? 12 : 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => shortAxisMoney(Number(v), currency, kesToDisplayMultiplier)}
              width={isModal ? 64 : 56}
            />
            <Tooltip content={<BarTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} />
            <Legend wrapperStyle={{ fontSize: isModal ? 13 : 12 }} />
            <Bar name="When bought" dataKey="buy" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={isModal ? 56 : 48} />
            <Bar name="Now" dataKey="current" fill="#1246a8" radius={[4, 4, 0, 0]} maxBarSize={isModal ? 56 : 48} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const renderPieChart = (mode: 'inline' | 'modal') => {
    const isModal = mode === 'modal'
    const boxClass = isModal
      ? 'h-[min(52vh,560px)] min-h-[340px] w-full'
      : 'h-[min(340px,45vh)] w-full min-h-[240px]'

    return (
      <div className={boxClass}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={isModal ? '38%' : '42%'}
              outerRadius={isModal ? '78%' : '72%'}
              paddingAngle={2}
              dataKey="value"
              stroke="var(--color-background)"
              strokeWidth={2}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (!holdings.length) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Portfolio analytics</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Add holdings to see performance over time, buy vs current price, and distribution.
        </CardContent>
      </Card>
    )
  }

  const expandWrapClass =
    'group relative rounded-lg outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring cursor-zoom-in'

  return (
    <div className="space-y-6">
      <Dialog open={expanded !== null} onOpenChange={(open) => !open && setExpanded(null)}>
        <DialogContent
          className="flex max-h-[92vh] max-w-[min(96vw,1200px)] flex-col gap-4 overflow-y-auto sm:max-w-[min(96vw,1200px)]"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>
              {expanded === 'timeline' && 'Portfolio value over time'}
              {expanded === 'bar' && 'Buy Price vs Current (per unit)'}
              {expanded === 'pie' && 'Holdings Distribution'}
            </DialogTitle>
            {expanded === 'timeline' && <DialogDescription>{rangeHint}</DialogDescription>}
            {expanded === 'bar' && (
              <DialogDescription>
                {level === 'by_ticker'
                  ? 'One bar group per ticker (all lots combined).'
                  : level === 'single'
                    ? 'Each lot you opened for this stock.'
                    : 'Each holding row in your portfolio.'}
              </DialogDescription>
            )}
            {expanded === 'pie' && (
              <DialogDescription>Share of portfolio by position (same ticker merged).</DialogDescription>
            )}
          </DialogHeader>
          <div className="min-h-0 w-full shrink-0">
            {expanded === 'timeline' && renderTimelineChart('modal')}
            {expanded === 'bar' && renderBarChart('modal')}
            {expanded === 'pie' && (
              <>
                {renderPieChart('modal')}
                <div className="mt-4 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                  {pieData.map((item) => (
                    <div key={item.shortName} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="truncate font-medium">{item.shortName}</span>
                      </div>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{item.percentage}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="space-y-4 border-b border-border/60 bg-muted/20 pb-4">
          {/* Title + hint */}
          <div>
            <CardTitle className="text-lg font-semibold tracking-tight">Portfolio value over time</CardTitle>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{rangeHint}</p>
            {level === 'portfolio' && holdings.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                All holdings: {holdings.length} line{holdings.length === 1 ? '' : 's'} (one per lot). Same ticker on
                different dates appears as separate lines.
              </p>
            )}
            {level === 'by_ticker' && aggregates.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                By stock: {aggregates.length} line{aggregates.length === 1 ? '' : 's'} (one per ticker; multiple buys
                are merged).
              </p>
            )}
          </div>

          {/* ── Controls ── */}
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            {/* Period toggle */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-muted/30 p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriod(p.value as ChartPeriod)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-all duration-150 select-none',
                    period === p.value
                      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* View-level Select */}
            <Select value={level} onValueChange={(v) => setLevel(v as PortfolioViewLevel)}>
              <SelectTrigger className="h-7 w-[148px] rounded-lg border-border/50 bg-muted/30 text-xs font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEW_LEVELS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Stock picker — only when "One stock" */}
            {level === 'single' && aggregates.length > 0 && (
              <Select value={selectedTicker} onValueChange={setSelectedTicker}>
                <SelectTrigger className="h-7 w-[190px] rounded-lg border-border/50 bg-muted/30 text-xs">
                  <SelectValue placeholder="Choose stock" />
                </SelectTrigger>
                <SelectContent>
                  {aggregates.map((a) => (
                    <SelectItem key={a.ticker} value={a.ticker}>
                      {a.displayName} ({a.ticker})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Single-stock summary strip */}
          {level === 'single' && singleGroup && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-background/80 p-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Lots</p>
                <p className="text-lg font-semibold tabular-nums">{singleGroup.lots}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total quantity</p>
                <p className="text-lg font-semibold tabular-nums">{singleGroup.quantity.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Invested</p>
                <p className="text-lg font-semibold tabular-nums">{fmtMoney(singleGroup.costBasis)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Market value</p>
                <p className="text-lg font-semibold tabular-nums text-primary">{fmtMoney(singleGroup.marketValue)}</p>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-6">
          <div
            role="button"
            tabIndex={0}
            className={expandWrapClass}
            onClick={() => setExpanded('timeline')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setExpanded('timeline')
              }
            }}
            aria-label="Open portfolio chart in full screen"
          >
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm group-hover:text-foreground">
              <Maximize2 className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Expand</span>
            </div>
            {renderTimelineChart('inline')}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-border/80 shadow-sm lg:col-span-1">
          <CardHeader className="border-b border-border/60 bg-muted/15 pb-3">
            <CardTitle className="text-base font-semibold">Buy price vs current (per unit)</CardTitle>
            <p className="text-xs text-muted-foreground">
              {level === 'by_ticker'
                ? 'One bar group per ticker (all lots combined).'
                : level === 'single'
                  ? 'Each lot you opened for this stock.'
                  : 'Each holding row in your portfolio.'}
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <div
              role="button"
              tabIndex={0}
              className={expandWrapClass}
              onClick={() => setExpanded('bar')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setExpanded('bar')
                }
              }}
              aria-label="Open buy vs current price chart in full screen"
            >
              <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm group-hover:text-foreground">
                <Maximize2 className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">Expand</span>
              </div>
              {renderBarChart('inline')}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 shadow-sm lg:col-span-1">
          <CardHeader className="border-b border-border/60 bg-muted/15 pb-3">
            <CardTitle className="text-base font-semibold">Holdings distribution</CardTitle>
            <p className="text-xs text-muted-foreground">Share of portfolio by position (same ticker merged).</p>
          </CardHeader>
          <CardContent className="pt-4">
            <div
              role="button"
              tabIndex={0}
              className={expandWrapClass}
              onClick={() => setExpanded('pie')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setExpanded('pie')
                }
              }}
              aria-label="Open holdings distribution chart in full screen"
            >
              <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm group-hover:text-foreground">
                <Maximize2 className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">Expand</span>
              </div>
              {renderPieChart('inline')}
            </div>
            <div className="mt-4 max-h-40 space-y-1.5 overflow-y-auto pr-1">
              {pieData.map((item) => (
                <div key={item.shortName} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate font-medium">{item.shortName}</span>
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}