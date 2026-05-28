import { groupHoldingsByTicker } from '@/lib/stack-ticker-groups'
import {
  holdingValueKES,
  isEquityHolding,
  isEtfHolding,
  normalizeBrokerLabel,
} from '@/lib/stack-holding-classify'
import type { StackHolding } from '@/services/stack'

export type HoldingViewFilter = 'all' | 'stocks' | 'etfs'

export interface StackChartSlice {
  id: string
  name: string
  value: number
  percentage: number
  color: string
}

export const STACK_CHART_PALETTE = [
  '#0ea5e9',
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#e11d48',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#64748b',
  '#ec4899',
] as const

const STOCKS_COLOR = '#0284c7'
const ETF_COLOR = '#6366f1'

function withPercentages(
  rows: { id: string; name: string; value: number }[],
  maxSlices = 10
): StackChartSlice[] {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, maxSlices)
  const rest = sorted.slice(maxSlices)
  const otherValue = rest.reduce((s, r) => s + r.value, 0)
  if (otherValue > 0) {
    top.push({ id: '__other__', name: 'Other', value: otherValue })
  }
  const total = top.reduce((s, r) => s + r.value, 0)
  if (total <= 0) return []
  return top.map((row, i) => ({
    ...row,
    percentage: Math.round((row.value / total) * 1000) / 10,
    color: STACK_CHART_PALETTE[i % STACK_CHART_PALETTE.length],
  }))
}

function tickerSlices(holdings: StackHolding[], maxSlices = 10): StackChartSlice[] {
  const groups = groupHoldingsByTicker(holdings)
  const rows = groups.map((g) => ({
    id: g.key,
    name: g.ticker || g.displayName,
    value: g.totalValueInKES,
  }))
  return withPercentages(rows, maxSlices)
}

export function filterByHoldingView(
  holdings: StackHolding[],
  view: HoldingViewFilter
): StackHolding[] {
  const equities = holdings.filter(isEquityHolding)
  if (view === 'stocks') {
    return equities.filter(
      (h) => h.assetClass === 'nse-stocks' || h.assetClass === 'global-stocks'
    )
  }
  if (view === 'etfs') {
    return equities.filter(isEtfHolding)
  }
  return equities
}

export function filterHoldingsForAnalytics(
  holdings: StackHolding[],
  brokerFilter: string,
  holdingView: HoldingViewFilter = 'all'
): StackHolding[] {
  let rows = filterByHoldingView(holdings, holdingView)
  if (!brokerFilter || brokerFilter === 'all') return rows
  return rows.filter((h) => normalizeBrokerLabel(h.broker) === brokerFilter)
}

export function listBrokers(holdings: StackHolding[]): string[] {
  const set = new Set<string>()
  for (const h of holdings) {
    if (!isEquityHolding(h)) continue
    set.add(normalizeBrokerLabel(h.broker))
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function brokerSlices(holdings: StackHolding[]): StackChartSlice[] {
  const map = new Map<string, number>()
  for (const h of holdings) {
    const v = holdingValueKES(h)
    if (v <= 0 || !isEquityHolding(h)) continue
    const broker = normalizeBrokerLabel(h.broker)
    map.set(broker, (map.get(broker) ?? 0) + v)
  }
  return withPercentages(
    [...map.entries()].map(([name, value]) => ({ id: name, name, value })),
    8
  )
}

export function stocksVsEtfsSlices(holdings: StackHolding[]): StackChartSlice[] {
  let stocks = 0
  let etfs = 0
  for (const h of holdings) {
    const v = holdingValueKES(h)
    if (v <= 0 || !isEquityHolding(h)) continue
    if (isEtfHolding(h)) etfs += v
    else if (h.assetClass === 'nse-stocks' || h.assetClass === 'global-stocks') stocks += v
  }
  return withPercentages(
    [
      { id: 'stocks', name: 'Stocks', value: stocks },
      { id: 'etfs', name: 'ETFs', value: etfs },
    ].filter((r) => r.value > 0),
    4
  ).map((row) => ({
    ...row,
    color: row.id === 'stocks' ? STOCKS_COLOR : ETF_COLOR,
  }))
}

export function allHoldingsSlices(holdings: StackHolding[]): StackChartSlice[] {
  return tickerSlices(holdings, 10)
}

export function stocksOnlySlices(holdings: StackHolding[]): StackChartSlice[] {
  const stocks = holdings.filter(
    (h) => h.assetClass === 'nse-stocks' || h.assetClass === 'global-stocks'
  )
  return tickerSlices(stocks, 10)
}

export function etfsOnlySlices(holdings: StackHolding[]): StackChartSlice[] {
  const etfs = holdings.filter(isEtfHolding)
  return tickerSlices(etfs, 10)
}

/** Shares & ETFs combined value (for aggregate comparison section). */
export function sharesAndEtfsAggregateSlices(holdings: StackHolding[]): StackChartSlice[] {
  return allHoldingsSlices(holdings)
}
