import type { StackTickerGroup } from '@/lib/stack-ticker-groups'
import type { StackHolding } from '@/services/stack'

export type StackGroupingMode = 'ticker' | 'region' | 'exchange'

export function isBucketGroupingMode(mode: StackGroupingMode): mode is Exclude<StackGroupingMode, 'ticker'> {
  return mode !== 'ticker'
}

export type StackBucketIconKind = 'region' | 'exchange'

export function bucketIconKind(mode: StackGroupingMode): StackBucketIconKind {
  return mode === 'region' ? 'region' : 'exchange'
}

function inferRegionFromHolding(h: StackHolding): string {
  const explicit = (h.region || '').trim()
  if (explicit) return explicit
  const tag = (h.marketTag || '').toLowerCase()
  const assetClass = (h.assetClass || '').toLowerCase()
  if (assetClass === 'nse-stocks') return 'Africa'
  if (assetClass === 'mmf' || assetClass === 'real-estate') return 'Africa'
  if (assetClass === 'etf') return 'USA'
  if (tag.includes('nse') || tag.includes('kenya')) return 'Africa'
  if (tag.includes('nasdaq') || tag.includes('nyse') || tag.includes('amex') || tag.includes('us')) return 'USA'
  if (tag.includes('lse') || tag.includes('euronext') || tag.includes('europe')) return 'Europe'
  if (tag.includes('jse') || tag.includes('africa')) return 'Africa'
  if ((h.currency || '').toUpperCase() === 'KES') return 'Africa'
  return 'Global'
}

function inferExchangeFromHolding(h: StackHolding): string {
  const explicit = (h.exchangePlatform || '').trim()
  if (explicit) return explicit
  if (h.assetClass === 'etf') return h.exchangePlatform || 'NASDAQ'
  if (h.assetClass === 'nse-stocks' || h.assetClass === 'mmf' || h.assetClass === 'real-estate') return 'NSE'
  return h.marketTag || 'Global'
}

export function bucketLabelForHolding(h: StackHolding, mode: StackGroupingMode): string {
  if (mode === 'region') return inferRegionFromHolding(h)
  if (mode === 'exchange') return inferExchangeFromHolding(h)
  return ''
}

export function bucketLabelForTickerGroup(group: StackTickerGroup, mode: StackGroupingMode): string {
  const first = group.holdings[0]
  if (!first) return 'Other'
  return bucketLabelForHolding(first, mode)
}

export function groupingListTitle(mode: StackGroupingMode): string {
  if (mode === 'region') return 'region'
  if (mode === 'exchange') return 'exchange'
  return ''
}

export function groupingBucketColumnLabel(mode: StackGroupingMode): string {
  if (mode === 'region') return 'Region'
  if (mode === 'exchange') return 'Exchange'
  return ''
}

export function groupingBackLabel(mode: StackGroupingMode): string {
  if (mode === 'region') return 'regions'
  if (mode === 'exchange') return 'exchanges'
  return ''
}
