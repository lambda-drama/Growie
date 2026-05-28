'use client'

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency } from '@/lib/format'
import {
  allHoldingsSlices,
  brokerSlices,
  etfsOnlySlices,
  filterHoldingsForAnalytics,
  listBrokers,
  sharesAndEtfsAggregateSlices,
  stocksOnlySlices,
  stocksVsEtfsSlices,
  type HoldingViewFilter,
  type StackChartSlice,
} from '@/lib/stack-analytics-data'
import type { StackHolding } from '@/services/stack'

interface StackAnalyticsSectionProps {
  holdings: StackHolding[]
}

function ChartTooltip({
  currency,
  kesToDisplayMultiplier,
}: {
  currency: string
  kesToDisplayMultiplier: number
}) {
  return function TooltipContent({
    active,
    payload,
  }: {
    active?: boolean
    payload?: { payload: StackChartSlice }[]
  }) {
    if (!active || !payload?.[0]) return null
    const row = payload[0].payload
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
        <p className="text-sm font-medium">{row.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(row.value, currency as 'KES', { kesToDisplayMultiplier })} ({row.percentage}
          %)
        </p>
      </div>
    )
  }
}

function DonutCard({
  title,
  description,
  data,
  currency,
  kesToDisplayMultiplier,
  emptyLabel,
}: {
  title: string
  description?: string
  data: StackChartSlice[]
  currency: string
  kesToDisplayMultiplier: number
  emptyLabel: string
}) {
  const Tip = useMemo(
    () => ChartTooltip({ currency, kesToDisplayMultiplier }),
    [currency, kesToDisplayMultiplier]
  )

  return (
    <Card className="flex min-h-[380px] flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description ? <CardDescription className="text-xs leading-relaxed">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pb-5">
        {data.length === 0 ? (
          <div className="flex min-h-[260px] flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <>
            <div className="mx-auto h-[240px] w-full max-w-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="54%"
                    outerRadius="80%"
                    paddingAngle={2}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.id} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={Tip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-4 max-h-36 space-y-2 overflow-y-auto pr-1">
              {data.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{item.percentage}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BarCard({
  title,
  description,
  data,
  currency,
  kesToDisplayMultiplier,
  emptyLabel,
  layout = 'vertical',
}: {
  title: string
  description?: string
  data: StackChartSlice[]
  currency: string
  kesToDisplayMultiplier: number
  emptyLabel: string
  layout?: 'vertical' | 'horizontal'
}) {
  const Tip = useMemo(
    () => ChartTooltip({ currency, kesToDisplayMultiplier }),
    [currency, kesToDisplayMultiplier]
  )
  const chartHeight =
    layout === 'vertical' ? Math.max(260, data.length * 48) : 280

  return (
    <Card className="flex min-h-[380px] flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description ? <CardDescription className="text-xs leading-relaxed">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pb-5">
        {data.length === 0 ? (
          <div className="flex min-h-[260px] flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : layout === 'vertical' ? (
          <div className="w-full flex-1" style={{ minHeight: chartHeight }}>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={data} layout="vertical" margin={{ left: 4, right: 20, top: 8, bottom: 8 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={128}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={Tip} cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={32}>
                  {data.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={56}
                />
                <YAxis hide />
                <Tooltip content={Tip} cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {data.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ChartPair({
  title,
  description,
  donut,
  bar,
  currency,
  kesToDisplayMultiplier,
  emptyLabel,
}: {
  title: string
  description: string
  donut: { title: string; description?: string; data: StackChartSlice[] }
  bar: { title: string; description?: string; data: StackChartSlice[]; layout?: 'vertical' | 'horizontal' }
  currency: string
  kesToDisplayMultiplier: number
  emptyLabel: string
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DonutCard
          title={donut.title}
          description={donut.description}
          data={donut.data}
          currency={currency}
          kesToDisplayMultiplier={kesToDisplayMultiplier}
          emptyLabel={emptyLabel}
        />
        <BarCard
          title={bar.title}
          description={bar.description}
          data={bar.data}
          layout={bar.layout ?? 'vertical'}
          currency={currency}
          kesToDisplayMultiplier={kesToDisplayMultiplier}
          emptyLabel={emptyLabel}
        />
      </div>
    </div>
  )
}

export function StackAnalyticsSection({ holdings }: StackAnalyticsSectionProps) {
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const [brokerFilter, setBrokerFilter] = useState<string>('all')
  const [holdingView, setHoldingView] = useState<HoldingViewFilter>('all')

  const brokers = useMemo(() => listBrokers(holdings), [holdings])
  const filtered = useMemo(
    () => filterHoldingsForAnalytics(holdings, brokerFilter, holdingView),
    [holdings, brokerFilter, holdingView]
  )
  const allEquities = useMemo(
    () => filterHoldingsForAnalytics(holdings, brokerFilter, 'all'),
    [holdings, brokerFilter]
  )

  const byBroker = useMemo(() => brokerSlices(filtered), [filtered])
  const stocksVsEtfs = useMemo(() => stocksVsEtfsSlices(allEquities), [allEquities])
  const aggregateHoldings = useMemo(() => sharesAndEtfsAggregateSlices(filtered), [filtered])
  const allHoldings = useMemo(() => allHoldingsSlices(filtered), [filtered])
  const stocksOnly = useMemo(() => stocksOnlySlices(allEquities), [allEquities])
  const etfsOnly = useMemo(() => etfsOnlySlices(allEquities), [allEquities])
  const emptyLabel = 'No positions match the current filters'

  if (!holdings.length) return null

  return (
    <section className="space-y-8 border-t border-border pt-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Portfolio insights</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Twelve charts from your stack design — donut and bar pairs for brokers, allocation, and
            holdings. Filter by broker or focus on stocks, ETFs, or all positions.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
          <div className="w-full sm:w-[200px]">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Brokerage
            </label>
            <Select value={brokerFilter} onValueChange={setBrokerFilter}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="All brokers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brokers</SelectItem>
                {brokers.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-[200px]">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Holdings view
            </label>
            <Select value={holdingView} onValueChange={(v) => setHoldingView(v as HoldingViewFilter)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shares &amp; ETFs</SelectItem>
                <SelectItem value="stocks">Stocks only</SelectItem>
                <SelectItem value="etfs">ETFs only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-10">
        <ChartPair
          title="1. Brokerage accounts"
          description="Scope Markets, AIB, and other brokers — how value is split across accounts."
          donut={{
            title: 'By brokerage (donut)',
            data: byBroker,
          }}
          bar={{
            title: 'By brokerage (bar)',
            data: byBroker,
            layout: 'vertical',
          }}
          currency={currency}
          kesToDisplayMultiplier={kesToDisplayMultiplier}
          emptyLabel="Add a broker name on holdings to see this"
        />

        <ChartPair
          title="2. Stocks vs ETFs"
          description="Compare total portfolio weight in individual stocks versus ETF funds."
          donut={{
            title: 'Stocks vs ETFs (donut)',
            data: stocksVsEtfs,
          }}
          bar={{
            title: 'Stocks vs ETFs (bar)',
            data: stocksVsEtfs,
            layout: 'horizontal',
          }}
          currency={currency}
          kesToDisplayMultiplier={kesToDisplayMultiplier}
          emptyLabel="No stock or ETF positions"
        />

        <ChartPair
          title="3. All shares & ETFs (aggregate)"
          description="Every ticker combined — see which positions dominate overall value."
          donut={{
            title: 'Aggregate holdings (donut)',
            data: aggregateHoldings,
          }}
          bar={{
            title: 'Aggregate holdings (bar)',
            data: aggregateHoldings,
            layout: 'vertical',
          }}
          currency={currency}
          kesToDisplayMultiplier={kesToDisplayMultiplier}
          emptyLabel={emptyLabel}
        />

        <ChartPair
          title="4. Individual holdings"
          description="Same aggregation with your current broker / stocks / ETFs filter applied."
          donut={{
            title: 'Individual holdings (donut)',
            description: 'Largest positions by market value',
            data: allHoldings,
          }}
          bar={{
            title: 'Individual holdings (bar)',
            data: allHoldings,
            layout: 'vertical',
          }}
          currency={currency}
          kesToDisplayMultiplier={kesToDisplayMultiplier}
          emptyLabel={emptyLabel}
        />

        <ChartPair
          title="5. All stocks"
          description="NSE and global stocks only — which names take the most weight."
          donut={{
            title: 'Stocks breakdown (donut)',
            data: stocksOnly,
          }}
          bar={{
            title: 'Stocks breakdown (bar)',
            data: stocksOnly,
            layout: 'vertical',
          }}
          currency={currency}
          kesToDisplayMultiplier={kesToDisplayMultiplier}
          emptyLabel="No stock positions"
        />

        <ChartPair
          title="6. All ETFs"
          description="ETF asset class only — compare fund sizes in your stack."
          donut={{
            title: 'ETFs breakdown (donut)',
            data: etfsOnly,
          }}
          bar={{
            title: 'ETFs breakdown (bar)',
            data: etfsOnly,
            layout: 'vertical',
          }}
          currency={currency}
          kesToDisplayMultiplier={kesToDisplayMultiplier}
          emptyLabel="No ETF positions — use asset class ETFs when adding"
        />

      </div>
    </section>
  )
}
