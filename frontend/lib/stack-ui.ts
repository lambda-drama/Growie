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
