'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Sparkles,
  AlertTriangle,
  Send,
  Loader2,
  Bot,
  User,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { usePortfolio } from '@/hooks/use-portfolio'
import { useAppStore } from '@/lib/store'
import {
  getProviderStatus,
  chat,
  analysePortfolio,
  getLatestPortfolioAnalysis,
  type AIProviderStatus,
  type ChatMessage,
} from '@/services/ai'
import {
  computeDashboardMetrics,
  groupByAssetClass,
  getNetPortfolioSeries,
} from '@/lib/dashboard-data'
import {
  parsePortfolioAnalysis,
  defaultInsightsFromPortfolio,
  mergeParsedWithDefaults,
} from '@/lib/analysis-parse'
import { BarbsAIBadge } from '@/components/analysis/barbs-ai-badge'
import { AnalysisMetricsRow } from '@/components/analysis/analysis-metrics-row'
import { AnalysisInsightCards } from '@/components/analysis/analysis-insight-cards'
import { AnalysisRecommendations } from '@/components/analysis/analysis-recommendations'
import { AnalysisFollowUps } from '@/components/analysis/analysis-follow-ups'
import { formatBarbsAIReply } from '@/lib/barbs-ai-text'

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
          isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'
        )}
      >
        {formatBarbsAIReply(msg.content)}
      </div>
    </div>
  )
}

