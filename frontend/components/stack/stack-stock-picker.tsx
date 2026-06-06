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
import { categoryDefaultMarket, categoryToPickerSlug } from '@/lib/asset-categories'
import {
  searchStocks,
  createStock,
  inferAssetClass,
  getRegions,
  getExchangePlatforms,
} from '@/services/stack'
import type { GroweStock } from '@/services/portfolio'
import type { AssetClass } from '@/types'

const CLASS_TO_MARKET: Record<string, string | undefined> = {
  'nse-stocks': 'NSE',
  'global-stocks': 'Global',
  etf: 'ETF',
}

interface StackStockPickerProps {
  assetClass: AssetClass
  /** Growe Asset Category — filters Growe Stock search and new listings. */
  assetCategory?: string
  value: string
  displayLabel: string
  onSelect: (stock: GroweStock, inferredClass?: AssetClass) => void
  disabled?: boolean
}

export function StackStockPicker({
  assetClass,
  assetCategory,
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
  const [newMarket, setNewMarket] = useState<'NSE' | 'Global' | 'ETF'>('Global')
  const [newRegion, setNewRegion] = useState('auto')
  const [newExchange, setNewExchange] = useState('auto')
  const [regions, setRegions] = useState<string[]>([])
  const [exchanges, setExchanges] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const instrumentType = (assetCategory || '').trim() || undefined
  const market = instrumentType ? undefined : CLASS_TO_MARKET[assetClass]
  const pickerSlug = assetCategory ? categoryToPickerSlug(assetCategory) : assetClass

  const doSearch = useCallback(
    async (q: string) => {
      setLoading(true)
      try {
        setStocks(await searchStocks(q, market, instrumentType))
      } catch {
        setStocks([])
      } finally {
        setLoading(false)
      }
    },
    [market, instrumentType]
  )

  useEffect(() => {
    if (open) doSearch(query)
  }, [open, instrumentType, market]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!addOpen) return
    const defaultMkt = assetCategory ? categoryDefaultMarket(assetCategory) : 'Global'
    setNewMarket(defaultMkt)
    void (async () => {
      try {
        const [regionList, exchangeList] = await Promise.all([
          getRegions('', 200),
          getExchangePlatforms('', 200),
        ])
        setRegions(regionList)
        setExchanges(exchangeList)
      } catch {
        setRegions([])
        setExchanges([])
      }
    })()
  }, [addOpen, assetCategory])

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
      const m =
        pickerSlug === 'nse-stocks' ? 'NSE' : pickerSlug === 'etf' ? 'ETF' : newMarket
      const defaultRegion = m === 'NSE' ? 'Kenya' : m === 'ETF' ? 'USA' : 'Global'
      const created = await createStock({
        ticker: newTicker.trim(),
        companyName: newName.trim() || newTicker.trim(),
        market: m,
        region: newRegion === 'auto' ? defaultRegion : newRegion,
        exchangePlatform: newExchange === 'auto' ? m : newExchange,
        instrumentType: instrumentType,
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
      setNewRegion('auto')
      setNewExchange('auto')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label>Investment name</Label>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              disabled={disabled}
              className={cn(
                'min-w-0 flex-1 justify-between font-normal',
                !value && 'text-muted-foreground'
              )}
            >
              <span className="truncate">
                {displayLabel || 'Search ticker or investment name…'}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
            <Command shouldFilter={false}>
              <div className="flex items-center border-b px-3">
                <Search className="mr-2 h-4 w-4 opacity-50" />
                <CommandInput
                  placeholder="e.g. NVDA, SCOM, Cytonn…"
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
                {!loading && stocks.length === 0 && (
                  <CommandEmpty>No investments found. Use + to add one.</CommandEmpty>
                )}
                {!loading && stocks.length > 0 && (
                  <CommandGroup>
                    {stocks.map((s) => (
                      <CommandItem key={s.name} value={s.name} onSelect={() => handlePick(s)}>
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            value === s.name ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className="font-medium">{s.ticker}</span>
                        <span className="ml-2 truncate text-muted-foreground">{s.company_name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          disabled={disabled}
          aria-label="Add investment"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add investment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Ticker</Label>
              <Input
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                placeholder="e.g. CYTONN-MMF"
              />
            </div>
            <div className="grid gap-2">
              <Label>Investment name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Cytonn Money Market Fund"
              />
            </div>
            {pickerSlug !== 'nse-stocks' && pickerSlug !== 'etf' && (
              <div className="grid gap-2">
                <Label>Market</Label>
                <Select
                  value={newMarket}
                  onValueChange={(v) => setNewMarket(v as 'NSE' | 'Global' | 'ETF')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Global">Global</SelectItem>
                    <SelectItem value="NSE">NSE</SelectItem>
                    <SelectItem value="ETF">ETF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Region</Label>
              <Select value={newRegion} onValueChange={setNewRegion}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  {regions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Exchange platform</Label>
              <Select value={newExchange} onValueChange={setNewExchange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  {exchanges.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
