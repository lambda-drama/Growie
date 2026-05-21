import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { getHoldings, getPortfolioSummary, type PortfolioSummary } from '@/services/portfolio'
import { refreshStockPrices } from '@/services/markets'
import { useAuth } from '@/providers/auth-provider'

export function usePortfolio() {
  const { isAuthenticated } = useAuth()
  const { holdings, setHoldings, addHolding, updateHolding, removeHolding } = useAppStore()
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPortfolio = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    setError(null)
    try {
      const [holdingsData, summaryData] = await Promise.all([
        getHoldings(),
        getPortfolioSummary(),
      ])
      setHoldings(holdingsData)
      if (summaryData) setSummary(summaryData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, setHoldings])

  /** Fetches live prices for all listed tickers (holdings first), updates cache + holding values, then reloads portfolio. */
  const refresh = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    setError(null)
    let priceRefreshError: string | null = null
    try {
      await refreshStockPrices()
    } catch (err) {
      priceRefreshError =
        err instanceof Error ? err.message : 'Live prices could not be refreshed from your APIs'
    }
    try {
      const [holdingsData, summaryData] = await Promise.all([
        getHoldings(),
        getPortfolioSummary(),
      ])
      setHoldings(holdingsData)
      if (summaryData) setSummary(summaryData)
      if (priceRefreshError) setError(priceRefreshError)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, setHoldings])

  useEffect(() => {
    loadPortfolio()
  }, [loadPortfolio])

  return {
    holdings,
    summary,
    isLoading,
    error,
    refresh,
    reload: loadPortfolio,
    addHolding,
    updateHolding,
    removeHolding,
  }
}
