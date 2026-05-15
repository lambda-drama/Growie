'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getGoals,
  getGoal,
  createGoal,
  updateGoal,
  deleteGoal,
  addGoalTransaction,
  type GroweGoal,
  type GroweGoalTransaction,
  type CreateGoalData,
  type AddGoalTransactionData,
} from '@/services/goals'
import { useAuth } from '@/providers/auth-provider'

export function useGoals() {
  const { isAuthenticated } = useAuth()
  const [goals, setGoals] = useState<GroweGoal[]>([])
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<GroweGoalTransaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadGoals = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await getGoals()
      setGoals(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  const loadGoalDetail = useCallback(
    async (goalId: string) => {
      if (!isAuthenticated) return
      setIsLoading(true)
      setError(null)
      try {
        const detail = await getGoal(goalId)
        if (detail) {
          setSelectedGoalId(goalId)
          setTransactions(detail.transactions)
          setGoals((prev) => {
            const idx = prev.findIndex((g) => g.id === goalId)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = detail.goal
              return next
            }
            return [...prev, detail.goal]
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load goal')
      } finally {
        setIsLoading(false)
      }
    },
    [isAuthenticated]
  )

  const selectGoal = useCallback(
    (goalId: string | null) => {
      setSelectedGoalId(goalId)
      if (goalId) {
        loadGoalDetail(goalId)
      } else {
        setTransactions([])
      }
    },
    [loadGoalDetail]
  )

  const addGoal = useCallback(
    async (data: CreateGoalData) => {
      const goal = await createGoal(data)
      setGoals((prev) => [goal, ...prev])
      return goal
    },
    []
  )

  const patchGoal = useCallback(async (goalId: string, data: Partial<CreateGoalData> & { status?: string }) => {
    const goal = await updateGoal(goalId, data)
    setGoals((prev) => prev.map((g) => (g.id === goalId ? goal : g)))
    return goal
  }, [])

  const removeGoal = useCallback(async (goalId: string) => {
    await deleteGoal(goalId)
    setGoals((prev) => prev.filter((g) => g.id !== goalId))
    if (selectedGoalId === goalId) {
      setSelectedGoalId(null)
      setTransactions([])
    }
  }, [selectedGoalId])

  const recordTransaction = useCallback(async (data: AddGoalTransactionData) => {
    const result = await addGoalTransaction(data)
    setGoals((prev) => prev.map((g) => (g.id === result.goal.id ? result.goal : g)))
    if (selectedGoalId === data.goalId) {
      setTransactions((prev) => [result.transaction, ...prev])
    }
    return result
  }, [selectedGoalId])

  useEffect(() => {
    loadGoals()
  }, [loadGoals])

  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? null

  const goalCurrencies = [...new Set(goals.map((g) => (g.currency || 'USD').toUpperCase()))]
  const totalsCurrency = goalCurrencies.length === 1 ? goalCurrencies[0] : null
  const totals = {
    saved: goals.reduce((sum, g) => sum + g.currentAmount, 0),
    target: goals.reduce((sum, g) => sum + g.targetAmount, 0),
    activeCount: goals.filter((g) => g.status === 'Active').length,
    currency: totalsCurrency,
    mixedCurrencies: goalCurrencies.length > 1,
  }

  return {
    goals,
    selectedGoal,
    selectedGoalId,
    transactions,
    totals,
    isLoading,
    error,
    loadGoals,
    selectGoal,
    addGoal,
    patchGoal,
    removeGoal,
    recordTransaction,
  }
}
