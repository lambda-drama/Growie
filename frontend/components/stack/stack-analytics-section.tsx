'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatPercentage } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  allEtfsCostVsValueRows,
  allStocksCostVsValueRows,
  brokerSlices,
  etfsOnlySlices,
  filterHoldingsForAnalytics,
  listBrokers,
  stocksByReturnSlices,
  stocksOnlySlices,
  stocksVsEtfsSlices,
  topPerformerStocksSlices,
  underperformerStocksSlices,
  type StackChartSlice,
  type StackComparisonRow,
} from '@/lib/stack-analytics-data'
import type { StackHolding } from '@/services/stack'

interface StackAnalyticsSectionProps {
  holdings: StackHolding[]
}

const INITIAL_BAR = '#94a3b8'
const CURRENT_BAR = '#0ea5e9'

function ChartTooltip({
  currency,
  kesToDisplayMultiplier,
  valueIsPercent = false,
}: {
  currency: string
  kesToDisplayMultiplier: number
  valueIsPercent?: boolean
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
          {valueIsPercent
            ? `${row.value >= 0 ? '+' : ''}${row.value}%`
            : `${formatCurrency(row.value, currency as 'KES', { kesToDisplayMultiplier })} (${row.percentage}%)`}
        </p>
      </div>
    )
  }
}

