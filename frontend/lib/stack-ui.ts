import type { AssetClass } from '@/types'

export const ASSET_CLASS_SHORT: Record<AssetClass, string> = {
  'nse-stocks': 'NSE',
  mmf: 'MMF',
  'real-estate': 'RE',
  'global-stocks': 'Global',
}

export const ASSET_CLASS_MOBILE_LABEL: Record<AssetClass, string> = {
  'nse-stocks': 'NSE stocks',
  mmf: 'Money mkt funds',
  'real-estate': 'Real estate',
  'global-stocks': 'Global stocks',
}

export const ASSET_CLASS_INITIAL: Record<AssetClass, string> = {
  'nse-stocks': 'N',
  mmf: 'M',
  'real-estate': 'R',
  'global-stocks': 'G',
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
