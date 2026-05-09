'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronsUpDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import { getCurrencies } from '@/services/portfolio'

interface DisplayCurrencyPickerProps {
  value: string
  onSelect: (currencyCode: string) => void
  className?: string
  triggerClassName?: string
}

export function DisplayCurrencyPicker({
  value,
  onSelect,
  className,
  triggerClassName,
}: DisplayCurrencyPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [list, setList] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const rows = await getCurrencies(q)
      setList(rows.length ? rows : ['USD'])
    } catch {
      setList(['USD'])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load(query)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleQueryChange = (q: string) => {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(q), 250)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-8 gap-1 px-2 font-normal', triggerClassName)}
          aria-label="Display currency"
        >
          <span className="font-medium">{value || 'USD'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[280px] p-0', className)} align="end">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Search currency…"
              value={query}
              onValueChange={handleQueryChange}
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <CommandList className="max-h-56">
            {loading && (
              <div className="py-3 text-center text-sm text-muted-foreground">Loading…</div>
            )}
            {!loading && list.length === 0 && (
              <CommandEmpty>No currencies found.</CommandEmpty>
            )}
            {!loading && list.length > 0 && (
              <CommandGroup>
                {list.map((ccy) => (
                  <CommandItem
                    key={ccy}
                    value={ccy}
                    onSelect={() => {
                      onSelect(ccy)
                      setOpen(false)
                      setQuery('')
                    }}
                    className="cursor-pointer"
                  >
                    {ccy}
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
