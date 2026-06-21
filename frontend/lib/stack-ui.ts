import type { AssetClass } from '@/types'
import type { StackClassSummary } from '@/services/stack'
import { getAssetClassColorHex } from '@/lib/format'

export const ASSET_CLASS_SHORT: Record<AssetClass, string> = {
  'nse-stocks': 'Stock',
  mmf: 'MMF',
  'real-estate': 'RE',
  'global-stocks': 'Stock',
  etf: 'ETF',
}

export const ASSET_CLASS_MOBILE_LABEL: Record<AssetClass, string> = {
  'nse-stocks': 'Stock',
  mmf: 'Money mkt funds',
  'real-estate': 'Real estate',
  'global-stocks': 'Stock',
  etf: 'ETFs',
}

export const ASSET_CLASS_INITIAL: Record<AssetClass, string> = {
  'nse-stocks': 'S',
  mmf: 'M',
  'real-estate': 'R',
  'global-stocks': 'S',
  etf: 'E',
}

const STOCK_ASSET_CLASSES = new Set<AssetClass>(['nse-stocks', 'global-stocks'])

export interface DisplayClassSegment {
  key: string
  label: string
  valueKES: number
  colorClass: AssetClass
}

/** Merge NSE/global stock buckets into a single Stock segment for charts/legends. */
export function mergeClassesForDisplay(classes: StackClassSummary[]): DisplayClassSegment[] {
  const map = new Map<string, DisplayClassSegment>()
  for (const row of classes) {
    if (row.valueKES <= 0 && row.positions <= 0) continue
    const ac = row.assetClass as AssetClass
    const key = STOCK_ASSET_CLASSES.has(ac) ? 'stock' : ac
    const label = STOCK_ASSET_CLASSES.has(ac) ? 'Stock' : ASSET_CLASS_SHORT[ac]
    const existing = map.get(key)
    if (existing) {
      existing.valueKES += row.valueKES
    } else {
      map.set(key, {
        key,
        label,
        valueKES: row.valueKES,
        colorClass: STOCK_ASSET_CLASSES.has(ac) ? 'global-stocks' : ac,
      })
    }
  }
  return [...map.values()]
}

export function colorForDisplaySegment(seg: DisplayClassSegment): string {
  return getAssetClassColorHex(seg.colorClass)
}

export function stackPositionsLabel(assetClass: AssetClass, count: number): string {
  if (assetClass === 'mmf') {
    return `${count} fund${count === 1 ? '' : 's'}`
  }
  return `${count} position${count === 1 ? '' : 's'}`
}

export function timeGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function firstNameFrom(fullName?: string | null): string {
  if (!fullName?.trim()) return 'there'
  return fullName.trim().split(/\s+/)[0] ?? 'there'
}

/** Outline buttons — buy = blue border, sell = red border */
export const STACK_BUY_BUTTON_CLASS =
  'border-2 border-primary bg-transparent text-primary shadow-none hover:bg-primary/10 hover:text-primary'

export const STACK_SELL_BUTTON_CLASS =
  'border-2 border-red-500 bg-transparent text-red-600 shadow-none hover:bg-red-500/10 hover:text-red-600 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-400'

export function stackTradeBadgeClass(isBuy: boolean): string {
  return isBuy
    ? 'border-2 border-primary bg-primary/5 text-primary'
    : 'border-2 border-red-500 bg-red-500/5 text-red-600 dark:text-red-400'
}
