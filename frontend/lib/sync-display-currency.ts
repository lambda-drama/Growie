import { useAppStore } from '@/lib/store'
import { getExchangeRate } from '@/services/currency'

/** Persisted choice so refresh keeps header currency (not profile default only). */
export const DISPLAY_CURRENCY_STORAGE_KEY = 'growe_display_currency'

function persistDisplayCurrencyCode(code: string) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, code)
    }
  } catch {
    /**/
  }
}

/** Updates global display currency + base(KES)→display multiplier (ERPNext rates). Persists choice locally. */
export async function syncDisplayCurrencyFromCode(code: string): Promise<void> {
  const c = (code || 'USD').toUpperCase().trim()
  const { setCurrency, setKesToDisplayMultiplier, setKesPerUsd } = useAppStore.getState()
  setCurrency(c)
  persistDisplayCurrencyCode(c)

  try {
    const kpu = await getExchangeRate('KES', 'USD')
    setKesPerUsd(typeof kpu === 'number' && kpu > 0 ? kpu : 130)
  } catch {
    setKesPerUsd(130)
  }

  if (c === 'KES') {
    setKesToDisplayMultiplier(1)
    return
  }
  try {
    const rate = await getExchangeRate(c)
    setKesToDisplayMultiplier(typeof rate === 'number' && rate > 0 ? rate : 1)
  } catch {
    setKesToDisplayMultiplier(1)
  }
}

/** Read saved display currency code without applying rates (SSR-safe). */
export function readStoredDisplayCurrency(): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY)
  } catch {
    return null
  }
}
