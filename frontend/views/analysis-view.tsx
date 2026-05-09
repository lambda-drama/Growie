'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Brain, Sparkles, AlertTriangle, TrendingUp,
  MessageCircle, Send, Loader2, Bot, User,
  RefreshCcw, ChevronDown, History, Clock, X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDateRelative } from '@/lib/format'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/lib/store'
import {
  getProviderStatus, chat, analysePortfolio,
  getConversationHistory,
  type AIProviderStatus, type ChatMessage, type ConversationRecord,
} from '@/services/ai'

// ─── Quick prompts ────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  'What NSE stocks look promising right now for a Kenyan investor?',
  'How should I think about currency risk as a diaspora investor?',
  'What is the difference between MMF and Treasury Bills in Kenya?',
  'How do I start investing in global ETFs from Kenya?',
  'What is a good KES portfolio split for a moderate risk investor?',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripTrailingAdvisoryLine(text: string): string {
  const lines = text.split('\n')
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop()
  }
  if (!lines.length) return ''

  const last = lines[lines.length - 1].trim().replace(/^\*+|\*+$/g, '').toLowerCase()
  if (
    last.includes('not regulated financial advice') ||
    (last.includes('consult') && last.includes('cma-licensed advisor'))
  ) {
    lines.pop()
    while (lines.length && !lines[lines.length - 1].trim()) {
      lines.pop()
    }
  }
  return lines.join('\n')
}

function renderInlineBold(text: string): React.ReactNode {
  const out: React.ReactNode[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index).replace(/\*\*/g, ''))
    out.push(
      <strong key={`b-${m.index}`} className="font-semibold text-foreground">
        {m[1]}
      </strong>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last).replace(/\*\*/g, ''))
  return out.length ? out : text
}

function AIText({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {text.split('\n').map((line, i) =>
        line.trim() ? (
          <p key={i}>{renderInlineBold(line)}</p>
        ) : (
          <br key={i} />
        )
      )}
    </div>
  )
}

function Bubble({ msg, providerLabel }: { msg: ChatMessage; providerLabel: string }) {
  const isUser = msg.role === 'user'
  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs',
        isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary/15 text-secondary',
      )}>
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
        isUser
          ? 'bg-primary text-primary-foreground rounded-tr-sm'
          : 'bg-muted rounded-tl-sm',
      )}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <>
            <AIText text={msg.content} />
            <p className="mt-1.5 text-xs opacity-40">{providerLabel}</p>
          </>
        )}
      </div>
    </div>
  )
}

function ProviderBadge({ status }: { status: AIProviderStatus | null }) {
  if (!status) return <Skeleton className="h-5 w-32 rounded-full" />
  if (!status.configured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" /> No AI provider set
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <Bot className="h-3 w-3" />
      {status.providerName} · {status.model}
    </span>
  )
}

// ─── History panel ────────────────────────────────────────────────────────────

