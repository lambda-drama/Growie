'use client'

import { useState, useMemo, useEffect, useCallback, useRef, type ChangeEvent } from 'react'
import {
  ChevronDown, ChevronRight, Plus, MoreVertical, Pencil, Trash2,
  TrendingUp, TrendingDown, ChevronsUpDown, Check, Search, Sheet, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { useAppStore, useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatCurrencyNative, formatDate, getAssetClassName, getAssetClassColor } from '@/lib/format'
import {
  addHolding as apiAddHolding,
  updateHolding as apiUpdateHolding,
  deleteHolding as apiDeleteHolding,
  importHoldingsFromExcel,
  searchStocks,
  getCurrencies,
  type AddHoldingData,
  type GroweStock,
} from '@/services/portfolio'
import { usePortfolio } from '@/hooks/use-portfolio'
import type { AssetClass, Holding } from '@/types'
import { cn } from '@/lib/utils'

const assetClasses: AssetClass[] = ['mmf', 'real-estate', 'nse-stocks', 'global-stocks']

const ASSET_CLASS_OPTIONS = [
  { value: 'mmf',           label: 'Money Market Fund' },
  { value: 'real-estate',   label: 'Real Estate'       },
  { value: 'nse-stocks',    label: 'NSE Stocks'        },
  { value: 'global-stocks', label: 'Global Stocks'     },
]

// market filter per asset class
const CLASS_TO_MARKET: Record<string, string | undefined> = {
  'nse-stocks':    'NSE',
  'global-stocks': 'Global',
}

// ─── Stock combobox ───────────────────────────────────────────────────────────

interface StockComboboxProps {
  value: string                         // Growe Stock name
  displayLabel: string                  // shown on trigger button
  assetClass: string
  onSelect: (stock: GroweStock) => void
  disabled?: boolean
}

function StockCombobox({ value, displayLabel, assetClass, onSelect, disabled }: StockComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [stocks, setStocks] = useState<GroweStock[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const market = CLASS_TO_MARKET[assetClass]

  // Load initial list on open, then search on query change
  const doSearch = useCallback(async (q: string) => {
    setIsLoading(true)
    try {
      const results = await searchStocks(q, market)
      setStocks(results)
    } catch {
      setStocks([])
    } finally {
      setIsLoading(false)
    }
  }, [market])

  // Debounce typing
  const handleQueryChange = (q: string) => {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(q), 250)
  }

  // Load on open
  useEffect(() => {
    if (open) doSearch(query)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">
            {displayLabel || 'Search stock or fund…'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        side="bottom"
        avoidCollisions={false}
      >
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Ticker or company name…"
              value={query}
              onValueChange={handleQueryChange}
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <CommandList className="max-h-56">
            {isLoading && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Searching…
              </div>
            )}
            {!isLoading && stocks.length === 0 && (
              <CommandEmpty>
                {query
                  ? `No results for "${query}"`
                  : 'Start typing to search…'}
              </CommandEmpty>
            )}
            {!isLoading && stocks.length > 0 && (
              <CommandGroup>
                {stocks.map((stock) => (
                  <CommandItem
                    key={stock.name}
                    value={stock.name}
                    onSelect={() => {
                      onSelect(stock)
                      setOpen(false)
                      setQuery('')
                    }}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        value === stock.name ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="font-mono font-semibold text-primary">
                      {stock.ticker}
                    </span>
                    <span className="flex-1 truncate text-sm text-foreground">
                      {stock.company_name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {stock.market} · {stock.currency}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── Asset class section ──────────────────────────────────────────────────────

interface AssetClassSectionProps {
  assetClass: AssetClass
  holdings: Holding[]
  currency: string
  kesToDisplayMultiplier: number
  onEdit: (holding: Holding) => void
  onDelete: (id: string) => void
}

function AssetClassSection({ assetClass, holdings, currency, kesToDisplayMultiplier, onEdit, onDelete }: AssetClassSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const total = holdings.reduce((sum, h) => sum + h.valueKES, 0)
  const currencies = Array.from(new Set(holdings.map((h) => (h.currency || '').toUpperCase()).filter(Boolean)))
  if (holdings.length === 0) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-left transition-colors hover:bg-muted">
          <div className="flex items-center gap-3">
            <div className={cn('h-3 w-3 rounded-full', getAssetClassColor(assetClass))} />
            <span className="font-medium">{getAssetClassName(assetClass)}</span>
            <span className="text-sm text-muted-foreground">({holdings.length})</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold">
              {currencies.length === 1
                ? formatCurrencyNative(total, currencies[0])
                : `${formatCurrency(total, currency, { kesToDisplayMultiplier })} (mixed)`}
            </span>
            {isOpen
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1">
          {holdings.map((holding) => {
            const hasPriceData = (holding.currentPriceKES ?? 0) > 0
            const isUp = (holding.changePercent ?? 0) >= 0
            return (
              <div
                key={holding.id}
                className="flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{holding.name}</p>
                    {holding.ticker && (
                      <span className="shrink-0 rounded bg-secondary/10 px-1.5 py-0.5 text-xs font-medium text-secondary">
                        {holding.ticker}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">Added {formatDate(holding.dateAdded)}</p>
                    {hasPriceData && (
                      <span className={cn(
                        'flex items-center gap-0.5 text-xs font-medium',
                        isUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                      )}>
                        {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {Math.abs(holding.changePercent ?? 0).toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-medium">
                      {formatCurrencyNative(holding.valueKES, (holding.currency || currency).toUpperCase())}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(holding)}>
                        <Pencil className="mr-2 h-4 w-4" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(holding.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ─── Add / Edit dialog ────────────────────────────────────────────────────────

interface DialogForm extends Omit<AddHoldingData, 'ticker'> {
  stockDisplayLabel: string   // "SCOM — Safaricom PLC" shown on button
}

interface HoldingDialogProps {
  open: boolean
  onClose: () => void
  editing?: Holding | null
  onSaved: () => void
}

function HoldingDialog({ open, onClose, editing, onSaved }: HoldingDialogProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState<DialogForm>({
    assetClass:       editing?.assetClass       ?? 'nse-stocks',
    assetName:        (editing as (Holding & { stockName?: string }))?.stockName ?? '',
    currency:         editing?.currency          ?? 'USD',
    quantity:         editing?.quantity          ?? 0,
    notes:            editing?.notes             ?? '',
    dateAdded:        editing?.dateAdded         ?? new Date().toISOString().slice(0, 10),
    stockDisplayLabel: editing
      ? `${editing.ticker ? editing.ticker + ' — ' : ''}${editing.name}`
      : '',
  })

  const reset = (h?: Holding | null) => {
    const stockName = (h as (Holding & { stockName?: string }) | null)?.stockName ?? ''
    setForm({
      assetClass:        h?.assetClass    ?? 'nse-stocks',
      assetName:         stockName,
      currency:          h?.currency      ?? 'USD',
      quantity:          h?.quantity      ?? 0,
      notes:             h?.notes         ?? '',
      dateAdded:         h?.dateAdded     ?? new Date().toISOString().slice(0, 10),
      stockDisplayLabel: h
        ? `${h.ticker ? h.ticker + ' — ' : ''}${h.name}`
        : '',
    })
    setError('')
  }

  useEffect(() => { reset(editing) }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [currencyQuery, setCurrencyQuery] = useState('')
  const [currencies, setCurrencies] = useState<string[]>(['USD'])

  const loadCurrencies = useCallback(async (q = '') => {
    const rows = await getCurrencies(q)
    setCurrencies(rows.length ? rows : ['USD'])
  }, [])

  useEffect(() => {
    if (currencyOpen) loadCurrencies(currencyQuery)
  }, [currencyOpen, currencyQuery, loadCurrencies])

  const handleStockSelect = (stock: GroweStock) => {
    setForm((f) => ({
      ...f,
      assetName:         stock.name,
      stockDisplayLabel: `${stock.ticker} — ${stock.company_name}`,
    }))
  }

  const handleSave = async () => {
    if (!form.assetName.trim()) { setError('Please select a stock or fund.'); return }
    if (!form.dateAdded) { setError('Please select a date.'); return }
    if (!form.quantity || form.quantity <= 0) { setError('Quantity must be greater than 0.'); return }
    setError('')
    setIsSaving(true)
    try {
      if (editing) {
        await apiUpdateHolding(editing.id, {
          assetName:    form.assetName,
          currency:     form.currency,
          dateAdded:    form.dateAdded,
          quantity:     form.quantity,
          notes:        form.notes,
        })
      } else {
        await apiAddHolding({
          assetClass:   form.assetClass,
          assetName:    form.assetName,
          currency:     form.currency,
          dateAdded:    form.dateAdded,
          quantity:     form.quantity,
          notes:        form.notes,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save holding.')
    } finally {
      setIsSaving(false)
    }
  }

  const market = CLASS_TO_MARKET[form.assetClass]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Holding' : 'Add Holding'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* Asset Class */}
          {!editing && (
            <div className="space-y-1.5">
              <Label>Asset Class</Label>
              <Select
                value={form.assetClass}
                onValueChange={(v) => setForm({ ...form, assetClass: v, assetName: '', stockDisplayLabel: '' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_CLASS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Stock / Fund — searchable combobox */}
          <div className="space-y-1.5">
            <Label>
              {form.assetClass === 'nse-stocks' ? 'NSE Stock' :
               form.assetClass === 'global-stocks' ? 'Global Stock' :
               form.assetClass === 'mmf' ? 'Money Market Fund' :
               'Asset'}
              {' '}
              {market && (
                <Badge variant="secondary" className="ml-1 text-xs font-normal">
                  {market}
                </Badge>
              )}
            </Label>
            <StockCombobox
              value={form.assetName}
              displayLabel={form.stockDisplayLabel}
              assetClass={form.assetClass}
              onSelect={handleStockSelect}
            />
            <p className="text-xs text-muted-foreground">
              Search by ticker (e.g. SCOM) or company name
            </p>
          </div>

          {/* Currency + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Popover open={currencyOpen} onOpenChange={setCurrencyOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {form.currency || 'Select currency'}
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search currency..."
                      value={currencyQuery}
                      onValueChange={setCurrencyQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No currencies found.</CommandEmpty>
                      <CommandGroup>
                        {currencies.map((ccy) => (
                          <CommandItem
                            key={ccy}
                            value={ccy}
                            onSelect={() => {
                              setForm({ ...form, currency: ccy })
                              setCurrencyOpen(false)
                              setCurrencyQuery('')
                            }}
                          >
                            {ccy}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Date Bought</Label>
              <Input
                type="date"
                value={form.dateAdded || ''}
                onChange={(e) => setForm({ ...form, dateAdded: e.target.value })}
              />
            </div>
          </div>

          {/* Quantity — shown for stocks */}
          {(form.assetClass === 'nse-stocks' || form.assetClass === 'global-stocks') && (
            <div className="space-y-1.5">
              <Label>Quantity <span className="text-muted-foreground font-normal">(shares / units)</span></Label>
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="Number of shares"
                value={form.quantity || ''}
                onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">
                Value is auto-calculated from market prices using quantity and currency.
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              placeholder="e.g. Bought at IPO, reinvest dividends…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Add Holding'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main HoldingsTable ───────────────────────────────────────────────────────

export function HoldingsTable() {
  const { currency, kesToDisplayMultiplier } = useDisplayMoney()
  const { holdings, refresh } = usePortfolio()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [excelConfirmOpen, setExcelConfirmOpen] = useState(false)
  const [pendingExcelFile, setPendingExcelFile] = useState<File | null>(null)
  const [excelImportRunning, setExcelImportRunning] = useState(false)
  const excelInputRef = useRef<HTMLInputElement>(null)

  const handleExcelPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      toast.error('Invalid file', {
        description: 'Please choose an Excel file (.xlsx or .xls).',
      })
      return
    }
    setPendingExcelFile(file)
    setExcelConfirmOpen(true)
  }

  const handleCancelExcelImport = () => {
    setExcelConfirmOpen(false)
    setPendingExcelFile(null)
  }

  const handleStartExcelImport = async () => {
    const file = pendingExcelFile
    if (!file) return
    setExcelConfirmOpen(false)
    setPendingExcelFile(null)
    setExcelImportRunning(true)
    try {
      await toast.promise(
        (async () => {
          const result = await importHoldingsFromExcel(file)
          await refresh()
          return result
        })(),
        {
          loading: 'Uploading file and importing holdings…',
          success: (result) => {
            const errs = (result.errors || []).filter(Boolean)
            const lines = [
              `Created ${result.created} holding(s).`,
              `Sheet: ${result.active_rows ?? '—'} active row(s), ${result.sold_rows ?? '—'} sold row(s).`,
            ]
            if (errs.length) {
              lines.push(`Some rows were skipped: ${errs.slice(0, 5).join(' · ')}`)
            }
            return lines.join('\n')
          },
          error: (err) =>
            err instanceof Error ? err.message : 'Import failed. Check your connection and try again.',
        },
      )
    } finally {
      setExcelImportRunning(false)
    }
  }

  const holdingsByClass = useMemo(() => {
    const grouped: Record<AssetClass, Holding[]> = {
      'mmf': [], 'real-estate': [], 'nse-stocks': [], 'global-stocks': [],
    }
    holdings.forEach((h) => {
      if (grouped[h.assetClass]) grouped[h.assetClass].push(h)
    })
    return grouped
  }, [holdings])

  const handleEdit = (holding: Holding) => {
    setEditingHolding(holding)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this holding?')) return
    setDeleting(id)
    try {
      await apiDeleteHolding(id)
      await refresh()
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handleExcelPick}
      />

      <Dialog open={excelConfirmOpen} onOpenChange={(open) => { if (!open) handleCancelExcelImport() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import holdings from Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Ready to import <span className="font-medium text-foreground">{pendingExcelFile?.name ?? 'your file'}</span>.
              This uses the Scope / global stocks layout (active positions and sold rows).
            </p>
            <p>New tickers will create <strong className="font-medium text-foreground">Sumstack Stock</strong> records. Values stay in USD.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleCancelExcelImport} disabled={excelImportRunning}>
              Cancel
            </Button>
            <Button type="button" onClick={handleStartExcelImport} disabled={excelImportRunning || !pendingExcelFile}>
              {excelImportRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : (
                'Start import'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Your Holdings</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={excelImportRunning}
              onClick={() => excelInputRef.current?.click()}
              title="Scope-style global stocks template (.xlsx)"
            >
              <Sheet className="h-4 w-4" />
              <span className="hidden sm:inline">Import Excel</span>
            </Button>
            <Button size="sm" className="h-8 gap-1" onClick={() => { setEditingHolding(null); setDialogOpen(true) }}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Holding</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {holdings.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-muted-foreground">No holdings yet. Add investments manually or import your Scope / global stocks Excel.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" disabled={excelImportRunning} onClick={() => excelInputRef.current?.click()}>
                  <Sheet className="mr-2 h-4 w-4" />
                  Import Excel
                </Button>
                <Button onClick={() => { setEditingHolding(null); setDialogOpen(true) }}>
                  <Plus className="mr-2 h-4 w-4" />Add Holding
                </Button>
              </div>
            </div>
          ) : (
            assetClasses.map((ac) => (
              <AssetClassSection
                key={ac}
                assetClass={ac}
                holdings={holdingsByClass[ac]}
                currency={currency}
                kesToDisplayMultiplier={kesToDisplayMultiplier}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))
          )}
        </CardContent>
      </Card>

      <HoldingDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingHolding(null) }}
        editing={editingHolding}
        onSaved={refresh}
      />
    </>
  )
}
