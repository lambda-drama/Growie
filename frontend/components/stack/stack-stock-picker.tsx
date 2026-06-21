'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Info, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { searchStocks, inferAssetClass } from '@/services/stack'
import type { GroweStock } from '@/services/portfolio'
import type { AssetClass } from '@/types'

const CLASS_TO_MARKET: Record<string, string | undefined> = {
  'nse-stocks': 'NSE',
  'global-stocks': 'Global',
  etf: 'ETF',
}

interface StackStockPickerProps {
  assetClass: AssetClass
  /** Growe Asset Category — filters Growe Stock search. */
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
  const subscriptionTier = useAppStore((s) => s.subscriptionTier)
  const isSubscribed = subscriptionTier === 'pro' || subscriptionTier === 'coached'

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [stocks, setStocks] = useState<GroweStock[]>([])
  const [loading, setLoading] = useState(false)
  const [unsupportedOpen, setUnsupportedOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const instrumentType = (assetCategory || '').trim() || undefined
  const market = instrumentType ? undefined : CLASS_TO_MARKET[assetClass]

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

  const emptyHint =
    query.trim().length > 0
      ? 'No verified investments match your search.'
      : 'Search the Growe stock master.'

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
                  <div className="space-y-2 px-3 py-4 text-center text-sm text-muted-foreground">
                    <p>{emptyHint}</p>
                    {query.trim().length > 0 ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => {
                          setOpen(false)
                          setUnsupportedOpen(true)
                        }}
                      >
                        Ticker not listed?
                      </Button>
                    ) : null}
                  </div>
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
          aria-label="Missing ticker help"
          onClick={() => setUnsupportedOpen(true)}
        >
          <Info className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={unsupportedOpen} onOpenChange={setUnsupportedOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>This asset is not supported yet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            {isSubscribed ? (
              <>
                <p>
                  <strong className="text-foreground">{query.trim() || 'This ticker'}</strong> is
                  not in the verified Growe stock master yet.
                </p>
                <p>
                  Use <strong className="text-foreground">Bulk upload</strong> to import your
                  positions from Excel or CSV. New tickers are added as unverified listings — our
                  team reviews them, completes exchange, sector, and API mapping, then notifies you
                  when the asset is available to search here.
                </p>
                <p>Your imported holdings are saved immediately; search picks up tickers once verified.</p>
              </>
            ) : (
              <>
                <p>
                  Only verified assets from the Growe stock master can be added manually. Free
                  accounts cannot request new listings.
                </p>
                <p>
                  Upgrade to <strong className="text-foreground">Pro</strong> or{' '}
                  <strong className="text-foreground">Coached</strong> to request missing assets via
                  bulk upload — we verify and add them to the master for you.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnsupportedOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
