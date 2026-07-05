'use client'

import { Sparkles, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AnalysisInsightCards } from '@/components/analysis/analysis-insight-cards'
import { useBarbsInsights } from '@/hooks/use-barbs-insights'
import { useAppStore } from '@/lib/store'
import type { InsightSectionKey } from '@/lib/analysis-parse'

export function DashboardBarbsAI() {
  const { setActiveTab } = useAppStore()
  const {
    insights,
    generatedAt,
    hasAnalysis,
    loading,
    isAnalysing,
    runAnalysis,
    holdingsCount,
  } = useBarbsInsights()

  const openAnalysis = (section?: InsightSectionKey) => {
    setActiveTab('analysis')
    if (section && typeof window !== 'undefined') {
      sessionStorage.setItem('growe_barbs_section', section)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <h2 className="text-lg font-bold text-foreground sm:text-xl">Barbs AI</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Strengths, risks, opportunities, and watchlist from your latest portfolio review.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => openAnalysis()}>
          Full analysis
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : holdingsCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Add holdings in My Stack to unlock Barbs AI insights on your dashboard.
          </p>
          <Button className="mt-4" size="sm" onClick={() => setActiveTab('stack')}>
            Go to My Stack
          </Button>
        </div>
      ) : !hasAnalysis ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-6 py-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm font-medium text-foreground">No analysis yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run your first Barbs AI review to see insights here and on AI Analysis.
          </p>
          <Button className="mt-4 gap-2" onClick={() => void runAnalysis()} disabled={isAnalysing}>
            {isAnalysing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Analyse my portfolio
          </Button>
        </div>
      ) : (
        <AnalysisInsightCards
          insights={insights}
          generatedAt={generatedAt}
          onRefresh={() => void runAnalysis()}
          isRefreshing={isAnalysing}
          onViewDetail={(section) => openAnalysis(section)}
        />
      )}
    </section>
  )
}
