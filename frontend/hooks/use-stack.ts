'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getStackOverview,
  getStackClass,
  getStackPosition,
  refreshStackPrices,
  type StackClassSummary,
  type StackClassDetail,
  type StackPositionDetail,
} from '@/services/stack'
import { useAuth } from '@/providers/auth-provider'
import type { AssetClass } from '@/types'

export function useStackOverview() {
  const { isAuthenticated } = useAuth()
  const [classes, setClasses] = useState<StackClassSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isAuthenticated) return
    setClasses(await getStackOverview())
  }, [isAuthenticated])

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    setError(null)
    let priceRefreshError: string | null = null
    try {
      await refreshStackPrices()
    } catch (err) {
      priceRefreshError =
        err instanceof Error ? err.message : 'Live prices could not be refreshed from your APIs'
    }
    try {
      await load()
      if (priceRefreshError) setError(priceRefreshError)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stack')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, load])

  useEffect(() => {
    if (!isAuthenticated) return
    setIsLoading(true)
    setError(null)
    load()
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load stack')
      )
      .finally(() => setIsLoading(false))
  }, [isAuthenticated, load])

  return { classes, isLoading, error, refresh }
}

export function useStackClass(assetClass: AssetClass | null) {
  const { isAuthenticated } = useAuth()
  const [detail, setDetail] = useState<StackClassDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isAuthenticated || !assetClass) return
    setDetail(await getStackClass(assetClass))
  }, [isAuthenticated, assetClass])

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !assetClass) return
    setIsLoading(true)
    setError(null)
    let priceRefreshError: string | null = null
    try {
      await refreshStackPrices({ assetClass })
    } catch (err) {
      priceRefreshError =
        err instanceof Error ? err.message : 'Live prices could not be refreshed from your APIs'
    }
    try {
      await load()
      if (priceRefreshError) setError(priceRefreshError)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset class')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, assetClass, load])

  useEffect(() => {
    if (!isAuthenticated || !assetClass) return
    setIsLoading(true)
    setError(null)
    load()
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load asset class')
      )
      .finally(() => setIsLoading(false))
  }, [isAuthenticated, assetClass, load])

  return { detail, isLoading, error, refresh }
}

export function useStackPosition(holdingId: string | null) {
  const { isAuthenticated } = useAuth()
  const [detail, setDetail] = useState<StackPositionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isAuthenticated || !holdingId) return
    setDetail(await getStackPosition(holdingId))
  }, [isAuthenticated, holdingId])

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !holdingId) return
    setIsLoading(true)
    setError(null)
    let priceRefreshError: string | null = null
    try {
      await refreshStackPrices({ holdingId })
    } catch (err) {
      priceRefreshError =
        err instanceof Error ? err.message : 'Live prices could not be refreshed from your APIs'
    }
    try {
      await load()
      if (priceRefreshError) setError(priceRefreshError)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load position')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, holdingId, load])

  useEffect(() => {
    if (!isAuthenticated || !holdingId) return
    setIsLoading(true)
    setError(null)
    load()
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load position')
      )
      .finally(() => setIsLoading(false))
  }, [isAuthenticated, holdingId, load])

  return { detail, isLoading, error, refresh }
}
