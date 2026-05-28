'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Download, Eye, Loader2, TrendingDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDisplayMoney } from '@/lib/store'
import { formatCurrency, formatHoldingMoney } from '@/lib/format'
import {
  downloadReportPdf,
  fetchSoldTransactions,
  previewReport,
  type SoldTransaction,
} from '@/services/reports'

function formatSoldDate(value: string) {
  if (!value) return '—'
  try {
    const d = parseISO(value.includes('T') ? value : `${value}T00:00:00`)
    if (!Number.isNaN(d.getTime())) return format(d, 'd MMM yyyy')
  } catch {
    /**/
  }
  return value
}

function assetLabel(tx: SoldTransaction) {
  const base = tx.ticker || tx.assetName || '—'
  if (tx.marketTag && base !== '—') return `${base} (${tx.marketTag})`
  return base
}

function notesLabel(tx: SoldTransaction) {
  const bits = [tx.reference, tx.notes].filter((x) => x?.trim())
  return bits.length ? bits.join(' · ') : '—'
}

interface ReportsSoldTabProps {
  onError: (message: string | null) => void
  onPreview: (title: string, html: string) => void
  onPreviewLoadingChange: (loading: boolean) => void
  previewLoading: boolean
}

export function ReportsSoldTab({
  onError,
  onPreview,
  onPreviewLoadingChange,
  previewLoading,
}: ReportsSoldTabProps) {
  const { currency, kesToDisplayMultiplier, kesPerUsd } = useDisplayMoney()
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [transactions, setTransactions] = useState<SoldTransaction[]>([])
  const [summary, setSummary] = useState({
    count: 0,
    sellTradeCount: 0,
    markedSoldCount: 0,
    totalProceedsKES: 0,
  })

  const load = useCallback(async () => {
    setLoading(true)
    onError(null)
    try {
      const data = await fetchSoldTransactions(currency)
      setTransactions(data.transactions)
      setSummary({
        count: data.summary.count,
        sellTradeCount: data.summary.sellTradeCount ?? 0,
        markedSoldCount: data.summary.markedSoldCount ?? 0,
        totalProceedsKES: data.summary.totalProceedsKES,
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load sold transactions')
      setTransactions([])
      setSummary({ count: 0, sellTradeCount: 0, markedSoldCount: 0, totalProceedsKES: 0 })
    } finally {
      setLoading(false)
    }
  }, [currency, onError])

  useEffect(() => {
    void load()
  }, [load])

  const handlePreviewPdf = async () => {
    onError(null)
    onPreviewLoadingChange(true)
    try {
      const { title, html } = await previewReport('sold', currency)
      onPreview(title, html)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      onPreviewLoadingChange(false)
    }
  }

  const handleDownloadPdf = async () => {
    onError(null)
    setDownloading(true)
    try {
      await downloadReportPdf('sold', currency)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Sell trades from My Stack and holdings marked as sold (including rows imported from
            Excel under &ldquo;Sold Stocks&rdquo;). Subscription or deposit payments are not
            included.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void handlePreviewPdf()}
            disabled={previewLoading || loading}
          >
            <Eye className="h-4 w-4" />
            Preview PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-primary text-primary hover:bg-primary/5"
            onClick={() => void handleDownloadPdf()}
            disabled={downloading || loading}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total rows
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{summary.count}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <TrendingDown className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sell trades
                  </p>
                  <p className="text-xl font-semibold tabular-nums">{summary.sellTradeCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Marked sold
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{summary.markedSoldCount}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total proceeds
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatCurrency(summary.totalProceedsKES, currency as 'USD', {
                    kesToDisplayMultiplier,
                  })}
                </p>
              </CardContent>
            </Card>
          </div>

          {transactions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No sold positions yet. Sell shares in My Stack or import sold rows from Excel to see
                them here.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-right">Qty sold</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Proceeds</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatSoldDate(tx.transactionDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {tx.sourceLabel || (tx.source === 'holding' ? 'Marked sold' : 'Sell trade')}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{assetLabel(tx)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {tx.assetClassLabel || tx.assetClass || '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tx.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tx.unitPrice > 0
                            ? formatHoldingMoney(tx.unitPrice, tx.currency as 'USD', currency, {
                                kesToDisplayMultiplier,
                                kesPerUsd,
                                compact: true,
                              })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(tx.proceedsKES, currency as 'USD', {
                            kesToDisplayMultiplier,
                          })}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {notesLabel(tx)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="divide-y md:hidden">
                {transactions.map((tx) => (
                  <li key={tx.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{assetLabel(tx)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSoldDate(tx.transactionDate)}
                          {tx.assetClassLabel ? ` · ${tx.assetClassLabel}` : ''}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 max-w-[120px] truncate">
                        {tx.sourceLabel || 'Sell'}
                      </Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Qty sold</dt>
                        <dd className="font-medium tabular-nums">
                          {tx.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Proceeds</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatCurrency(tx.proceedsKES, currency as 'USD', {
                            kesToDisplayMultiplier,
                          })}
                        </dd>
                      </div>
                      {tx.unitPrice > 0 ? (
                        <div className="col-span-2">
                          <dt className="text-muted-foreground">Unit price</dt>
                          <dd className="font-medium tabular-nums">
                            {formatHoldingMoney(tx.unitPrice, tx.currency as 'USD', currency, {
                              kesToDisplayMultiplier,
                              kesPerUsd,
                            })}
                          </dd>
                        </div>
                      ) : null}
                      {notesLabel(tx) !== '—' ? (
                        <div className="col-span-2">
                          <dt className="text-muted-foreground">Notes</dt>
                          <dd className="text-foreground">{notesLabel(tx)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
