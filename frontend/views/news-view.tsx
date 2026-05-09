'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, Clock, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getStockPicks, type StockPickRaw } from '@/services/markets'
import { getLearningBites, markBiteRead } from '@/services/insights'

type NewsCategory = 'all' | 'kenya' | 'global'

const categories: { id: NewsCategory; label: string }[] = [
  { id: 'all', label: 'All Insights' },
  { id: 'kenya', label: 'Kenya (NSE)' },
  { id: 'global', label: 'Global' },
]

const sentimentConfig: Record<string, { label: string; className: string }> = {
  buy: { label: 'Buy', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  hold: { label: 'Hold', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  watch: { label: 'Watch', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
}

function getInsightIdFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.location.hash.replace(/^#/, '').trim()
  const q = raw.split('?', 2)[1]
  if (!q) return null
  const path = raw.split('?', 2)[0].toLowerCase()
  if (path !== 'news') return null
  return new URLSearchParams(q).get('insight')
}

function navigateToInsightList() {
  if (typeof window === 'undefined') return
  window.location.hash = '#news'
}

function navigateToInsight(id: string) {
  if (typeof window === 'undefined') return
  window.location.hash = `#news?insight=${encodeURIComponent(id)}`
}

function commentarySnippet(html: string, maxLen: number): string {
  if (!html) return ''
  const t = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return ''
  return t.length <= maxLen ? t : `${t.slice(0, maxLen).trim()}…`
}

export function NewsView() {
  const [activeCategory, setActiveCategory] = useState<NewsCategory>('all')
  const [picks, setPicks] = useState<StockPickRaw[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [readBites, setReadBites] = useState<Set<string>>(new Set())

  /** Which insight detail is showing (mirrors `#news?insight=id` when synced). */
  const [focusedInsightId, setFocusedInsightId] = useState<string | null>(() => getInsightIdFromHash())

  const syncFocusedFromHash = useCallback(() => {
    setFocusedInsightId(getInsightIdFromHash())
  }, [])

  useEffect(() => {
    syncFocusedFromHash()
    window.addEventListener('hashchange', syncFocusedFromHash)
    return () => window.removeEventListener('hashchange', syncFocusedFromHash)
  }, [syncFocusedFromHash])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [focusedInsightId])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [stockPicks, bites] = await Promise.all([
          getStockPicks(),
          getLearningBites().catch(() => []),
        ])
        setPicks(stockPicks)
        setReadBites(new Set(bites.filter((b) => b.isRead).map((b) => b.id)))
      } catch {
        setPicks([])
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const filteredPicks = useMemo(
    () =>
      activeCategory === 'all'
        ? picks
        : picks.filter((p) => {
            const m = (p.market ?? '').toLowerCase()
            return activeCategory === 'kenya' ? m === 'nse' : m !== 'nse'
          }),
    [picks, activeCategory]
  )

  const focusedPick = useMemo(
    () =>
      focusedInsightId ? filteredPicks.find((p) => p.id === focusedInsightId) ?? picks.find((p) => p.id === focusedInsightId) ?? null : null,
    [focusedInsightId, filteredPicks, picks]
  )

  const handleMarkRead = async (biteId: string) => {
    try {
      await markBiteRead(biteId)
      setReadBites((prev) => new Set([...prev, biteId]))
    } catch {
      // ignore — user may not be logged in
    }
  }

  const openInsight = (id: string) => {
    if (!id) return
    // Update UI immediately — hash syncing alone can lose `?insight=` if listeners race.
    setFocusedInsightId(id)
    navigateToInsight(id)
  }

  const clearInsightDeepLink = useCallback(() => {
    setFocusedInsightId(null)
    navigateToInsightList()
  }, [])

  const closeInsight = () => clearInsightDeepLink()

  /** Invalid insight id → back to grid */
  useEffect(() => {
    if (!focusedInsightId || isLoading || focusedPick) return
    const anywhere = picks.find((p) => p.id === focusedInsightId)
    if (!anywhere) clearInsightDeepLink()
  }, [focusedInsightId, focusedPick, isLoading, picks, clearInsightDeepLink])

  if (focusedInsightId && isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-3 sm:px-0 pb-24">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-[min(70vh,520px)] w-full rounded-xl" />
      </div>
    )
  }

  if (focusedInsightId && focusedPick) {
    const sentiment = sentimentConfig[focusedPick.sentiment] ?? sentimentConfig.watch
    const bite = focusedPick.learningBite

    return (
      <div className="mx-auto max-w-3xl space-y-6 px-3 sm:px-0 pb-24">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" onClick={closeInsight}>
          <ArrowLeft className="h-4 w-4" />
          Back to insights
        </Button>

        <article className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {focusedPick.ticker && (
              <span className="rounded bg-secondary/15 px-2 py-0.5 font-semibold text-secondary">
                {focusedPick.ticker}
              </span>
            )}
            <span className="rounded bg-muted px-2 py-0.5 font-medium uppercase">{focusedPick.market}</span>
            <span className={cn('rounded-full px-2 py-0.5 font-medium capitalize', sentiment.className)}>
              {sentiment.label}
            </span>
            {focusedPick.isPro && <Badge variant="secondary">PRO</Badge>}
            {focusedPick.isScopePartner && <Badge variant="outline">Scope Markets</Badge>}
            <span className="ml-auto flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {focusedPick.weekStarting
                ? `Week of ${new Date(focusedPick.weekStarting).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : focusedPick.publishedAt
                  ? formatDateRelative(focusedPick.publishedAt)
                  : ''}
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground md:text-3xl">{focusedPick.title}</h1>

          <div
            className="mt-6 space-y-4 text-[15px] leading-relaxed prose prose-neutral max-w-none dark:prose-invert prose-headings:font-semibold prose-p:text-foreground/90 prose-a:text-primary"
            dangerouslySetInnerHTML={{ __html: focusedPick.commentary }}
          />

          {bite && (
            <div className="mt-10 rounded-xl bg-muted/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-semibold text-foreground">
                  <BookOpen className="h-4 w-4 text-primary shrink-0" />
                  Learning Bite · {bite.topic}
                </p>
                {!readBites.has(bite.id) ? (
                  <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => handleMarkRead(bite.id)}>
                    Mark as read
                  </button>
                ) : (
                  <span className="text-sm text-muted-foreground">✓ Read</span>
                )}
              </div>
              {bite.title && <h2 className="mt-2 text-lg font-semibold text-foreground">{bite.title}</h2>}
              <div
                className="mt-4 space-y-3 text-[15px] leading-relaxed prose prose-neutral prose-sm max-w-none dark:prose-invert prose-p:text-foreground/90"
                dangerouslySetInnerHTML={{ __html: bite.explanation }}
              />
            </div>
          )}
        </article>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-3 sm:px-0 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Weekly Insights</h1>
        <p className="text-muted-foreground">Curated market analysis and investment stories</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant={activeCategory === cat.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat.id)}
            className={cn('shrink-0', activeCategory === cat.id && 'bg-primary text-primary-foreground')}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredPicks.length === 0 ? (
        <div className="py-16 text-center">
          <TrendingUp className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">No insights yet. Check back soon.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredPicks.map((pick) => {
            const sentiment = sentimentConfig[pick.sentiment] ?? sentimentConfig.watch
            const snippet = commentarySnippet(pick.commentary, 140)
            const dateLabel =
              pick.weekStarting
                ? new Date(pick.weekStarting).toLocaleDateString('en-KE', {
                    day: 'numeric',
                    month: 'short',
                  })
                : pick.publishedAt
                  ? formatDateRelative(pick.publishedAt)
                  : ''

            return (
              <Card
                key={pick.id}
                role="link"
                tabIndex={0}
                className="group overflow-hidden rounded-xl border-border/80 shadow-sm transition-shadow hover:border-primary/30 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => openInsight(pick.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openInsight(pick.id)
                  }
                }}
              >
                <CardContent className="flex h-full flex-col p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {pick.ticker ? (
                      <span className="rounded bg-secondary/15 px-1.5 py-0.5 font-bold text-secondary normal-case">{pick.ticker}</span>
                    ) : null}
                    <span className="rounded bg-muted px-1.5 py-0.5 font-semibold">{pick.market}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-tight normal-case', sentiment.className)}>
                      {sentiment.label}
                    </span>
                    <span className="ml-auto flex items-center gap-1 normal-case">
                      <Clock className="h-3 w-3 opacity-70" />
                      <span>{dateLabel}</span>
                    </span>
                  </div>
                  {pick.isPro ? (
                    <div className="mt-2">
                      <Badge variant="secondary" className="text-[10px]">
                        PRO
                      </Badge>
                    </div>
                  ) : null}
                  <h2 className="mt-3 text-base font-semibold leading-snug text-foreground group-hover:text-primary line-clamp-3">
                    {pick.title}
                  </h2>
                  {snippet ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-3 flex-1">{snippet}</p> : null}
                  {pick.learningBite?.topic ? (
                    <div className="mt-4 flex items-center gap-1 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5 text-primary opacity-90" />
                      <span>Bite:</span>
                      <span className="font-medium text-foreground/80 truncate">{pick.learningBite.topic}</span>
                    </div>
                  ) : (
                    <div className="mt-auto pt-6" />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
