import {
  DEFAULT_STACK_GROUPING_MODE,
  type StackGroupingMode,
} from '@/lib/stack-grouping'

export type { StackGroupingMode }

const STORAGE_KEY = 'growe_stack_grouping_mode'

const VALID_MODES: StackGroupingMode[] = ['ticker', 'region', 'exchange', 'etf']

export function readStoredStackGroupingMode(): StackGroupingMode {
  try {
    if (typeof window === 'undefined') return DEFAULT_STACK_GROUPING_MODE
    const value = window.localStorage.getItem(STORAGE_KEY)
    // Legacy default was ticker (asset-class list); new default is exchange.
    if (value === 'ticker') {
      return DEFAULT_STACK_GROUPING_MODE
    }
    if (VALID_MODES.includes(value as StackGroupingMode)) return value as StackGroupingMode
  } catch {
    /**/
  }
  return DEFAULT_STACK_GROUPING_MODE
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
