// hooks/use-frappe-currency.ts
import { useEffect } from 'react'
import { useAppStore, useDisplayMoney } from '@/lib/store'
import { getExchangeRate } from '@/services/currency'

export function useFrappeCurrencySync() {
  const { currency } = useDisplayMoney()
  const setKesToDisplayMultiplier = useAppStore((s) => s.setKesToDisplayMultiplier)
  const setKesPerUsd = useAppStore((s) => s.setKesPerUsd)

  useEffect(() => {
    getExchangeRate('KES', 'USD').then((rate) => {
      setKesPerUsd(typeof rate === 'number' && rate > 0 ? rate : 130)
    })

    if (currency === 'KES') {
      setKesToDisplayMultiplier(1)
      return
    }

    getExchangeRate(currency).then((rate) => {
      setKesToDisplayMultiplier(typeof rate === 'number' && rate > 0 ? rate : 1)
    })
  }, [currency, setKesToDisplayMultiplier, setKesPerUsd])
}