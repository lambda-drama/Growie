'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePortfolio } from '@/hooks/use-portfolio'
import { analysePortfolio, getLatestPortfolioAnalysis } from '@/services/ai'
import {
  defaultInsightsFromPortfolio,
  mergeParsedWithDefaults,
  parsePortfolioAnalysis,
  type ParsedPortfolioAnalysis,
} from '@/lib/analysis-parse'
import { computeDashboardMetrics, groupByAssetClass } from '@/lib/dashboard-data'
import { useDisplayMoney } from '@/lib/store'
import { formatBarbsAIReply } from '@/lib/barbs-ai-text'

export function useBarbsInsights() {
  const { holdings, summary } = usePortfolio()
  const { kesPerUsd } = useDisplayMoney()
  const [analysisText, setAnalysisText] = useState('')
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [hasAnalysis, setHasAnalysis] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isAnalysing, setIsAnalysing] = useState(false)

  const metrics = useMemo(
    () => computeDashboardMetrics(holdings, summary, kesPerUsd),
    [holdings, summary, kesPerUsd]
  )
  const groups = useMemo(() => groupByAssetClass(holdings), [holdings])

  const portfolioStats = useMemo(() => {
    const total = groups.reduce((s, g) => s + g.totalValueKES, 0) || metrics.totalValueKES || 1
    const top = [...groups].sort((a, b) => b.totalValueKES - a.totalValueKES)[0]
    const topPct = top ? (top.totalValueKES / total) * 100 : 0
    return { topClassLabel: top ? top.name : 'holdings', topClassPct: topPct }
  }, [groups, metrics.totalValueKES])

  const defaultInsights = useMemo(
    () =>
      defaultInsightsFromPortfolio({
        classCount: groups.length,
        holdingCount: holdings.length,
        topClassLabel: portfolioStats.topClassLabel,
        topClassPct: portfolioStats.topClassPct,
        gainPercent: metrics.gainPercent,
      }),
    [groups.length, holdings.length, portfolioStats, metrics.gainPercent]
  )

  const insights: ParsedPortfolioAnalysis = useMemo(() => {
    if (!analysisText) return defaultInsights
    return mergeParsedWithDefaults(parsePortfolioAnalysis(analysisText), defaultInsights)
  }, [analysisText, defaultInsights])

  const loadSaved = useCallback(async () => {
    setLoading(true)
    try {
      const saved = await getLatestPortfolioAnalysis()
      if (saved?.answer) {
        setAnalysisText(formatBarbsAIReply(saved.answer))
        setGeneratedAt(saved.askedAt)
        setHasAnalysis(true)
      } else {
        setHasAnalysis(false)
      }
    } catch {
      setHasAnalysis(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSaved()
  }, [loadSaved])

  const runAnalysis = useCallback(async () => {
    setIsAnalysing(true)
    try {
      const result = await analysePortfolio()
      const text = formatBarbsAIReply(result.reply)
      if (!text.startsWith('⚠')) {
        setAnalysisText(text)
        setGeneratedAt(new Date().toISOString())
        setHasAnalysis(true)
      }
    } finally {
      setIsAnalysing(false)
    }
  }, [])

  return {
    insights,
    generatedAt,
    hasAnalysis,
    loading,
    isAnalysing,
    loadSaved,
    runAnalysis,
    holdingsCount: holdings.length,
  }
}
