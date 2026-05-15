'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Goal as GoalIcon,
  Plus,
  RefreshCcw,
  ArrowDownLeft,
  ArrowUpRight,
  PiggyBank,
  Target,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useGoals } from '@/hooks/use-goals'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/lib/store'
import { formatCurrencyNative } from '@/lib/format'
import type { Currency } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DisplayCurrencyPicker } from '@/components/currency/display-currency-picker'
import type { GroweGoal, GroweGoalTransaction } from '@/services/goals'

const GOAL_CATEGORIES = [
  'Retirement',
  'Home',
  'Education',
  'Emergency',
  'Travel',
  'Wealth Building',
] as const

const PRIORITIES = ['High', 'Medium', 'Low'] as const

const TX_TYPES = ['Deposit', 'Withdrawal', 'Interest', 'Dividend', 'Adjustment'] as const

const TX_SOURCES = ['Bank Transfer', 'M-Pesa', 'Salary', 'Investment Return', 'Cash', 'Other'] as const

function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'Achieved') return 'default'
  if (status === 'Paused') return 'outline'
  return 'secondary'
}

function formatGoalDate(value: string) {
  if (!value) return '—'
  try {
    const d = parseISO(value.includes('T') ? value : `${value}T00:00:00`)
    if (!Number.isNaN(d.getTime())) return format(d, 'd MMM yyyy')
  } catch { /**/ }
  return value
}

function GoalCard({
  goal,
  selected,
  onSelect,
}: {
  goal: GroweGoal
  selected: boolean
  onSelect: () => void
}) {
  const pct = Math.min(goal.progressPercent, 100)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40',
        selected && 'border-primary ring-1 ring-primary/20'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground truncate">{goal.goalName}</p>
          <p className="text-xs text-muted-foreground">{goal.category}</p>
        </div>
        <Badge variant={statusVariant(goal.status)} className="shrink-0">
          {goal.status}
        </Badge>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Saved</span>
          <span className="font-medium">
            {formatCurrencyNative(goal.currentAmount, (goal.currency || 'USD') as Currency)} /{' '}
            {formatCurrencyNative(goal.targetAmount, (goal.currency || 'USD') as Currency)}
          </span>
        </div>
        <Progress value={pct} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {pct.toFixed(0)}% · Target {formatGoalDate(goal.targetDate)}
        </p>
      </div>
    </button>
  )
}

function TransactionRow({ txn }: { txn: GroweGoalTransaction }) {
  const isOut = txn.transactionType === 'Withdrawal'
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          isOut ? 'bg-destructive/10 text-destructive' : 'bg-secondary/20 text-secondary-foreground'
        )}
      >
        {isOut ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{txn.transactionType}</p>
        <p className="text-xs text-muted-foreground">
          {formatGoalDate(txn.transactionDate)}
          {txn.source ? ` · ${txn.source}` : ''}
        </p>
        {txn.notes ? (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{txn.notes}</p>
        ) : null}
      </div>
      <div className="text-right shrink-0">
        <p className={cn('text-sm font-semibold', isOut && 'text-destructive')}>
          {isOut ? '−' : '+'}
          {formatCurrencyNative(txn.amount, (txn.currency || 'USD') as Currency)}
        </p>
        {txn.reference ? (
          <p className="text-xs text-muted-foreground truncate max-w-[100px]">{txn.reference}</p>
        ) : null}
      </div>
    </div>
  )
}


