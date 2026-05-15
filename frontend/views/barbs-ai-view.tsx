'use client'

import {
  Sparkles,
  Brain,
  MessageCircle,
  LineChart,
  Shield,
  Target,
  Globe2,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const FEATURES = [
  {
    icon: Brain,
    title: 'Portfolio analysis',
    description:
      'Barbs reviews your holdings and surfaces strengths, risks, opportunities, and a short watchlist — tailored to how you are actually invested.',
  },
  {
    icon: MessageCircle,
    title: 'Ask anything',
    description:
      'Chat in plain English about diversification, a single stock, MMFs, or what to do next. Answers use your live portfolio context when you are signed in.',
  },
  {
    icon: LineChart,
    title: 'Clear metrics',
    description:
      'See diversification, risk level, health score, and confidence at a glance so you know where you stand before you act.',
  },
  {
    icon: Shield,
    title: 'Actionable guidance',
    description:
      'Every analysis ends with concrete next steps — not vague advice. Recommendations you can discuss with your coach or act on yourself.',
  },
]

const STEPS = [
  {
    step: '1',
    title: 'Connect your stack',
    body: 'Add holdings in My Stack or Portfolio so Barbs sees your real positions, asset classes, and values.',
  },
  {
    step: '2',
    title: 'Run an analysis',
    body: 'Tap Analyse my portfolio. Barbs scans allocation, concentration, and performance, then saves your last report for next time.',
  },
  {
    step: '3',
    title: 'Explore and ask',
    body: 'Open insight cards, read recommendations, or open chat to dig deeper — e.g. “Should I reduce NSE exposure?”',
  },
]

const COVERAGE = [
  'Nairobi Securities Exchange (NSE) stocks and sectors',
  'Global equities (USD and other currencies)',
  'Kenyan money market funds (MMFs)',
  'Real estate and mixed portfolios',
  'KES-first reporting with diaspora-friendly context',
]

export function BarbsAIView() {
  const { isAuthenticated } = useAuth()
  const { setActiveTab, setAuthModal } = useAppStore()

  const openAnalysis = () => {
    if (!isAuthenticated) {
      setAuthModal('login')
      return
    }
    setActiveTab('analysis')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-10">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-primary px-6 py-10 text-primary-foreground shadow-md sm:px-10 sm:py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              Barbs AI
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Intelligent insights. Smarter decisions.
            </h1>
            <p className="mt-3 text-base text-primary-foreground/90 sm:text-lg">
              Barbs AI is Growie&apos;s built-in investment assistant. It reads your portfolio, explains what
              matters, and helps Kenyan and diaspora investors make sense of NSE, global stocks, MMFs, and more.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="gap-2 bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                onClick={openAnalysis}
              >
                {isAuthenticated ? 'Open Barbs AI' : 'Sign in to try Barbs AI'}
                <ArrowRight className="h-4 w-4" />
              </Button>
              {isAuthenticated && (
                <Button
                  size="lg"
                  variant="outline"
                  className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={() => setActiveTab('stack')}
                >
                  Manage My Stack
                </Button>
              )}
            </div>
          </div>
          <div className="hidden shrink-0 sm:flex sm:h-32 sm:w-32 items-center justify-center rounded-2xl bg-primary-foreground/10">
            <Brain className="h-16 w-16 text-primary-foreground/90" />
          </div>
        </div>
      </section>

      {/* What Barbs does */}
      <section>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">What Barbs AI does</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Barbs turns your holdings into a structured review you can trust — not generic market commentary.
          It is designed for clarity, not hype.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border-border/80 shadow-sm">
              <CardContent className="p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">How it works</h2>
        <ol className="mt-6 space-y-4">
          {STEPS.map(({ step, title, body }) => (
            <li
              key={step}
              className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  'bg-primary text-sm font-bold text-primary-foreground'
                )}
              >
                {step}
              </span>
              <div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Coverage */}
      <section className="rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
        <div className="flex items-center gap-2 text-primary">
          <Globe2 className="h-5 w-5" />
          <h2 className="text-lg font-bold text-foreground sm:text-xl">Built for your markets</h2>
        </div>
        <ul className="mt-4 space-y-2.5">
          {COVERAGE.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Inside an analysis */}
      <section>
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground sm:text-2xl">Inside every analysis</h2>
        </div>
        <p className="mt-2 text-muted-foreground">
          When you run Analyse my portfolio, Barbs AI typically delivers:
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            'Strengths — what is working in your allocation',
            'Risks — concentration, volatility, and gaps',
            'Opportunities — ideas aligned with your profile',
            'Watchlist — names or themes to monitor',
            'Recommendations — numbered, practical next steps',
            'Follow-up questions — prompts to use in chat',
          ].map((line) => (
            <p
              key={line}
              className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground"
            >
              {line}
            </p>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Your last analysis is saved so you can return without re-running unless you choose Analyse again.
        </p>
      </section>

      {/* CTA */}
      <section className="rounded-2xl border-2 border-primary/20 bg-primary/5 px-6 py-8 text-center sm:px-10">
        <Sparkles className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-3 text-xl font-bold text-foreground">Ready to see your portfolio through Barbs?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Open AI Analysis to run your first review or continue from your saved report.
        </p>
        <Button className="mt-5 gap-2" size="lg" onClick={openAnalysis}>
          {isAuthenticated ? 'Go to AI Analysis' : 'Sign in to get started'}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Barbs AI uses your portfolio data to generate insights. It does not replace licensed financial advice —
        use it to learn, reflect, and prepare better conversations with professionals.
      </p>
    </div>
  )
}
