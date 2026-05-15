'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getStackOverview,
  getStackClass,
  getStackPosition,
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

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    setError(null)
    try {
      setClasses(await getStackOverview())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stack')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { classes, isLoading, error, refresh }
}

export function useStackClass(assetClass: AssetClass | null) {
  const { isAuthenticated } = useAuth()
  const [detail, setDetail] = useState<StackClassDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !assetClass) return
    setIsLoading(true)
    setError(null)
    try {
      setDetail(await getStackClass(assetClass))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset class')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, assetClass])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { detail, isLoading, error, refresh }
}

export function useStackPosition(holdingId: string | null) {
  const { isAuthenticated } = useAuth()
  const [detail, setDetail] = useState<StackPositionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !holdingId) return
    setIsLoading(true)
    setError(null)
    try {
      setDetail(await getStackPosition(holdingId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load position')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, holdingId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { detail, isLoading, error, refresh }
}
