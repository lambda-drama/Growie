'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BarbsAIBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
        className
      )}
    >
      <Sparkles className="h-3 w-3" />
      Powered by <span className="font-semibold">Barbs AI</span>
    </span>
  )
}
