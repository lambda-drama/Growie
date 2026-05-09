'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { HelpCircle, Loader2, MessageSquarePlus, Send, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getMyIssues,
  getIssueTypes,
  createSupportIssue,
  markSupportInboxRead,
  type SupportIssue,
} from '@/services/support'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'


function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}


function IssueCard({ issue }: { issue: SupportIssue }) {
  const [open, setOpen] = useState(false)
  const showReply = issue.hasReply && (issue.replied || (issue.resolutionDetails?.length ?? 0) > 0)

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{issue.subject}</h3>
          <p className="text-xs text-muted-foreground">
            {issue.issueType && (
              <span className="mr-2">
                Type: <span className="text-foreground">{issue.issueType}</span>
              </span>
            )}
            {issue.modified
              ? `Updated ${format(new Date(issue.modified), 'dd MMM yyyy, HH:mm')}`
              : ''}
          </p>
        </div>
        <Badge variant="secondary">{issue.status || '—'}</Badge>
      </div>
      {issue.description && (
        <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{issue.description}</p>
      )}

      {showReply && (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-left text-sm font-medium text-primary">
            <span>Support reply {issue.replied && '(replied)'}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap text-foreground">
           {issue.resolutionDetails
  ? stripHtml(issue.resolutionDetails)
  : 'This ticket has been updated by support. See status above.'}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

export function SupportView() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth()
  const [issues, setIssues] = useState<SupportIssue[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [issueType, setIssueType] = useState('')

  const load = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const [list, t] = await Promise.all([getMyIssues(), getIssueTypes()])
      setIssues(list)
      setTypes(t)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not load support data.')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (types.length > 0 && !issueType) {
      setIssueType(types[0] ?? '')
    }
  }, [types, issueType])

  useEffect(() => {
    if (!isAuthenticated) return
    void load()
    void markSupportInboxRead()
  }, [isAuthenticated, load])

  const handleSubmit = async () => {
    setFormError(null)
    if (!subject.trim() || !description.trim()) {
      setFormError('Please enter a subject and description.')
      return
    }
    if (types.length > 0 && !issueType) {
      setFormError('Please select an issue type.')
      return
    }
    setSubmitting(true)
    try {
      await createSupportIssue(subject.trim(), description.trim(), issueType)
      setSubject('')
      setDescription('')
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create issue')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return null
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HelpCircle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Help &amp; Support</h1>
          <p className="text-muted-foreground">Raise a ticket and we will get back to you here.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquarePlus className="h-5 w-5" />
            New request
          </CardTitle>
          <CardDescription>Describe the issue. When support replies, you will see it below and in notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          {types.length > 0 && (
            <div className="space-y-2">
              <Label>Issue type</Label>
              <Select value={issueType} onValueChange={setIssueType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="issue-subj">Subject</Label>
            <Input
              id="issue-subj"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue-desc">Details</Label>
            <Textarea
              id="issue-desc"
              className="min-h-[120px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? What do you need?"
            />
          </div>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Send className="mr-2 h-4 w-4" />
            Submit
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Your tickets</h2>
        {loading && (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}
        {!loading && issues.length === 0 && (
          <p className="text-sm text-muted-foreground">You have not submitted any issues yet.</p>
        )}
        {!loading && issues.length > 0 && (
          <ul className="space-y-4">
            {issues.map((i) => (
              <li key={i.name}>
                <IssueCard issue={i} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
