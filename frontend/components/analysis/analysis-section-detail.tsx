'use client'

import {
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Eye,
  type LucideIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { InsightSectionKey } from '@/lib/analysis-parse'
import { cn } from '@/lib/utils'

const SECTION_META: Record<
  InsightSectionKey,
  { title: string; icon: LucideIcon; titleColor: string }
> = {
  strengths: {
    title: 'Strengths',
    icon: TrendingUp,
    titleColor: 'text-green-800 dark:text-green-300',
  },
  risks: {
    title: 'Risks',
    icon: AlertTriangle,
    titleColor: 'text-red-800 dark:text-red-300',
  },
  opportunities: {
    title: 'Opportunities',
    icon: Lightbulb,
    titleColor: 'text-blue-800 dark:text-blue-300',
  },
  watchlist: {
    title: 'Watchlist',
    icon: Eye,
    titleColor: 'text-amber-900 dark:text-amber-300',
  },
}

interface AnalysisSectionDetailProps {
  section: InsightSectionKey | null
  content: string
  onClose: () => void
}

export function AnalysisSectionDetail({ section, content, onClose }: AnalysisSectionDetailProps) {
  if (!section) return null

  const { title, icon: Icon, titleColor } = SECTION_META[section]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className={cn('flex items-center gap-2', titleColor)}>
            <Icon className="h-5 w-5 shrink-0" />
            {title}
          </DialogTitle>
          <DialogDescription>From your latest portfolio review</DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{content}</p>
      </DialogContent>
    </Dialog>
  )
}