function ComparisonTooltip({
  currency,
  kesToDisplayMultiplier,
}: {
  currency: string
  kesToDisplayMultiplier: number
}) {
  return function TooltipContent({
    active,
    payload,
    label,
  }: {
    active?: boolean
    payload?: { dataKey: string; value: number; color: string }[]
    label?: string
  }) {
    if (!active || !payload?.length) return null
    const initial = payload.find((p) => p.dataKey === 'initial')?.value ?? 0
    const current = payload.find((p) => p.dataKey === 'current')?.value ?? 0
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          Initial:{' '}
          {formatCurrency(initial, currency as 'KES', { kesToDisplayMultiplier })}
        </p>
        <p className="text-xs text-muted-foreground">
          Current:{' '}
          {formatCurrency(current, currency as 'KES', { kesToDisplayMultiplier })}
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
        {description ? (
          <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
        ) : null}
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
  valueIsPercent = false,
}: {
  title: string
  description?: string
  data: StackChartSlice[]
  currency: string
  kesToDisplayMultiplier: number
  emptyLabel: string
  valueIsPercent?: boolean
}) {
  const Tip = useMemo(
    () => ChartTooltip({ currency, kesToDisplayMultiplier, valueIsPercent }),
    [currency, kesToDisplayMultiplier, valueIsPercent]
  )
  const labelAngle = data.length > 4 ? -32 : 0
  const bottomMargin = data.length > 4 ? 72 : 40

  return (
    <Card className="flex min-h-[380px] flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description ? (
          <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pb-5">
        {data.length === 0 ? (
          <div className="flex min-h-[260px] flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <div className="h-[300px] w-full sm:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ left: 8, right: 12, top: 12, bottom: bottomMargin }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={labelAngle}
                  textAnchor={labelAngle ? 'end' : 'middle'}
                  height={labelAngle ? 64 : 36}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={valueIsPercent ? 44 : 56}
                  tickFormatter={(v) =>
                    valueIsPercent ? `${v}%` : formatCurrency(v, currency as 'KES', { kesToDisplayMultiplier, compact: true })
                  }
                />
                <Tooltip content={Tip} cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
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

function ComparisonBarCard({
  title,
  description,
  data,
  currency,
  kesToDisplayMultiplier,
  emptyLabel,
}: {
  title: string
  description?: string
  data: StackComparisonRow[]
  currency: string
  kesToDisplayMultiplier: number
  emptyLabel: string
}) {
  const Tip = useMemo(
    () => ComparisonTooltip({ currency, kesToDisplayMultiplier }),
    [currency, kesToDisplayMultiplier]
  )
  const labelAngle = data.length > 4 ? -32 : 0
  const bottomMargin = data.length > 4 ? 72 : 48

  return (
    <Card className="flex min-h-[400px] flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description ? (
          <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pb-5">
        {data.length === 0 ? (
          <div className="flex min-h-[260px] flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <div className="h-[320px] w-full sm:h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ left: 8, right: 12, top: 12, bottom: bottomMargin }}
                barGap={4}
                barCategoryGap="22%"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={labelAngle}
                  textAnchor={labelAngle ? 'end' : 'middle'}
                  height={labelAngle ? 64 : 40}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) =>
                    formatCurrency(v, currency as 'KES', { kesToDisplayMultiplier, compact: true })
                  }
                />
                <Tooltip content={Tip} cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  formatter={(value) => (value === 'initial' ? 'Initial investment' : 'Current value')}
                />
                <Bar dataKey="initial" name="initial" fill={INITIAL_BAR} radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="current" name="current" fill={CURRENT_BAR} radius={[6, 6, 0, 0]} maxBarSize={36} />
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
  bar: { title: string; description?: string; data: StackChartSlice[] }
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
          currency={currency}
          kesToDisplayMultiplier={kesToDisplayMultiplier}
          emptyLabel={emptyLabel}
        />
      </div>
    </div>
  )
}

function PerformerListCard({
  variant,
  rows,
  emptyLabel,
}: {
  variant: 'top' | 'under'
  rows: StackChartSlice[]
  emptyLabel: string
}) {
  const isTop = variant === 'top'

  return (
    <Card className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', isTop ? 'bg-green-500' : 'bg-red-500')}
          aria-hidden
        />
        <h3 className="text-xs font-bold tracking-wide text-foreground">
          {isTop ? 'TOP PERFORMERS — STOCKS' : 'UNDERPERFORMERS — STOCKS'}
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul>
          {rows.map((row, index) => (
            <li
              key={row.id}
              className={cn(
                'flex items-center justify-between gap-4 px-4 py-3.5',
                index < rows.length - 1 && 'border-b border-border'
              )}
            >
              <span className="min-w-0 text-sm font-bold uppercase leading-snug tracking-tight text-foreground">
                {row.name}
              </span>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold tabular-nums',
                  isTop ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}
              >
                {formatPercentage(row.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function TabSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function StackAnalyticsSection({ holdings }: StackAnalyticsSectionProps) {
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const [brokerFilter, setBrokerFilter] = useState<string>('all')

  const brokers = useMemo(() => listBrokers(holdings), [holdings])
  const filtered = useMemo(
    () => filterHoldingsForAnalytics(holdings, brokerFilter, 'all'),
    [holdings, brokerFilter]
  )

  const stocksVsEtfs = useMemo(() => stocksVsEtfsSlices(filtered), [filtered])
  const byBroker = useMemo(() => brokerSlices(filtered), [filtered])
  const topPerformers = useMemo(() => topPerformerStocksSlices(filtered), [filtered])
  const underperformers = useMemo(() => underperformerStocksSlices(filtered), [filtered])
  const stocksDistribution = useMemo(() => stocksOnlySlices(filtered), [filtered])
  const stocksByReturn = useMemo(() => stocksByReturnSlices(filtered), [filtered])
  const etfsDistribution = useMemo(() => etfsOnlySlices(filtered), [filtered])
  const etfsCostVsValue = useMemo(() => allEtfsCostVsValueRows(filtered), [filtered])
  const allStocksCostVsValue = useMemo(() => allStocksCostVsValueRows(filtered), [filtered])
  const allEtfsCostVsValue = useMemo(() => allEtfsCostVsValueRows(filtered), [filtered])

  const emptyLabel = 'No positions match the current filters'
  const chartProps = { currency, kesToDisplayMultiplier, emptyLabel }

  if (!holdings.length) return null

  return (
    <section className="space-y-6 border-t border-border pt-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Portfolio insights</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Charts grouped by overview, stocks, ETFs, and comparisons. Filter by brokerage account.
          </p>
        </div>
        <div className="w-full sm:w-[220px]">
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
      </div>

      <Tabs defaultValue="overview" className="gap-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-auto">
          <TabsTrigger value="overview" className="px-3 sm:px-4">
            Overview
          </TabsTrigger>
          <TabsTrigger value="stocks" className="px-3 sm:px-4">
            Stocks
          </TabsTrigger>
          <TabsTrigger value="etfs" className="px-3 sm:px-4">
            ETFs
          </TabsTrigger>
          <TabsTrigger value="charts" className="px-3 sm:px-4">
            Charts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-10">
          <ChartPair
            title="Stocks vs ETFs"
            description="How your equity portfolio splits between individual stocks and ETF funds."
            donut={{ title: 'Allocation (pie)', data: stocksVsEtfs }}
            bar={{
              title: 'Allocation (bar)',
              data: stocksVsEtfs,
            }}
            {...chartProps}
            emptyLabel="No stock or ETF positions"
          />

          <ChartPair
            title="Portfolio by broker"
            description="Value held across Scope Markets, AIB, and other brokerage accounts."
            donut={{ title: 'By brokerage (pie)', data: byBroker }}
            bar={{ title: 'By brokerage (bar)', data: byBroker }}
            {...chartProps}
            emptyLabel="Add a broker name on holdings to see this"
          />

          <div className="grid gap-4 md:grid-cols-2">
            <PerformerListCard
              variant="top"
              rows={topPerformers}
              emptyLabel="No stocks with positive returns yet"
            />
            <PerformerListCard
              variant="under"
              rows={underperformers}
              emptyLabel="No stocks with negative returns"
            />
          </div>
        </TabsContent>

        <TabsContent value="stocks" className="mt-6 space-y-10">
          <TabSection
            title="Stock holdings"
            description="Distribution of market value across your stock positions."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <DonutCard
                title="Holdings distribution (pie)"
                data={stocksDistribution}
                {...chartProps}
                emptyLabel="No stock positions"
              />
              <BarCard
                title="By return (bar)"
                description="Unrealized % gain or loss per stock ticker."
                data={stocksByReturn}
                valueIsPercent
                {...chartProps}
                emptyLabel="No stock positions"
              />
            </div>
          </TabSection>
        </TabsContent>

        <TabsContent value="etfs" className="mt-6 space-y-10">
          <TabSection
            title="ETF holdings"
            description="How ETF fund value is spread across your positions."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <DonutCard
                title="ETF distribution (pie)"
                data={etfsDistribution}
                {...chartProps}
                emptyLabel="No ETF positions"
              />
              <ComparisonBarCard
                title="Initial investment vs current value"
                description="Cost basis compared to today’s value for each ETF."
                data={etfsCostVsValue}
                {...chartProps}
                emptyLabel="No ETF positions"
              />
            </div>
          </TabSection>
        </TabsContent>

        <TabsContent value="charts" className="mt-6 space-y-10">
          <TabSection
            title="All stocks"
            description="Initial investment vs current value for every stock ticker in your stack."
          >
            <ComparisonBarCard
              title="Stocks — initial vs current"
              data={allStocksCostVsValue}
              {...chartProps}
              emptyLabel="No stock positions"
            />
          </TabSection>

          <TabSection
            title="All ETFs"
            description="Initial investment vs current value for every ETF in your stack."
          >
            <ComparisonBarCard
              title="ETFs — initial vs current"
              data={allEtfsCostVsValue}
              {...chartProps}
              emptyLabel="No ETF positions"
            />
          </TabSection>
        </TabsContent>
      </Tabs>
    </section>
  )
}
