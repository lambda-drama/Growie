'use client'

import { ArrowRight, Lightbulb } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ParsedPortfolioAnalysis } from '@/lib/analysis-parse'

interface AnalysisRecommendationsProps {
  recommendations: ParsedPortfolioAnalysis['recommendations']
  onAskQuestion: (q: string) => void
}

export function AnalysisRecommendations({
  recommendations,
  onAskQuestion,
}: AnalysisRecommendationsProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">AI recommendations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {recommendations.map((rec, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onAskQuestion(rec.description)}
            className="flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted/50"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Lightbulb className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{rec.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{rec.description}</p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
        <Button
          variant="link"
          className="mt-2 h-auto p-0 text-primary"
          onClick={() => onAskQuestion('What are your top recommendations for my portfolio right now?')}
        >
          View all recommendations
        </Button>
      </CardContent>
    </Card>
  )
}
