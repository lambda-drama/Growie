'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { searchStocks, createStock, inferAssetClass } from '@/services/stack'
import type { GroweStock } from '@/services/portfolio'
import type { AssetClass } from '@/types'

const CLASS_TO_MARKET: Record<string, string | undefined> = {
  'nse-stocks': 'NSE',
  'global-stocks': 'Global',
}

interface StackStockPickerProps {
  assetClass: AssetClass
  value: string
  displayLabel: string
  onSelect: (stock: GroweStock, inferredClass?: AssetClass) => void
  disabled?: boolean
}

export function StackStockPicker({
  assetClass,
  value,
  displayLabel,
  onSelect,
  disabled,
}: StackStockPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [stocks, setStocks] = useState<GroweStock[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newTicker, setNewTicker] = useState('')
  const [newName, setNewName] = useState('')
  const [newMarket, setNewMarket] = useState<'NSE' | 'Global'>('Global')
  const [adding, setAdding] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const market = CLASS_TO_MARKET[assetClass]
  const showStockSearch = assetClass === 'nse-stocks' || assetClass === 'global-stocks'

  const doSearch = useCallback(
    async (q: string) => {
      if (!showStockSearch) return
      setLoading(true)
      try {
        setStocks(await searchStocks(q, market))
      } catch {
        setStocks([])
      } finally {
        setLoading(false)
      }
    },
    [market, showStockSearch]
  )

  useEffect(() => {
    if (open && showStockSearch) doSearch(query)
  }, [open, showStockSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePick = async (stock: GroweStock) => {
    try {
      const inferred = await inferAssetClass(stock.name)
      onSelect(stock, (inferred.assetClass || assetClass) as AssetClass)
    } catch {
      onSelect(stock, assetClass)
    }
    setOpen(false)
    setQuery('')
  }

  const handleAddStock = async () => {
    if (!newTicker.trim()) return
    setAdding(true)
    try {
      const m = assetClass === 'nse-stocks' ? 'NSE' : newMarket
      const created = await createStock({
        ticker: newTicker.trim(),
        companyName: newName.trim() || newTicker.trim(),
        market: m,
      })
      const stock: GroweStock = {
        name: created.name,
        ticker: created.ticker,
        company_name: created.company_name,
        market: created.market,
        currency: created.currency,
      }
      await handlePick(stock)
      setAddOpen(false)
      setNewTicker('')
      setNewName('')
    } finally {
      setAdding(false)
    }
  }

  if (!showStockSearch) {
    return null
  }

  return (
    <div className="space-y-2">
      <Label>
        {assetClass === 'nse-stocks' ? 'NSE stock' : 'Global stock'}
        {market && (
          <Badge variant="secondary" className="ml-2 text-xs font-normal">
            {market}
          </Badge>
        )}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
          >
            <span className="truncate">{displayLabel || 'Search ticker or company…'}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 opacity-50" />
              <CommandInput
                placeholder="e.g. NVDA, SCOM…"
                value={query}
                onValueChange={(q) => {
                  setQuery(q)
                  if (debounceRef.current) clearTimeout(debounceRef.current)
                  debounceRef.current = setTimeout(() => doSearch(q), 250)
                }}
              />
            </div>
            <CommandList className="max-h-52">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </div>
              )}
              {!loading && stocks.length === 0 && <CommandEmpty>No stocks found.</CommandEmpty>}
              {!loading && stocks.length > 0 && (
                <CommandGroup>
                  {stocks.map((s) => (
                    <CommandItem key={s.name} value={s.name} onSelect={() => handlePick(s)}>
                      <Check className={cn('mr-2 h-4 w-4', value === s.name ? 'opacity-100' : 'opacity-0')} />
                      <span className="font-medium">{s.ticker}</span>
                      <span className="ml-2 truncate text-muted-foreground">{s.company_name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add new stock
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add new stock</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Ticker</Label>
              <Input value={newTicker} onChange={(e) => setNewTicker(e.target.value.toUpperCase())} placeholder="NVDA" />
            </div>
            <div className="grid gap-2">
              <Label>Company name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="NVIDIA Corporation" />
            </div>
            {assetClass === 'global-stocks' && (
              <div className="grid gap-2">
                <Label>Market</Label>
                <Select value={newMarket} onValueChange={(v) => setNewMarket(v as 'NSE' | 'Global')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Global">Global</SelectItem>
                    <SelectItem value="NSE">NSE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddStock} disabled={adding || !newTicker.trim()}>
              {adding ? 'Adding…' : 'Add & select'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
