'use client'

import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import {
  persistStackGroupingMode,
  readStoredStackGroupingMode,
  type StackGroupingMode,
} from '@/lib/stack-grouping-prefs'
import type { AssetClass, Holding, HealthScore, Currency, SubscriptionTier } from '@/types'

export type { StackGroupingMode }

/**
 * Global UI and portfolio state.
 * Authentication state lives in AuthProvider (providers/auth-provider.tsx).
 */
interface AppState {
  // User preferences (synced from auth context where needed)
  currency: Currency
  setCurrency: (currency: Currency) => void
  /** Multiply portfolio amounts stored in KES for Intl display (from ERPNext). */
  kesToDisplayMultiplier: number
  setKesToDisplayMultiplier: (n: number) => void
  /** 1 USD = X KES (ERPNext rate) — for converting per-share USD prices. */
  kesPerUsd: number
  setKesPerUsd: (n: number) => void
  subscriptionTier: SubscriptionTier
  setSubscriptionTier: (tier: SubscriptionTier) => void

  // Portfolio holdings
  holdings: Holding[]
  setHoldings: (holdings: Holding[]) => void
  addHolding: (holding: Holding) => void
  updateHolding: (id: string, updates: Partial<Holding>) => void
  removeHolding: (id: string) => void

  // Financial Health Score
  healthScore: HealthScore | null
  setHealthScore: (score: HealthScore) => void

  // UI state
  activeTab: string
  setActiveTab: (tab: string) => void
  isMobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  authModal: 'login' | 'signup' | null
  setAuthModal: (modal: 'login' | 'signup' | null) => void

  // My Stack drill-down
  stackNav:
    | { screen: 'overview' }
    | { screen: 'class'; assetClass: AssetClass }
    | { screen: 'position'; holdingId: string; assetClass: AssetClass }
  setStackNav: (
    nav:
      | { screen: 'overview' }
      | { screen: 'class'; assetClass: AssetClass }
      | { screen: 'position'; holdingId: string; assetClass: AssetClass }
  ) => void
  stackGroupingMode: StackGroupingMode
  setStackGroupingMode: (mode: StackGroupingMode) => void
  /** Restore grouping from localStorage after client mount (avoids SSR mismatch). */
  hydrateStackGroupingMode: () => void
}

// Exchange rates (simplified — fetch from a live API in production)
export const exchangeRates: Record<Currency, number> = {
  KES: 1,
  USD: 0.0077,
  EUR: 0.0071,
  GBP: 0.0061,
}

export const currencySymbols: Record<Currency, string> = {
  KES: 'KSh',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

export const useAppStore = create<AppState>((set) => ({
  // User preferences
  currency: 'USD',
  setCurrency: (currency) => set({ currency }),
  kesToDisplayMultiplier: 1,
  setKesToDisplayMultiplier: (n) => set({ kesToDisplayMultiplier: n }),
  kesPerUsd: 130,
  setKesPerUsd: (n) => set({ kesPerUsd: n }),
  subscriptionTier: 'free',
  setSubscriptionTier: (tier) => set({ subscriptionTier: tier }),

  // Portfolio
  holdings: [],
  setHoldings: (holdings) => set({ holdings }),
  addHolding: (holding) =>
    set((state) => ({ holdings: [...state.holdings, holding] })),
  updateHolding: (id, updates) =>
    set((state) => ({
      holdings: state.holdings.map((h) => (h.id === id ? { ...h, ...updates } : h)),
    })),
  removeHolding: (id) =>
    set((state) => ({ holdings: state.holdings.filter((h) => h.id !== id) })),

  // Health Score
  healthScore: null,
  setHealthScore: (score) => set({ healthScore: score }),

  // UI
  activeTab: 'landing',
  setActiveTab: (tab) => {
    const t = tab.trim().toLowerCase()
    set({ activeTab: t })
    if (typeof window === 'undefined') return

    const raw = window.location.hash.replace(/^#/, '').trim()
    const qi = raw.indexOf('?')
    const curPath = (qi >= 0 ? raw.slice(0, qi) : raw).trim().toLowerCase()
    const hasQuery = qi >= 0

    /** Don't clobber hashes like `#news?insight=GI-….` — hashchange/sync needs the query intact. */
    if (curPath === t && hasQuery) {
      return
    }
    /** Already sitting on this tab with no nested route — skip redundant `#tab` rewrite. */
    if (curPath === t && !hasQuery) {
      return
    }

    window.location.hash = `#${t}`
  },
  isMobileMenuOpen: false,
  setMobileMenuOpen: (open) => set({ isMobileMenuOpen: open }),
  authModal: null,
  setAuthModal: (modal) => set({ authModal: modal }),

  stackNav: { screen: 'overview' },
  setStackNav: (nav) => set({ stackNav: nav }),
  stackGroupingMode: 'ticker',
  setStackGroupingMode: (mode) => {
    persistStackGroupingMode(mode)
    set({ stackGroupingMode: mode })
  },
  hydrateStackGroupingMode: () => {
    const stored = readStoredStackGroupingMode()
    set({ stackGroupingMode: stored })
  },
}))

/** Subscribe to both code + ERPNext-derived multiplier so amounts update when rates load. */
export function useDisplayMoney() {
  return useAppStore(
    useShallow((s) => ({
      currency: s.currency,
      kesToDisplayMultiplier: s.kesToDisplayMultiplier,
      kesPerUsd: s.kesPerUsd,
    }))
  )
}
