import type { Currency } from './types'
import { currencySymbols, useAppStore } from './store'

export function formatCurrency(
  amountKES: number,
  currency: Currency = 'KES',
  options?: { compact?: boolean; kesToDisplayMultiplier?: number }
): string {
  const code = (currency || 'KES').toUpperCase()

  /** Prefer explicit multiplier from useDisplayMoney() so UI re-renders when ERPNext rate arrives. */
  const mult =
    options?.kesToDisplayMultiplier ??
    useAppStore.getState().kesToDisplayMultiplier

  let converted: number
  if (code === 'KES') {
    converted = amountKES
  } else {
    const m = typeof mult === 'number' && mult > 0 ? mult : 1
    converted = amountKES * m
  }

  if (options?.compact && converted >= 1000000) {
    try {
      const nf = new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: code,
        notation: 'compact',
        maximumFractionDigits: 1,
      })
      return nf.format(converted)
    } catch {
      return `${code} ${(converted / 1000000).toFixed(2)}M`
    }
  }

  if (options?.compact && converted >= 1000) {
    try {
      const nf = new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: code,
        notation: 'compact',
        maximumFractionDigits: 1,
      })
      return nf.format(converted)
    } catch {
      return `${code} ${(converted / 1000).toFixed(1)}K`
    }
  }

  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(converted)
  } catch {
    const sym = currencySymbols[currency as keyof typeof currencySymbols] ?? code
    return `${sym}${converted.toLocaleString('en-KE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  }
}

/**
 * Formats an amount already in its own currency (no conversion).
 * Use this when a row/record stores its native amount and currency together.
 */
export function formatCurrencyNative(
  amount: number,
  currency: Currency = 'USD',
  options?: { compact?: boolean }
): string {
  const code = (currency || 'USD').toUpperCase()
  const value = Number.isFinite(amount) ? amount : 0

  if (options?.compact && Math.abs(value) >= 1000) {
    try {
      return new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: code,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value)
    } catch {
      return `${code} ${value.toLocaleString('en-KE', { maximumFractionDigits: 1 })}`
    }
  }

  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    const sym = currencySymbols[currency as keyof typeof currencySymbols] ?? `${code} `
    return `${sym}${value.toLocaleString('en-KE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`
  }
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateRelative(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

export function formatPercentage(value: number, decimals = 1): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-KE')
}

export function getAssetClassName(assetClass: string): string {
  const names: Record<string, string> = {
    'mmf': 'Money Market Funds',
    'real-estate': 'Real Estate',
    'nse-stocks': 'NSE Stocks',
    'global-stocks': 'Global Stocks',
  }
  return names[assetClass] || assetClass
}

export function getAssetClassColor(assetClass: string): string {
  const colors: Record<string, string> = {
    'mmf': 'bg-chart-1',
    'real-estate': 'bg-chart-2',
    'nse-stocks': 'bg-chart-3',
    'global-stocks': 'bg-chart-4',
  }
  return colors[assetClass] || 'bg-chart-5'
}

export function getAssetClassColorHex(assetClass: string): string {
  const colors: Record<string, string> = {
    'mmf': '#2E7D32',       // Green
    'real-estate': '#D4A24C', // Gold
    'nse-stocks': '#1E3A5F',  // Navy
    'global-stocks': '#0D9488', // Teal
  }
  return colors[assetClass] || '#6B7280'
}
