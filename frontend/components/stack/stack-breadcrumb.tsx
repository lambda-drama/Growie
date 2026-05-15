'use client'

import { ChevronRight } from 'lucide-react'
import { getAssetClassName } from '@/lib/format'
import type { AssetClass } from '@/types'
import { cn } from '@/lib/utils'

interface StackBreadcrumbProps {
  assetClass?: AssetClass
  positionLabel?: string
  onOverview: () => void
  onClass?: () => void
}

export function StackBreadcrumb({
  assetClass,
  positionLabel,
  onOverview,
  onClass,
}: StackBreadcrumbProps) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      <button type="button" onClick={onOverview} className="font-medium hover:text-foreground transition-colors">
        My stack
      </button>
      {assetClass && (
        <>
          <ChevronRight className="h-4 w-4 shrink-0" />
          <button
            type="button"
            onClick={onClass}
            className={cn(
              'font-medium transition-colors',
              positionLabel ? 'hover:text-foreground' : 'text-foreground'
            )}
          >
            {getAssetClassName(assetClass)}
          </button>
        </>
      )}
      {positionLabel && (
        <>
          <ChevronRight className="h-4 w-4 shrink-0" />
          <span className="truncate font-medium text-foreground">{positionLabel}</span>
        </>
      )}
    </nav>
  )
}
