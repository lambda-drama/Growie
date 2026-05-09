'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  CalendarDays,
  Crown,
  ExternalLink,
  Loader2,
  Phone,
  Plus,
  Video,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppStore } from '@/lib/store'
import { useAuth } from '@/hooks/use-auth'
import {
  fetchCoachingAccess,
  fetchMyAppointments,
  bookAppointment,
  type GroweAppointmentRow,
} from '@/services/appointments'
import { cn } from '@/lib/utils'

const COACH_LABEL = 'Barbara Nzovu'

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  const s = (status || '').toLowerCase()
  if (s === 'confirmed') return 'default'
  if (s === 'closed') return 'secondary'
  if (s === 'unverified') return 'outline'
  return 'secondary'
}

function UpgradeGateCard() {
  const { setActiveTab } = useAppStore()
  const { user } = useAuth()
  const tier = user?.subscriptionTier ?? 'free'
  const isPro = tier === 'pro'

  return (
    <Card className="mx-auto max-w-lg border-accent/40 bg-accent/5">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
          <Crown className="h-7 w-7 text-accent" />
        </div>
        <CardTitle className="text-xl">One-on-One sessions — Coached plan</CardTitle>
        <CardDescription className="text-base">
          {isPro
            ? 'You are on Pro. One-on-one coaching appointments unlock with Sumstack Coached.'
            : 'Book private sessions with your investment coach. This benefit is reserved for Coached subscribers.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span><strong className="text-foreground">Scheduled time</strong> — pick when you&apos;d like to meet (shown in Sumstack Appointment).</span>
          </li>
          <li className="flex gap-2">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span><strong className="text-foreground">Coach & session details</strong> — our team confirms and may add a Google Meet link to your booking.</span>
          </li>
          <li className="flex gap-2">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span><strong className="text-foreground">Contact info</strong> — phone, Skype, and notes you share help the coach prepare.</span>
          </li>
        </ul>
        <Button className="w-full" size="lg" onClick={() => setActiveTab('pricing')}>
          {isPro ? 'Upgrade to Coached' : 'View plans & upgrade'}
        </Button>
      </CardContent>
    </Card>
  )
}

function AppointmentCard({ row }: { row: GroweAppointmentRow }) {
  let when = row.scheduled_time
  try {
    if (row.scheduled_time) {
      const normalized = row.scheduled_time.includes('T')
        ? row.scheduled_time
        : row.scheduled_time.replace(' ', 'T')
      const d = parseISO(normalized)
      if (!Number.isNaN(d.getTime())) when = format(d, 'EEE d MMM yyyy, HH:mm')
    }
  } catch {
    /* keep raw */
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{when}</p>
          {row.coach ? (
            <p className="text-xs text-muted-foreground">Coach: {row.coach}</p>
          ) : null}
        </div>
        <Badge variant={statusBadgeVariant(row.status)}>{row.status || '—'}</Badge>
      </div>
      {row.customer_details ? (
        <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">{row.customer_details}</p>
      ) : null}
      {row.google_link ? (
        <a
          href={row.google_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Join link
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Meeting link appears here after your session is confirmed.</p>
      )}
    </div>
  )
}

interface BookModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onBooked: () => void
}

function BookAppointmentModal({ open, onOpenChange, onBooked }: BookModalProps) {
  const [slotLocal, setSlotLocal] = useState('')
  const [phone, setPhone] = useState('')
  const [skype, setSkype] = useState('')
  const [altEmail, setAltEmail] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setSlotLocal('')
    setPhone('')
    setSkype('')
    setAltEmail('')
    setDetails('')
    setError(null)
  }

  const handleClose = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!slotLocal) {
      setError('Choose a date and time for your session.')
      return
    }
    const dt = new Date(slotLocal)
    if (Number.isNaN(dt.getTime())) {
      setError('Invalid date or time.')
      return
    }
    if (dt.getTime() <= Date.now()) {
      setError('Pick a time in the future.')
      return
    }
    setSaving(true)
    try {
      await bookAppointment({
        scheduledTimeIso: dt.toISOString(),
        customerPhone: phone,
        customerSkype: skype,
        customerAltEmail: altEmail,
        customerDetails: details,
      })
      reset()
      onOpenChange(false)
      onBooked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not book')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book a coaching session</DialogTitle>
          <DialogDescription>
            Request a time with {COACH_LABEL}. We&apos;ll confirm by email and may add a Google Meet link to this
            appointment once verified.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Investment coach</p>
            <p className="text-muted-foreground">{COACH_LABEL}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appt-time">Scheduled time *</Label>
            <Input
              id="appt-time"
              type="datetime-local"
              value={slotLocal}
              onChange={(e) => setSlotLocal(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Times are sent in your device&apos;s local timezone.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appt-phone">Phone number</Label>
            <Input id="appt-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254…" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="appt-skype">Skype ID</Label>
            <Input id="appt-skype" value={skype} onChange={(e) => setSkype(e.target.value)} placeholder="Optional" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="appt-email2">Alternative email</Label>
            <Input
              id="appt-email2"
              type="email"
              value={altEmail}
              onChange={(e) => setAltEmail(e.target.value)}
              placeholder="Optional second address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="appt-details">What you&apos;d like to cover</Label>
            <Textarea
              id="appt-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Goals, portfolio topics, or questions for your coach…"
              rows={4}
            />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Request session'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AppointmentsView() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  /** `undefined` = still resolving or access request failed fatally */
  const [eligible, setEligible] = useState<boolean | undefined>(undefined)
  const [tier, setTier] = useState<string | null>(null)
  const [rows, setRows] = useState<GroweAppointmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [bookOpen, setBookOpen] = useState(false)

  const load = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    setAccessError(null)
    setListError(null)
    try {
      const access = await fetchCoachingAccess()
      setEligible(access.eligible)
      setTier(access.tier)
      if (access.eligible) {
        try {
          const list = await fetchMyAppointments()
          setRows(list)
        } catch (e) {
          setListError(e instanceof Error ? e.message : 'Could not load appointments')
          setRows([])
        }
      } else {
        setRows([])
      }
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : 'Could not load')
      setEligible(undefined)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      setLoading(false)
      return
    }
    void load()
  }, [authLoading, isAuthenticated, load])

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  if (accessError) {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto">
        <AlertDescription>{accessError}</AlertDescription>
      </Alert>
    )
  }

  if (eligible === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coach</h1>
          <p className="text-muted-foreground">
            {tier === 'pro'
              ? 'You have full Pro access. Add Coached to book private sessions.'
              : 'Upgrade to Coached for one-on-one time with your investment coach.'}
          </p>
        </div>
        <UpgradeGateCard />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coach sessions</h1>
          <p className="text-muted-foreground">
            Book and track appointments with {COACH_LABEL}. New requests start as <strong>Unverified</strong> until the team
            confirms.
          </p>
        </div>
        <Button onClick={() => setBookOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Book session
        </Button>
      </div>

      {listError ? (
        <Alert variant="destructive">
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      <BookAppointmentModal open={bookOpen} onOpenChange={setBookOpen} onBooked={load} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className={cn(rows.length === 0 && 'md:col-span-2')}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Your appointments
            </CardTitle>
            <CardDescription>Aligned with Sumstack Appointment on the backend (scheduled time, status, meet link).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions yet. Book your first conversation above.</p>
            ) : (
              rows.map((r) => <AppointmentCard key={r.name} row={r} />)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What we store</CardTitle>
            <CardDescription>Fields available on your booking record</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
              <li><strong className="text-foreground">Scheduled time</strong> — session slot you requested</li>
              <li><strong className="text-foreground">Status</strong> — Open, Confirmed, Unverified, or Closed</li>
              <li><strong className="text-foreground">Phone &amp; Skype</strong> — how to reach you</li>
              <li><strong className="text-foreground">Details</strong> — your notes for the coach</li>
              <li><strong className="text-foreground">Google link</strong> — added by staff after confirmation when applicable</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
