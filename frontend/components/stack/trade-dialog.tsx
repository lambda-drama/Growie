'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DisplayCurrencyPicker } from '@/components/currency/display-currency-picker'
import { StackStockPicker } from '@/components/stack/stack-stock-picker'
import { recordBuy, recordSell, getExchangePlatforms } from '@/services/stack'
import { getAssetCategories } from '@/services/portfolio'
import { categoryToPickerSlug } from '@/lib/asset-categories'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'
import type { StackHolding } from '@/services/stack'
import type { AssetClass } from '@/types'
import type { GroweStock } from '@/services/portfolio'

export type TradeMode = 'buy-new' | 'buy-more' | 'sell'

interface TradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: TradeMode
  holding?: StackHolding | null
  defaultAssetClass?: AssetClass
  onSuccess?: (result?: { fullySold?: boolean }) => void
}

const DEFAULT_CATEGORY = 'Stock'
const ALL_EXCHANGES = '__all__'

const FALLBACK_EXCHANGES = ['NSE', 'NYSE', 'NASDAQ', 'LSE', 'Euronext', 'JSE', 'HKEX', 'JPX']

const FALLBACK_CATEGORIES = [
  { name: 'Stock', label: 'Stock' },
  { name: 'ETF', label: 'ETF' },
  { name: 'Money Market Fund', label: 'Money Market Fund' },
  { name: 'Private Company/Other', label: 'Private Company/Other' },
  { name: 'Bonds', label: 'Bonds' },
  { name: 'REITS', label: 'REITS' },
  { name: 'Indices', label: 'Indices' },
]

export function TradeDialog({
  open,
  onOpenChange,
  mode,
  holding,
  defaultAssetClass,
  onSuccess,
}: TradeDialogProps) {
  const isSell = mode === 'sell'
  const isNew = mode === 'buy-new'

  const [assetCategories, setAssetCategories] = useState(FALLBACK_CATEGORIES)
  const [exchangePlatforms, setExchangePlatforms] = useState<string[]>(FALLBACK_EXCHANGES)
  const [assetCategory, setAssetCategory] = useState(DEFAULT_CATEGORY)
  const [exchangePlatform, setExchangePlatform] = useState('')
  const [stockName, setStockName] = useState('')
  const [stockLabel, setStockLabel] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [tradeDate, setTradeDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const pickerSlug = categoryToPickerSlug(assetCategory)

  useEffect(() => {
    if (!open) return
    getAssetCategories()
      .then(setAssetCategories)
      .catch(() => setAssetCategories(FALLBACK_CATEGORIES))
    getExchangePlatforms('', 100)
      .then(setExchangePlatforms)
      .catch(() => setExchangePlatforms(FALLBACK_EXCHANGES))
  }, [open])

  useEffect(() => {
    if (!open || holding) return
    setStockName('')
    setStockLabel('')
  }, [assetCategory, exchangePlatform, open, holding])

  useEffect(() => {
    if (!open) return
    setError('')
    if (holding) {
      const cat =
        (holding as StackHolding & { holdingAssetCategory?: string }).holdingAssetCategory ||
        (holding.assetCategory || '').trim() ||
        DEFAULT_CATEGORY
      setAssetCategory(cat)
      setStockName(holding.stockName || '')
      setStockLabel(`${holding.ticker ? holding.ticker + ' — ' : ''}${holding.name}`)
      setCurrency(holding.currency || 'USD')
      setUnitPrice(String(holding.currentPrice || holding.avgBuyPrice || ''))
      setQuantity('')
    } else {
      const initialCategory =
        defaultAssetClass === 'etf'
          ? 'ETF'
          : defaultAssetClass === 'mmf'
            ? 'Money Market Fund'
            : defaultAssetClass === 'real-estate'
              ? 'Private Company/Other'
              : DEFAULT_CATEGORY
      setAssetCategory(initialCategory)
      setExchangePlatform('')
      setStockName('')
      setStockLabel('')
      setQuantity('')
      setUnitPrice('')
      setCurrency(defaultAssetClass === 'nse-stocks' ? 'KES' : 'USD')
    }
    setTradeDate(format(new Date(), 'yyyy-MM-dd'))
    setNotes('')
    setReference('')
  }, [open, holding, defaultAssetClass])

  const handleStockSelect = (stock: GroweStock, inferred?: AssetClass) => {
    setStockName(stock.name)
    setStockLabel(`${stock.ticker} — ${stock.company_name}`)
    if (stock.currency) setCurrency(stock.currency)
    if (inferred === 'nse-stocks') setCurrency('KES')
  }

  const handleSubmit = async () => {
    setError('')
    const qty = parseFloat(quantity)
    if (!qty || qty <= 0) {
      setError('Enter a valid quantity')
      return
    }
    const price = parseFloat(unitPrice)
    if (isNew && !stockName) {
      setError('Select an investment from Growe Stock')
      return
    }

    setSaving(true)
    try {
      if (isSell && holding) {
        const sellResult = await recordSell({
          holdingId: holding.id,
          quantity: qty,
          unitPrice: price > 0 ? price : undefined,
          transactionDate: tradeDate,
          notes,
          reference,
        })
        const fullySold = (sellResult.holding?.quantity ?? 0) <= 0
        onSuccess?.({ fullySold })
        onOpenChange(false)
        return
      } else {
        await recordBuy({
          holdingId: holding?.id,
          assetClass: isNew ? assetCategory : undefined,
          assetName: isNew ? stockName : undefined,
          quantity: qty,
          unitPrice: price > 0 ? price : undefined,
          currency,
          transactionDate: tradeDate,
          notes,
          reference,
        })
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const title =
    mode === 'sell'
      ? `Sell ${holding?.ticker || holding?.name || 'position'}`
      : mode === 'buy-more'
        ? `Buy more — ${holding?.ticker || holding?.name}`
        : 'Add position'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isSell
              ? 'Reduces your position and logs the sale in transaction history.'
              : 'Creates or updates your holding and records a buy transaction.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {isNew && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Asset category</Label>
                <Select value={assetCategory} onValueChange={setAssetCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {assetCategories.map((o) => (
                      <SelectItem key={o.name} value={o.name}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Exchange platform</Label>
                <Select
                  value={exchangePlatform || ALL_EXCHANGES}
                  onValueChange={(v) => setExchangePlatform(v === ALL_EXCHANGES ? '' : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All exchanges" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_EXCHANGES}>All exchanges</SelectItem>
                    {exchangePlatforms.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isNew && (
            <StackStockPicker
              assetClass={pickerSlug}
              assetCategory={assetCategory}
              exchangePlatform={exchangePlatform || undefined}
              value={stockName}
              displayLabel={stockLabel}
              onSelect={handleStockSelect}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={isSell ? 'Shares to sell' : 'Shares / units'}
              />
            </div>
            <div className="grid gap-2">
              <Label>{isSell ? 'Sell price' : 'Price per unit'}</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="Optional — uses market"
              />
            </div>
          </div>

          {isNew && (
            <div className="grid gap-2">
              <Label>Currency</Label>
              <DisplayCurrencyPicker
                value={currency}
                onSelect={setCurrency}
                triggerClassName="w-full justify-between h-10"
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label>Date</Label>
            <Input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="M-Pesa, broker ref…" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            variant="outline"
            className={cn(isSell ? STACK_SELL_BUTTON_CLASS : STACK_BUY_BUTTON_CLASS)}
          >
            {saving ? 'Saving…' : isSell ? 'Record sell' : 'Record buy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
