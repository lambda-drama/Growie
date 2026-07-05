'use client'

import {
  RefreshCcw,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Eye,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { InsightSectionKey, ParsedPortfolioAnalysis } from '@/lib/analysis-parse'
import { formatDateRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

type InsightKey = InsightSectionKey

const INSIGHT_STYLES: {
  key: InsightKey
  title: string
  icon: LucideIcon
  border: string
  bg: string
  iconBg: string
  iconColor: string
  titleColor: string
}[] = [
  {
    key: 'strengths',
    title: 'Strengths',
    icon: TrendingUp,
    border: 'border-l-green-500',
    bg: 'bg-green-50/90 dark:bg-green-950/25',
    iconBg: 'bg-green-100 dark:bg-green-900/40',
    iconColor: 'text-green-700 dark:text-green-400',
    titleColor: 'text-green-800 dark:text-green-300',
  },
  {
    key: 'risks',
    title: 'Risks',
    icon: AlertTriangle,
    border: 'border-l-red-500',
    bg: 'bg-red-50/90 dark:bg-red-950/25',
    iconBg: 'bg-red-100 dark:bg-red-900/40',
    iconColor: 'text-red-700 dark:text-red-400',
    titleColor: 'text-red-800 dark:text-red-300',
  },
  {
    key: 'opportunities',
    title: 'Opportunities',
    icon: Lightbulb,
    border: 'border-l-blue-500',
    bg: 'bg-blue-50/90 dark:bg-blue-950/25',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconColor: 'text-blue-700 dark:text-blue-400',
    titleColor: 'text-blue-800 dark:text-blue-300',
  },
  {
    key: 'watchlist',
    title: 'Watchlist',
    icon: Eye,
    border: 'border-l-amber-500',
    bg: 'bg-amber-50/90 dark:bg-amber-950/25',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-800 dark:text-amber-400',
    titleColor: 'text-amber-900 dark:text-amber-300',
  },
]

interface AnalysisInsightCardsProps {
  insights: ParsedPortfolioAnalysis
  generatedAt: string | null
  onRefresh: () => void
  isRefreshing: boolean
  onViewDetail?: (section: InsightKey) => void
}

export function AnalysisInsightCards({
  insights,
  generatedAt,
  onRefresh,
  isRefreshing,
  onViewDetail,
}: AnalysisInsightCardsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Barbs AI</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {generatedAt ? <span>Generated {formatDateRelative(generatedAt)}</span> : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCcw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            Analyse again
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {INSIGHT_STYLES.map(
          ({ key, title, icon: Icon, border, bg, iconBg, iconColor, titleColor }) => (
            <Card
              key={key}
              className={cn('flex flex-col overflow-hidden border-l-4 shadow-sm', border, bg)}
            >
              <CardContent className="flex flex-1 flex-col p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      iconBg
                    )}
                  >
                    <Icon className={cn('h-4 w-4', iconColor)} />
                  </div>
                  <p className={cn('pt-1 text-sm font-semibold leading-tight', titleColor)}>{title}</p>
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground/90 line-clamp-4">
                  {insights[key] || '—'}
                </p>
                {onViewDetail && (
                  <Button
                    variant="link"
                    size="sm"
                    className={cn('mt-3 h-auto justify-start gap-1 p-0', titleColor)}
                    onClick={() => onViewDetail(key)}
                  >
                    View details
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  )
}