export function AnalysisView() {
  const { isAuthenticated } = useAuth()
  const { setAuthModal } = useAppStore()
  const { holdings, summary } = usePortfolio()

  const [providerStatus, setProviderStatus] = useState<AIProviderStatus | null>(null)
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [hasAnalysis, setHasAnalysis] = useState(false)
  const [analysisText, setAnalysisText] = useState('')
  const [analysisGeneratedAt, setAnalysisGeneratedAt] = useState<string | null>(null)
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const [askInput, setAskInput] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const metrics = useMemo(
    () => computeDashboardMetrics(holdings, summary),
    [holdings, summary]
  )

  const groups = useMemo(() => groupByAssetClass(holdings), [holdings])
  const series6 = useMemo(() => getNetPortfolioSeries(holdings, 6), [holdings])

  const gain6Mo = useMemo(() => {
    if (series6.length < 2) return metrics.gainPercent
    const first = series6[0].valueKES
    const last = series6[series6.length - 1].valueKES
    return first > 0 ? ((last - first) / first) * 100 : metrics.gainPercent
  }, [series6, metrics.gainPercent])

  const portfolioStats = useMemo(() => {
    const total = groups.reduce((s, g) => s + g.totalValueKES, 0) || metrics.totalValueKES || 1
    const top = [...groups].sort((a, b) => b.totalValueKES - a.totalValueKES)[0]
    const topPct = top ? (top.totalValueKES / total) * 100 : 0
    const diversificationScore = Math.min(100, groups.length * 18 + Math.min(28, holdings.length * 4))
    const divLabel =
      diversificationScore >= 75 ? 'Good' : diversificationScore >= 50 ? 'Fair' : 'Needs work'
    let riskLevel = 'Low'
    let riskSub = 'Well balanced'
    if (topPct >= 50) {
      riskLevel = 'High'
      riskSub = 'Concentrated portfolio'
    } else if (topPct >= 30) {
      riskLevel = 'Moderate'
      riskSub = 'Well balanced'
    }
    const aiConfidence = hasAnalysis
      ? Math.min(95, Math.max(70, Math.round(diversificationScore * 0.6 + 25)))
      : Math.min(85, Math.round(diversificationScore * 0.5 + 30))

    return {
      diversificationScore,
      divLabel,
      riskLevel,
      riskSub,
      aiConfidence,
      topClassLabel: top ? top.name : 'holdings',
      topClassPct: topPct,
    }
  }, [groups, holdings.length, metrics.totalValueKES, hasAnalysis])

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

  const parsedInsights = useMemo(() => {
    if (!analysisText) return defaultInsights
    return mergeParsedWithDefaults(parsePortfolioAnalysis(analysisText), defaultInsights)
  }, [analysisText, defaultInsights])

  const loadProvider = useCallback(async () => {
    if (!isAuthenticated) return
    const s = await getProviderStatus()
    setProviderStatus(s)
  }, [isAuthenticated])

  const loadSavedAnalysis = useCallback(async () => {
    if (!isAuthenticated) {
      setLoadingSaved(false)
      return
    }
    setLoadingSaved(true)
    try {
      const saved = await getLatestPortfolioAnalysis()
      if (saved?.answer) {
        setAnalysisText(formatBarbsAIReply(saved.answer))
        setAnalysisGeneratedAt(saved.askedAt)
        setHasAnalysis(true)
      }
    } catch {
      // ignore
    } finally {
      setLoadingSaved(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    loadProvider()
    loadSavedAnalysis()
  }, [loadProvider, loadSavedAnalysis])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isSending, chatOpen])

  const runAnalysis = async () => {
    setIsAnalysing(true)
    setAnalysisError(null)
    try {
      const result = await analysePortfolio()
      const text = formatBarbsAIReply(result.reply)
      if (text.startsWith('⚠')) {
        setAnalysisError(text.replace(/^⚠\s*/, ''))
        return
      }
      setAnalysisText(text)
      setAnalysisGeneratedAt(new Date().toISOString())
      setHasAnalysis(true)
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Could not analyse portfolio.')
    } finally {
      setIsAnalysing(false)
    }
  }

  const sendQuestion = async (text: string) => {
    const q = text.trim()
    if (!q || isSending) return
    setAskInput('')
    setChatOpen(true)
    setChatMessages((prev) => [...prev, { role: 'user', content: q }])
    setIsSending(true)
    try {
      const result = await chat(q)
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: formatBarbsAIReply(result.reply) },
      ])
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Something went wrong. Try again shortly.',
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const seed = sessionStorage.getItem('growe_barbs_chat_seed')
    if (!seed) return
    sessionStorage.removeItem('growe_barbs_chat_seed')
    void sendQuestion(seed)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const notConfigured = providerStatus !== null && !providerStatus.configured
  const showEmpty = !loadingSaved && !hasAnalysis && !isAnalysing
  const showResults = hasAnalysis && !showEmpty

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-950">
          <Sparkles className="h-8 w-8 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AI Analysis</h1>
          <p className="mt-2 text-muted-foreground">
            Analyse your portfolio with Barbs AI — sign in to get started.
          </p>
        </div>
        <Button onClick={() => setAuthModal('login')}>Sign In</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      {/* Header + ask bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Sparkles className="h-6 w-6 text-violet-600" />
              AI Analysis
            </h1>
            <BarbsAIBadge />
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Analyse my portfolio, get recommendations, ask follow-up questions.
          </p>
        </div>
        <form
          className="flex w-full max-w-md gap-2 lg:mt-1"
          onSubmit={(e) => {
            e.preventDefault()
            sendQuestion(askInput)
          }}
        >
          <Input
            placeholder="Ask Barbs AI anything about your portfolio…"
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            disabled={notConfigured || isSending}
            className="h-11"
          />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!askInput.trim() || isSending || notConfigured}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>

      {notConfigured && (
        <Card className="border-yellow-400/50 bg-yellow-50 dark:bg-yellow-900/10">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
            <div>
              <p className="font-semibold text-yellow-800 dark:text-yellow-300">Barbs AI is not available</p>
              <p className="text-yellow-700 dark:text-yellow-400">
                {providerStatus?.reason ?? 'Configure an AI provider in Growe Settings to enable analysis.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* First visit / no saved analysis */}
      {showEmpty && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-950">
              <Sparkles className="h-7 w-7 text-violet-600" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Ready to analyse your portfolio?</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Barbs AI will review your holdings, diversification, risks, and opportunities. Your last analysis is saved
              so you can return anytime without re-running unless you choose to.
            </p>
            {holdings.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Add holdings in My Stack first, then run analysis.</p>
            ) : (
              <Button
                className="mt-6 gap-2"
                size="lg"
                onClick={runAnalysis}
                disabled={isAnalysing || notConfigured || holdings.length === 0}
              >
                {isAnalysing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Analysing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Analyse my portfolio
                  </>
                )}
              </Button>
            )}
            {analysisError && <p className="mt-4 text-sm text-destructive">{analysisError}</p>}
          </CardContent>
        </Card>
      )}

      {(isAnalysing || loadingSaved) && !showResults && !showEmpty && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      )}

      {showResults && (
        <>
          <AnalysisMetricsRow
            totalValueKES={metrics.totalValueKES}
            gainPercent6Mo={gain6Mo}
            diversificationScore={portfolioStats.diversificationScore}
            diversificationLabel={portfolioStats.divLabel}
            riskLevel={portfolioStats.riskLevel}
            riskSub={portfolioStats.riskSub}
            aiConfidence={portfolioStats.aiConfidence}
          />

          <AnalysisInsightCards
            insights={parsedInsights}
            generatedAt={analysisGeneratedAt}
            onRefresh={runAnalysis}
            isRefreshing={isAnalysing}
            onViewDetail={(prompt) => {
              setChatOpen(true)
              sendQuestion(prompt)
            }}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <AnalysisRecommendations
              recommendations={parsedInsights.recommendations}
              onAskQuestion={(q) => sendQuestion(q)}
            />
            <AnalysisFollowUps onAsk={(q) => (q ? sendQuestion(q) : setChatOpen(true))} />
          </div>

          {analysisError && <p className="text-sm text-destructive">{analysisError}</p>}
        </>
      )}

      {/* Inline chat panel */}
      {chatOpen && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Chat with Barbs AI</p>
              <Button variant="ghost" size="sm" onClick={() => setChatOpen(false)}>
                Close
              </Button>
            </div>
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {chatMessages.map((m, i) => (
                <ChatBubble key={i} msg={m} />
              ))}
              {isSending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Barbs AI is thinking…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <strong>Barbs AI</strong> provides insights based on your portfolio data and market analysis. Always consult with a
        financial advisor for personalized advice.
      </p>
    </div>
  )
}
