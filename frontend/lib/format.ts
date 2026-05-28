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

/** Convert a native per-share (or row) amount to KES using ERPNext USD rate when needed. */
export function nativeAmountToKes(
  amountNative: number,
  nativeCurrency: string,
  kesPerUsd: number
): number {
  const code = (nativeCurrency || 'USD').toUpperCase()
  const value = Number.isFinite(amountNative) ? amountNative : 0
  if (code === 'KES') return value
  if (code === 'USD') {
    const kpu = kesPerUsd > 0 ? kesPerUsd : 1
    return value * kpu
  }
  return value
}

/** Convert native holding currency → header display currency (via KES hub). */
export function nativeAmountToDisplay(
  amountNative: number,
  nativeCurrency: string,
  displayCurrency: string,
  kesPerUsd: number,
  kesToDisplayMultiplier: number
): number {
  const native = (nativeCurrency || 'USD').toUpperCase()
  const display = (displayCurrency || 'KES').toUpperCase()
  const parsed = Number(amountNative)
  const value = Number.isFinite(parsed) ? parsed : 0
  if (native === display) return value
  const amountKes = nativeAmountToKes(value, native, kesPerUsd)
  if (display === 'KES') return amountKes
  const m = kesToDisplayMultiplier > 0 ? kesToDisplayMultiplier : 1
  return amountKes * m
}

/** Format an amount already expressed in the display currency (no second FX pass). */
export function formatDisplayAmount(
  amount: number,
  displayCurrency: Currency = 'KES',
  options?: { compact?: boolean }
): string {
  const code = (displayCurrency || 'KES').toUpperCase()
  const converted = Number.isFinite(amount) ? amount : 0

  if (options?.compact && Math.abs(converted) >= 1000000) {
    try {
      return new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: code,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(converted)
    } catch {
      return `${code} ${(converted / 1000000).toFixed(2)}M`
    }
  }

  if (options?.compact && Math.abs(converted) >= 1000) {
    try {
      return new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: code,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(converted)
    } catch {
      return `${code} ${(converted / 1000).toFixed(1)}K`
    }
  }

  const maxFrac = Math.abs(converted) > 0 && Math.abs(converted) < 1 ? 4 : 2
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFrac,
    }).format(converted)
  } catch {
    const sym = currencySymbols[displayCurrency as keyof typeof currencySymbols] ?? code
    return `${sym}${converted.toLocaleString('en-KE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFrac,
    })}`
  }
}

/** Avg buy per share when API left buying_price at 0 (cost is in holding currency). */
export function effectiveAvgBuyNative(holding: {
  avgBuyPrice?: number
  costBasisKES?: number
  quantity?: number
}): number {
  if (holding.avgBuyPrice != null && holding.avgBuyPrice > 0) return holding.avgBuyPrice
  const qty = holding.quantity ?? 0
  const cost = holding.costBasisKES ?? 0
  return qty > 0 ? cost / qty : 0
}

/** Total position value in the holding's native currency (not KES). */
export function holdingPositionValueNative(holding: {
  valueNative?: number
  valueKES?: number
  quantity?: number
  currentPrice?: number
  avgBuyPrice?: number
  costBasisKES?: number
}): number {
  const native = Number(holding.valueNative)
  if (Number.isFinite(native) && native > 0) return native
  const legacy = Number(holding.valueKES)
  if (Number.isFinite(legacy) && legacy > 0) return legacy
  const qty = holding.quantity ?? 0
  const cur = Number(holding.currentPrice)
  if (qty > 0 && Number.isFinite(cur) && cur > 0) return cur * qty
  const avg = effectiveAvgBuyNative(holding)
  if (qty > 0 && avg > 0) return avg * qty
  return 0
}

/** Format total position value in the header display currency. */
export function formatHoldingPositionValue(
  holding: {
    valueNative?: number
    valueKES?: number
    quantity?: number
    currentPrice?: number
    avgBuyPrice?: number
    costBasisKES?: number
    currency?: string
  },
  displayCurrency: Currency,
  options: { kesToDisplayMultiplier: number; kesPerUsd: number; compact?: boolean }
): string {
  return formatHoldingMoney(
    holdingPositionValueNative(holding),
    (holding.currency || 'USD') as Currency,
    displayCurrency,
    options
  )
}

/**
 * Format a holding amount stored in its row currency (per-share or total position value).
 */
export function formatHoldingMoney(
  amountNative: number,
  nativeCurrency: Currency,
  displayCurrency: Currency,
  options: { kesToDisplayMultiplier: number; kesPerUsd: number; compact?: boolean }
): string {
  const displayAmount = nativeAmountToDisplay(
    amountNative,
    nativeCurrency,
    displayCurrency,
    options.kesPerUsd,
    options.kesToDisplayMultiplier
  )
  return formatDisplayAmount(displayAmount, displayCurrency, { compact: options.compact })
}

/**
 * Formats an amount already in its own currency (no conversion).
 * Use for goals/transactions stored in a fixed currency — not header display toggle.
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
    etf: 'ETFs',
  }
  return names[assetClass] || assetClass
}

export function getAssetClassColor(assetClass: string): string {
  const colors: Record<string, string> = {
    'mmf': 'bg-chart-1',
    'real-estate': 'bg-chart-2',
    'nse-stocks': 'bg-chart-3',
    'global-stocks': 'bg-chart-4',
    etf: 'bg-chart-5',
  }
  return colors[assetClass] || 'bg-chart-5'
}

export function getAssetClassColorHex(assetClass: string): string {
  const colors: Record<string, string> = {
    'mmf': '#2E7D32',       // Green
    'real-estate': '#D4A24C', // Gold
    'nse-stocks': '#1E3A5F',  // Navy
    'global-stocks': '#0D9488', // Teal
    etf: '#6366F1', // Indigo
  }
  return colors[assetClass] || '#6B7280'
}
