'use client'

import {
  getBucketIconColorHex,
  getBucketIconInitial,
  getBucketIconTint,
  type StackBucketKind,
} from '@/lib/stack-bucket-icons'
import { cn } from '@/lib/utils'

interface StackBucketIconProps {
  label: string
  kind: StackBucketKind
  className?: string
}

export function StackBucketIcon({ label, kind, className }: StackBucketIconProps) {
  const initial = getBucketIconInitial(label)
  const tint = getBucketIconTint(label, kind)
  const hex = getBucketIconColorHex(label, kind)

  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold sm:h-11 sm:w-11 sm:text-sm',
        tint,
        className
      )}
      style={{ boxShadow: `inset 0 0 0 1px ${hex}22` }}
      aria-hidden
    >
      {initial}
    </span>
  )
}