function HistoryPanel({
  records,
  isLoading,
  onRestore,
  onClose,
}: {
  records: ConversationRecord[]
  isLoading: boolean
  onRestore: (r: ConversationRecord) => void
  onClose: () => void
}) {
  const typeColors: Record<string, string> = {
    'Chat': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'Portfolio Analysis': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    'Holding Analysis': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  }

  return (
    <Card className="flex flex-col overflow-hidden" style={{ maxHeight: 480 }}>
      <CardHeader className="shrink-0 border-b py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" /> AI Conversation History
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : records.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          records.map((r) => (
            <button
              key={r.id}
              onClick={() => onRestore(r)}
              className="flex w-full flex-col gap-1 border-b px-4 py-3 text-left hover:bg-muted/40 transition-colors last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', typeColors[r.type] ?? '')}>
                  {r.type}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDateRelative(r.askedAt)}
                </span>
              </div>
              <p className="truncate text-sm font-medium">{r.question}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{r.answer}</p>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function AnalysisView() {
  const { isAuthenticated } = useAuth()
  const { setAuthModal } = useAppStore()

  const [providerStatus, setProviderStatus] = useState<AIProviderStatus | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [portfolioAnalysis, setPortfolioAnalysis] = useState<string | null>(null)
  const [analysisProvider, setAnalysisProvider] = useState('')
  const [showQuickPrompts, setShowQuickPrompts] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<ConversationRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadStatus = useCallback(async () => {
    if (!isAuthenticated) return
    const s = await getProviderStatus()
    setProviderStatus(s)
  }, [isAuthenticated])

  useEffect(() => { loadStatus() }, [loadStatus])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) return
    setHistoryLoading(true)
    const records = await getConversationHistory(30)
    setHistory(records)
    setHistoryLoading(false)
  }, [isAuthenticated])

  const handleShowHistory = () => {
    if (!showHistory) loadHistory()
    setShowHistory((v) => !v)
  }

  const restoreFromHistory = (r: ConversationRecord) => {
    setMessages([
      { role: 'user', content: r.question },
      { role: 'assistant', content: r.answer },
    ])
    setShowHistory(false)
    setShowQuickPrompts(false)
  }

  const sendMessage = async (text: string) => {
    const q = text.trim()
    if (!q || isSending) return
    setInput('')
    setShowQuickPrompts(false)

    setMessages((prev) => [...prev, { role: 'user', content: q }])
    setIsSending(true)
    try {
      const result = await chat(q)
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }])
      setProviderStatus((prev) =>
        prev ? { ...prev, providerName: result.provider, model: result.model } : prev
      )
      // Refresh history badge count silently
      getConversationHistory(30).then(setHistory)
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠ ${err instanceof Error ? err.message : 'Something went wrong. Check that an AI provider is configured in Sumstack Settings.'}`,
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  const handlePortfolioAnalysis = async () => {
    setIsAnalysing(true)
    setPortfolioAnalysis(null)
    try {
      const result = await analysePortfolio()
      setPortfolioAnalysis(stripTrailingAdvisoryLine(result.reply))
      setAnalysisProvider(`${result.provider} · ${result.model}`)
      getConversationHistory(30).then(setHistory)
    } catch (err) {
      setPortfolioAnalysis(
        `⚠ ${err instanceof Error ? err.message : 'Could not analyse portfolio.'}`
      )
    } finally {
      setIsAnalysing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const notConfigured = providerStatus !== null && !providerStatus.configured
  const providerLabel = providerStatus?.providerName
    ? `${providerStatus.providerName} · ${providerStatus.model}`
    : 'Sumstack AI'

  // ── Unauthenticated ──
  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/10">
          <Brain className="h-8 w-8 text-secondary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Sumstack AI Analysis</h1>
          <p className="mt-2 text-muted-foreground">
            AI-powered insights on your portfolio, NSE stocks, and the Kenyan investment landscape.
            Sign in to start.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setAuthModal('login')}>Sign In</Button>
          <Button variant="outline" onClick={() => setAuthModal('signup')}>Create Account</Button>
        </div>
        <div className="mt-4 w-full space-y-2 text-left">
          <p className="text-xs font-medium uppercase text-muted-foreground">You can ask…</p>
          {QUICK_PROMPTS.slice(0, 3).map((p) => (
            <div key={p} className="rounded-lg border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground opacity-60">
              {p}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Brain className="h-6 w-6 text-secondary" /> Sumstack AI
          </h1>
          <p className="text-sm text-muted-foreground">
            Personalised insights for Kenyan &amp; diaspora investors
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProviderBadge status={providerStatus} />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShowHistory}
            className="gap-1.5 text-xs"
          >
            <History className="h-3.5 w-3.5" />
            History
            {history.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-xs">{history.length}</Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Provider warning */}
      {notConfigured && (
        <Card className="border-yellow-400/50 bg-yellow-50 dark:bg-yellow-900/10">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
            <div className="text-sm">
              <p className="font-semibold text-yellow-800 dark:text-yellow-300">AI provider not configured</p>
              <p className="text-yellow-700 dark:text-yellow-400">
                {providerStatus?.reason ?? 'Go to Frappe Desk → Sumstack AI Provider, create a provider, then set it as Default in Sumstack Settings.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History panel */}
      {showHistory && (
        <HistoryPanel
          records={history}
          isLoading={historyLoading}
          onRestore={restoreFromHistory}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Portfolio Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-accent" /> Portfolio Analysis
            </CardTitle>
            <Button
              size="sm"
              onClick={handlePortfolioAnalysis}
              disabled={isAnalysing || notConfigured}
              className="gap-2"
            >
              {isAnalysing
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</>
                : <><Brain className="h-4 w-4" /> Analyse My Portfolio</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {portfolioAnalysis ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-muted/40 p-4">
                <AIText text={portfolioAnalysis} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">via {analysisProvider}</p>
                <Button variant="ghost" size="sm" onClick={handlePortfolioAnalysis} className="h-7 gap-1 text-xs">
                  <RefreshCcw className="h-3 w-3" /> Re-analyse
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-muted/20 py-10 text-center text-sm text-muted-foreground">
              <Brain className="mx-auto mb-2 h-8 w-8 opacity-25" />
              Click <strong>Analyse My Portfolio</strong> for an AI overview of your holdings,
              diversification, and recommended next steps.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chat */}
      <Card className="overflow-hidden">
        <CardHeader className="shrink-0 border-b py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageCircle className="h-4 w-4" /> Ask Sumstack AI
            </CardTitle>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={() => { setMessages([]); setShowQuickPrompts(true) }}
              >
                <X className="h-3 w-3" /> Clear chat
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Messages */}
        <div className="flex flex-col gap-4 overflow-y-auto p-4" style={{ maxHeight: 400, minHeight: 180 }}>
          {messages.length === 0 && showQuickPrompts && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">Quick start</p>
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  disabled={notConfigured || isSending}
                  className="block w-full rounded-lg border bg-muted/20 px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setShowQuickPrompts(false)}
                className="flex w-full items-center justify-center gap-1 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-3 w-3" /> Hide
              </button>
            </div>
          )}

          {messages.map((msg, i) => (
            <Bubble key={i} msg={msg} providerLabel={providerLabel} />
          ))}

          {isSending && (
            <div className="flex gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/15">
                <Bot className="h-3.5 w-3.5 text-secondary" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t bg-background p-3">
          {notConfigured ? (
            <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Configure an AI provider in Frappe Desk → Sumstack Settings to enable the chat.
            </div>
          ) : (
            <div className="flex gap-2">
              <Textarea
                placeholder="Ask about NSE stocks, your portfolio, or Kenyan investing… (Enter to send, Shift+Enter for new line)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                className="resize-none text-sm"
                disabled={isSending}
              />
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isSending}
                className="h-full shrink-0 self-end px-4"
              >
                {isSending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
          <p className="mt-1.5 text-center text-xs text-muted-foreground">
            Not regulated financial advice · Conversations are saved for your reference
          </p>
        </div>
      </Card>

      {/* Feature cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: TrendingUp, title: 'Portfolio Analysis', desc: 'Diversification, risks, and opportunities across your holdings.' },
          { icon: MessageCircle, title: 'Free-form Chat', desc: 'Ask anything about NSE stocks, MMFs, global markets, or investing basics.' },
          { icon: History, title: 'Conversation History', desc: 'Every Q&A is saved. Click History to revisit past analyses.' },
        ].map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="bg-muted/20">
            <CardContent className="flex flex-col gap-2 p-4">
              <Icon className="h-5 w-5 text-secondary" />
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
        <p>
          <strong>Disclaimer:</strong> Sumstack AI provides general educational information only and is not a
          registered investment adviser. Nothing here constitutes regulated financial advice. Always
          consult a qualified financial professional before making investment decisions.
        </p>
      </div>
    </div>
  )
}
