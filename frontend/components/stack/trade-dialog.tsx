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
import { recordBuy, recordSell, createStock } from '@/services/stack'
import { STACK_BUY_BUTTON_CLASS, STACK_SELL_BUTTON_CLASS } from '@/lib/stack-ui'
import { cn } from '@/lib/utils'
import type { StackHolding } from '@/services/stack'
import type { AssetClass } from '@/types'
import type { GroweStock } from '@/services/portfolio'

const ASSET_CLASSES: { value: AssetClass; label: string }[] = [
  { value: 'nse-stocks', label: 'NSE Stocks' },
  { value: 'global-stocks', label: 'Global Stocks' },
  { value: 'mmf', label: 'Money Market Funds' },
  { value: 'real-estate', label: 'Real Estate' },
]

export type TradeMode = 'buy-new' | 'buy-more' | 'sell'

interface TradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: TradeMode
  holding?: StackHolding | null
  defaultAssetClass?: AssetClass
  onSuccess?: (result?: { fullySold?: boolean }) => void
}

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

  const [assetClass, setAssetClass] = useState<AssetClass>(defaultAssetClass ?? 'nse-stocks')
  const [stockName, setStockName] = useState('')
  const [stockLabel, setStockLabel] = useState('')
  const [mmfLabel, setMmfLabel] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [tradeDate, setTradeDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isFundClass = assetClass === 'mmf' || assetClass === 'real-estate'

  useEffect(() => {
    if (!open) return
    setError('')
    if (holding) {
      setAssetClass(holding.assetClass)
      setStockName(holding.stockName || '')
      setStockLabel(`${holding.ticker ? holding.ticker + ' — ' : ''}${holding.name}`)
      setCurrency(holding.currency || 'USD')
      setUnitPrice(String(holding.currentPrice || holding.avgBuyPrice || ''))
      setQuantity('')
    } else {
      setAssetClass(defaultAssetClass ?? 'nse-stocks')
      setStockName('')
      setStockLabel('')
      setMmfLabel('')
      setQuantity('')
      setUnitPrice('')
      setCurrency(defaultAssetClass === 'nse-stocks' ? 'KES' : 'USD')
    }
    setTradeDate(format(new Date(), 'yyyy-MM-dd'))
    setNotes('')
    setReference('')
  }, [open, holding, defaultAssetClass])

  useEffect(() => {
    if (assetClass === 'nse-stocks') setCurrency('KES')
  }, [assetClass])

  const handleStockSelect = (stock: GroweStock, inferred?: AssetClass) => {
    setStockName(stock.name)
    setStockLabel(`${stock.ticker} — ${stock.company_name}`)
    if (inferred && isNew) setAssetClass(inferred)
    if (stock.currency) setCurrency(stock.currency)
  }

  const resolveAssetName = async (): Promise<string> => {
    if (stockName) return stockName
    if (!isFundClass || !mmfLabel.trim()) return ''
    const ticker = mmfLabel.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 20)
    const created = await createStock({
      ticker,
      companyName: mmfLabel.trim(),
      market: 'Global',
      currency,
    })
    return created.name
  }

  const handleSubmit = async () => {
    setError('')
    const qty = parseFloat(quantity)
    if (!qty || qty <= 0) {
      setError('Enter a valid quantity')
      return
    }
    const price = parseFloat(unitPrice)
    if (isNew && isFundClass && !mmfLabel.trim() && !stockName) {
      setError('Enter investment name')
      return
    }
    if (isNew && !isFundClass && !stockName) {
      setError('Select a stock')
      return
    }

    setSaving(true)
    try {
      const assetName = await resolveAssetName()
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
          assetClass: isNew ? assetClass : undefined,
          assetName: isNew ? assetName : undefined,
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
            <div className="grid gap-2">
              <Label>Asset class</Label>
              <Select
                value={assetClass}
                onValueChange={(v) => {
                  setAssetClass(v as AssetClass)
                  setStockName('')
                  setStockLabel('')
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_CLASSES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isNew && isFundClass && (
            <div className="grid gap-2">
              <Label>Investment name</Label>
              <Input
                value={mmfLabel}
                onChange={(e) => setMmfLabel(e.target.value)}
                placeholder={assetClass === 'mmf' ? 'e.g. Cytonn MMF' : 'e.g. Apartment Westlands'}
              />
            </div>
          )}

          {isNew && !isFundClass && (
            <StackStockPicker
              assetClass={assetClass}
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