export function GoalsView() {
  const { isAuthenticated } = useAuth()
  const { setAuthModal, currency: displayCurrency } = useAppStore()
  const {
    goals,
    selectedGoal,
    selectedGoalId,
    transactions,
    totals,
    isLoading,
    error,
    loadGoals,
    selectGoal,
    addGoal,
    recordTransaction,
  } = useGoals()

  const [createOpen, setCreateOpen] = useState(false)
  const [txnOpen, setTxnOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const defaultCurrency = (displayCurrency || 'USD').toUpperCase()

  const [newGoal, setNewGoal] = useState({
    goalName: '',
    targetAmount: '',
    targetDate: '',
    category: 'Wealth Building',
    priority: 'Medium',
    monthlyContribution: '',
    currency: defaultCurrency,
  })

  const [newTxn, setNewTxn] = useState({
    amount: '',
    transactionType: 'Deposit',
    transactionDate: format(new Date(), 'yyyy-MM-dd'),
    currency: defaultCurrency,
    source: 'Bank Transfer',
    reference: '',
    notes: '',
  })

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Goals</h1>
          <p className="text-muted-foreground">Save toward what matters most</p>
        </div>
        <div className="rounded-lg border-2 border-dashed border-muted p-12 text-center">
          <GoalIcon className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Sign in to track your goals</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create savings goals and log deposits, withdrawals, and returns.
          </p>
          <Button className="mt-4" onClick={() => setAuthModal('login')}>
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  const handleCreateGoal = async () => {
    setFormError(null)
    const target = parseFloat(newGoal.targetAmount)
    if (!newGoal.goalName.trim()) {
      setFormError('Goal name is required')
      return
    }
    if (!target || target <= 0) {
      setFormError('Enter a valid target amount')
      return
    }
    if (!newGoal.targetDate) {
      setFormError('Target date is required')
      return
    }
    setSubmitting(true)
    try {
      const goal = await addGoal({
        goalName: newGoal.goalName.trim(),
        targetAmount: target,
        targetDate: newGoal.targetDate,
        category: newGoal.category,
        priority: newGoal.priority,
        monthlyContribution: parseFloat(newGoal.monthlyContribution) || 0,
        currency: newGoal.currency || defaultCurrency,
      })
      setCreateOpen(false)
      setNewGoal({
        goalName: '',
        targetAmount: '',
        targetDate: '',
        category: 'Wealth Building',
        priority: 'Medium',
        monthlyContribution: '',
        currency: defaultCurrency,
      })
      selectGoal(goal.id)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create goal')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddTransaction = async () => {
    if (!selectedGoalId) return
    setFormError(null)
    const amount = parseFloat(newTxn.amount)
    if (!amount || amount <= 0) {
      setFormError('Enter a valid amount')
      return
    }
    setSubmitting(true)
    try {
      await recordTransaction({
        goalId: selectedGoalId,
        amount,
        transactionType: newTxn.transactionType,
        transactionDate: newTxn.transactionDate,
        currency: newTxn.currency || selectedGoal?.currency || defaultCurrency,
        source: newTxn.source,
        reference: newTxn.reference,
        notes: newTxn.notes,
      })
      setTxnOpen(false)
      setNewTxn({
        amount: '',
        transactionType: 'Deposit',
        transactionDate: format(new Date(), 'yyyy-MM-dd'),
        currency: selectedGoal?.currency || defaultCurrency,
        source: 'Bank Transfer',
        reference: '',
        notes: '',
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add transaction')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Goals</h1>
          <p className="text-muted-foreground">
            Set targets and log contributions — each transaction updates your saved balance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={loadGoals} disabled={isLoading}>
            <RefreshCcw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Goal
          </Button>
        </div>
      </div>

      {(error || formError) && !createOpen && !txnOpen ? (
        <Alert variant="destructive">
          <AlertDescription>{error || formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4" />
              Total saved
            </CardDescription>
            <CardTitle className="text-2xl">
              {totals.mixedCurrencies
                ? 'Multiple currencies'
                : formatCurrencyNative(totals.saved, (totals.currency || 'USD') as Currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Combined targets
            </CardDescription>
            <CardTitle className="text-2xl">
              {totals.mixedCurrencies
                ? '—'
                : formatCurrencyNative(totals.target, (totals.currency || 'USD') as Currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active goals</CardDescription>
            <CardTitle className="text-2xl">{totals.activeCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {isLoading && goals.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : goals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <GoalIcon className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No goals yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create your first savings goal — emergency fund, home deposit, education, and more.
            </p>
            <Button className="mt-6 gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create a goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            <p className="text-sm font-medium text-muted-foreground">Your goals</p>
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                selected={selectedGoalId === goal.id}
                onSelect={() => selectGoal(goal.id)}
              />
            ))}
          </div>

          <div className="lg:col-span-3">
            {selectedGoal ? (
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{selectedGoal.goalName}</CardTitle>
                      <CardDescription>
                        {selectedGoal.category} · {selectedGoal.priority} priority · Due{' '}
                        {formatGoalDate(selectedGoal.targetDate)}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusVariant(selectedGoal.status)}>{selectedGoal.status}</Badge>
                      <Button
                        size="sm"
                        className="gap-1"
                        onClick={() => {
                          setFormError(null)
                          setNewTxn((s) => ({
                            ...s,
                            currency: selectedGoal.currency || defaultCurrency,
                          }))
                          setTxnOpen(true)
                        }}
                        disabled={selectedGoal.status === 'Achieved'}
                      >
                        <Plus className="h-4 w-4" />
                        Add transaction
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>
                        {formatCurrencyNative(
                          selectedGoal.currentAmount,
                          (selectedGoal.currency || 'USD') as Currency
                        )}{' '}
                        of{' '}
                        {formatCurrencyNative(
                          selectedGoal.targetAmount,
                          (selectedGoal.currency || 'USD') as Currency
                        )}
                      </span>
                      <span className="font-medium">{selectedGoal.progressPercent.toFixed(0)}%</span>
                    </div>
                    <Progress value={Math.min(selectedGoal.progressPercent, 100)} className="h-3" />
                    {selectedGoal.monthlyContribution > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Planned monthly:{' '}
                        {formatCurrencyNative(
                          selectedGoal.monthlyContribution,
                          (selectedGoal.currency || 'USD') as Currency
                        )}
                      </p>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-sm font-medium text-foreground">Transactions</p>
                  {transactions.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No transactions yet. Add a deposit to start building this goal.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {transactions.map((txn) => (
                        <TransactionRow key={txn.id} txn={txn} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="flex h-full min-h-[280px] items-center justify-center border-dashed">
                <CardContent className="text-center text-muted-foreground">
                  <GoalIcon className="mx-auto h-10 w-10 opacity-50" />
                  <p className="mt-3 text-sm">Select a goal to view progress and transactions</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a goal</DialogTitle>
            <DialogDescription>
              Set a target amount and date. You can log contributions after creating the goal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="goal-name">Goal name</Label>
              <Input
                id="goal-name"
                placeholder="e.g. Emergency fund"
                value={newGoal.goalName}
                onChange={(e) => setNewGoal((s) => ({ ...s, goalName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Currency</Label>
                <DisplayCurrencyPicker
                  value={newGoal.currency}
                  onSelect={(ccy) => setNewGoal((s) => ({ ...s, currency: ccy }))}
                  triggerClassName="w-full justify-between h-10"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="target-date">Target date</Label>
                <Input
                  id="target-date"
                  type="date"
                  value={newGoal.targetDate}
                  onChange={(e) => setNewGoal((s) => ({ ...s, targetDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="target-amount">
                Target amount ({newGoal.currency || defaultCurrency})
              </Label>
              <Input
                id="target-amount"
                type="number"
                min={1}
                placeholder="50000"
                value={newGoal.targetAmount}
                onChange={(e) => setNewGoal((s) => ({ ...s, targetAmount: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={newGoal.category}
                  onValueChange={(v) => setNewGoal((s) => ({ ...s, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Priority</Label>
                <Select
                  value={newGoal.priority}
                  onValueChange={(v) => setNewGoal((s) => ({ ...s, priority: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="monthly">Monthly contribution (optional)</Label>
              <Input
                id="monthly"
                type="number"
                min={0}
                placeholder="10000"
                value={newGoal.monthlyContribution}
                onChange={(e) => setNewGoal((s) => ({ ...s, monthlyContribution: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateGoal} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create goal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={txnOpen} onOpenChange={setTxnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
            <DialogDescription>
              {selectedGoal
                ? `Record a contribution to “${selectedGoal.goalName}”. Submitted transactions update the saved balance.`
                : 'Select a goal first.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={newTxn.transactionType}
                  onValueChange={(v) => setNewTxn((s) => ({ ...s, transactionType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TX_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <DisplayCurrencyPicker
                  value={newTxn.currency}
                  onSelect={(ccy) => setNewTxn((s) => ({ ...s, currency: ccy }))}
                  triggerClassName="w-full justify-between h-10"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="txn-amount">
                Amount ({newTxn.currency || selectedGoal?.currency || defaultCurrency})
              </Label>
              <Input
                id="txn-amount"
                type="number"
                min={0.01}
                step="0.01"
                value={newTxn.amount}
                onChange={(e) => setNewTxn((s) => ({ ...s, amount: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="txn-date">Date</Label>
                <Input
                  id="txn-date"
                  type="date"
                  value={newTxn.transactionDate}
                  onChange={(e) => setNewTxn((s) => ({ ...s, transactionDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Source</Label>
                <Select
                  value={newTxn.source}
                  onValueChange={(v) => setNewTxn((s) => ({ ...s, source: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TX_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="txn-ref">Reference (optional)</Label>
              <Input
                id="txn-ref"
                placeholder="M-Pesa code, bank ref…"
                value={newTxn.reference}
                onChange={(e) => setNewTxn((s) => ({ ...s, reference: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="txn-notes">Notes (optional)</Label>
              <Textarea
                id="txn-notes"
                rows={2}
                value={newTxn.notes}
                onChange={(e) => setNewTxn((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxnOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTransaction} disabled={submitting || !selectedGoalId}>
              {submitting ? 'Saving…' : 'Add transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
