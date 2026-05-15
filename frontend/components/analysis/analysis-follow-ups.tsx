'use client'

import { ArrowRight, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const FOLLOW_UPS = [
  "What's the optimal asset allocation for my goals?",
  'How will my portfolio perform in a recession?',
  'Should I rebalance my portfolio?',
  'What are the tax implications of my investments?',
]

interface AnalysisFollowUpsProps {
  onAsk: (question: string) => void
}

export function AnalysisFollowUps({ onAsk }: AnalysisFollowUpsProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Ask follow-up questions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {FOLLOW_UPS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onAsk(q)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left text-sm transition-colors hover:bg-muted/50"
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-foreground/90">{q}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
        <Button
          variant="link"
          className="mt-2 h-auto p-0 text-primary"
          onClick={() => onAsk('')}
        >
          Ask your own question
        </Button>
      </CardContent>
    </Card>
  )
}
