export async function getExchangeRate(targetCurrency: string, baseCurrency: string = 'KES'): Promise<number> {
  const code = (targetCurrency || 'USD').toUpperCase()
  const base = (baseCurrency || 'KES').toUpperCase()
  const response = await fetch(
    `/api/method/growie_app.api.currency.get_exchange_rate_for_currency?target_currency=${code}&base_currency=${base}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  if (typeof resData?.message === 'number') {
    return resData.message
  }
  if (resData?.exc) {
    throw new Error(typeof resData.exc === 'string' ? resData.exc : 'Exchange rate request failed')
  }
  return 1
}