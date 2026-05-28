import type { StackGroupingMode } from '@/lib/stack-grouping'

export type { StackGroupingMode }

const STORAGE_KEY = 'growe_stack_grouping_mode'

const VALID_MODES: StackGroupingMode[] = ['ticker', 'region', 'exchange']

export function readStoredStackGroupingMode(): StackGroupingMode {
  try {
    if (typeof window === 'undefined') return 'ticker'
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (VALID_MODES.includes(value as StackGroupingMode)) return value as StackGroupingMode
  } catch {
    /**/
  }
  return 'ticker'
}

export function persistStackGroupingMode(mode: StackGroupingMode): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, mode)
    }
  } catch {
    /**/
  }
}
