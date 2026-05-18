'use client'

import { useState } from 'react'
import { Check, Star, Zap, Crown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { useAuth } from '@/hooks/use-auth'
import growe from '@/services/auth'
import type { SubscriptionTier } from '@/types'

interface PricingTier {
  name: string
  price: number
  period: string
  description: string
  features: string[]
  highlighted?: boolean
  icon: React.ElementType
  tier: 'free' | 'pro' | 'coached'
}

const pricingTiers: PricingTier[] = [
  {
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'Get started with essential portfolio tracking',
    icon: Zap,
    tier: 'free',
    features: [
      'Track up to 10 holdings',
      'Basic portfolio overview',
      'Daily market indices',
      'Limited news feed',
      'Community access (read-only)',
      'Basic health score',
    ],
  },
  {
    name: 'Pro',
    price: 15,
    period: 'month',
    description: 'Unlock AI-powered insights and full analysis',
    icon: Star,
    tier: 'pro',
    highlighted: true,
    features: [
      'Unlimited holdings',
      'Full portfolio analytics',
      'AI-powered analysis',
      'Weekly stock picks',
      'Learning bites',
      'Community participation',
      'Advanced health score breakdown',
      'Multi-currency support',
      'Export reports (PDF/CSV)',
      'Email alerts & notifications',
    ],
  },
  {
    name: 'Coached',
    price: 85,
    period: 'month',
    description: 'Personal guidance from Barbara Nzovu',
    icon: Crown,
    tier: 'coached',
    features: [
      'Everything in Pro',
      'Book 1-on-1 coaching in the app (Sumstack Appointment)',
      '1-on-1 monthly coaching session',
      'Personalized investment plan',
      'Direct WhatsApp support',
      'Priority AI analysis queue',
      'Custom portfolio recommendations',
      'Quarterly portfolio review',
      'Exclusive webinar access',
      'Tax optimization guidance',
      'Estate planning basics',
    ],
  },
]

export function PricingView({ embedded = false }: { embedded?: boolean }) {
  const { setAuthModal } = useAppStore()
  const { isAuthenticated, user, refreshProfile } = useAuth()
  const [subscribing, setSubscribing] = useState(false)
  const [pendingPlanKey, setPendingPlanKey] = useState<string | null>(null)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successLabel, setSuccessLabel] = useState('')

  const currentTier: SubscriptionTier = user?.subscriptionTier ?? 'free'

  const handleChoosePlan = async (tier: PricingTier) => {
    setSubscribeError(null)

    if (tier.tier === 'free') {
      if (!isAuthenticated) {
        setAuthModal('signup')
        return
      }
      if (currentTier === 'free') return
      setSubscribing(true)
      setPendingPlanKey('free')
      try {
        const result = await growe.updateSubscriptionTier('free')
        if (!result.success) {
          setSubscribeError(result.message)
          return
        }
        await refreshProfile()
        setSuccessLabel('Free')
        setSuccessOpen(true)
      } finally {
        setSubscribing(false)
        setPendingPlanKey(null)
      }
      return
    }

    if (!isAuthenticated) {
      setAuthModal('login')
      return
    }

    if (currentTier === tier.tier) return

    setSubscribing(true)
    setPendingPlanKey(tier.tier)
    try {
      const result = await growe.updateSubscriptionTier(tier.tier)
      if (!result.success) {
        setSubscribeError(result.message)
        return
      }
      await refreshProfile()
      setSuccessLabel(tier.name)
      setSuccessOpen(true)
    } finally {
      setSubscribing(false)
      setPendingPlanKey(null)
    }
  }

  return (
    <div className={cn(embedded ? 'space-y-6' : 'space-y-8 pb-20 md:pb-8')}>
      {!embedded && (
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          Choose Your Investment Journey
        </h1>
        <p className="mt-3 text-lg text-muted-foreground text-pretty max-w-2xl mx-auto">
          From free tracking to personalized coaching, Sumstack has a plan that fits your investment goals.
        </p>
      </div>
      )}

      {embedded && isAuthenticated && (
        <p className="text-sm text-muted-foreground">
          You are on the{' '}
          <span className="font-semibold text-foreground capitalize">{currentTier}</span> plan. Pick a
          different tier below to change your subscription.
        </p>
      )}

      {subscribeError && (
        <p
          className={cn('text-sm text-destructive', !embedded && 'text-center max-w-lg mx-auto')}
          role="alert"
        >
          {subscribeError}
        </p>
      )}

      {/* Pricing Cards */}
      <div className={cn('grid gap-6 md:grid-cols-3', embedded ? '' : 'max-w-5xl mx-auto')}>
        {pricingTiers.map((tier) => {
          const Icon = tier.icon
          const isCurrentPlan = currentTier === tier.tier
          const isThisPlanLoading = Boolean(pendingPlanKey) && (
            (tier.tier === 'free' && pendingPlanKey === 'free') || pendingPlanKey === tier.tier
          )
          const anySubscribeInFlight = subscribing

          return (
            <Card
              key={tier.name}
              className={cn(
                'relative flex flex-col',
                tier.highlighted && 'border-accent shadow-lg shadow-accent/10'
              )}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-accent text-accent-foreground">
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader className="text-center pb-2">
                <div className={cn(
                  'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full',
                  tier.highlighted 
                    ? 'bg-accent/20 text-accent' 
                    : 'bg-primary/10 text-primary'
                )}>
                  <Icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                <CardDescription className="text-sm">
                  {tier.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="flex-1">
                {/* Price */}
                <div className="text-center mb-6">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">
                      ${tier.price}
                    </span>
                    {tier.price > 0 && (
                      <span className="text-muted-foreground">
                        /{tier.period}
                      </span>
                    )}
                  </div>
                  {tier.price === 0 && (
                    <span className="text-sm text-muted-foreground">
                      {tier.period}
                    </span>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className={cn(
                        'h-5 w-5 shrink-0 mt-0.5',
                        tier.highlighted ? 'text-accent' : 'text-primary'
                      )} />
                      <span className="text-sm text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              
              <CardFooter>
                {isCurrentPlan ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled
                  >
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    className={cn(
                      'w-full',
                      tier.highlighted 
                        ? 'bg-accent text-accent-foreground hover:bg-accent/90' 
                        : ''
                    )}
                    disabled={anySubscribeInFlight}
                    onClick={() => void handleChoosePlan(tier)}
                  >
                    {isThisPlanLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {tier.price === 0 ? 'Get Started' : 'Subscribe Now'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {!embedded && (
      <>
      {/* FAQ / Info Section */}
      <div className="max-w-3xl mx-auto mt-12">
        <h2 className="text-xl font-semibold text-center mb-6">
          Frequently Asked Questions
        </h2>
        
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <h3 className="font-medium mb-2">Can I cancel anytime?</h3>
            <p className="text-sm text-muted-foreground">
              Yes, you can cancel your subscription at any time. Your access continues until the end of your billing period.
            </p>
          </Card>
          
          <Card className="p-4">
            <h3 className="font-medium mb-2">What payment methods do you accept?</h3>
            <p className="text-sm text-muted-foreground">
              We accept all major credit cards, M-Pesa, and PayPal for your convenience.
            </p>
          </Card>
          
          <Card className="p-4">
            <h3 className="font-medium mb-2">Is my financial data secure?</h3>
            <p className="text-sm text-muted-foreground">
              Absolutely. We use bank-level encryption and never share your data with third parties.
            </p>
          </Card>
          
          <Card className="p-4">
            <h3 className="font-medium mb-2">Can I switch plans later?</h3>
            <p className="text-sm text-muted-foreground">
              Yes, you can upgrade or downgrade your plan at any time. Changes take effect on your next billing cycle.
            </p>
          </Card>
        </div>
      </div>

      {/* Trust Indicators */}
      <div className="text-center pt-8 border-t border-border">
        <p className="text-sm text-muted-foreground mb-4">
          Trusted by Kenyan investors at home and in the diaspora
        </p>
        <div className="flex items-center justify-center gap-8 text-muted-foreground">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">2,500+</div>
            <div className="text-xs">Active Users</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">$12M+</div>
            <div className="text-xs">Portfolios Tracked</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">4.8/5</div>
            <div className="text-xs">User Rating</div>
          </div>
        </div>
      </div>
      </>
      )}

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Welcome to {successLabel}</DialogTitle>
            <DialogDescription>
              Your plan is active. The membership badge in the header and navigation now reflect
              your subscription, and it will stay in sync when you return or refresh.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setSuccessOpen(false)}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
