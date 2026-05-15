'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/providers/auth-provider'
import {
  TrendingUp,
  Shield,
  Brain,
  Globe,
  ChevronRight,
  Play,
  Star,
  Check,
  BarChart3,
  Wallet,
  Users,
  LogIn,
} from 'lucide-react'

const features = [
  {
    icon: Wallet,
    title: 'Multi-Asset Portfolio Tracking',
    description: 'Track MMFs, NSE stocks, global stocks, and real estate all in one place.',
  },
  {
    icon: Brain,
    title: 'AI-Powered Analysis',
    description: 'Get personalized insights and recommendations tailored to Kenyan markets.',
  },
  {
    icon: Globe,
    title: 'Diaspora-Ready',
    description: 'Multi-currency support for KES, USD, EUR, and GBP. Perfect for Kenyans abroad.',
  },
  {
    icon: Shield,
    title: 'Financial Health Score',
    description: 'Understand your financial wellness with our proprietary scoring system.',
  },
]

const stats = [
  { value: '10K+', label: 'Active Users' },
  { value: 'KSh 2.5B+', label: 'Assets Tracked' },
  { value: '4.8', label: 'App Rating' },
  { value: '50+', label: 'Weekly Insights' },
]

const testimonials = [
  {
    name: 'James M.',
    location: 'Nairobi, Kenya',
    text: 'Finally, a tool that understands the Kenyan investment landscape. The AI insights have helped me rebalance my portfolio effectively.',
    avatar: 'JM',
  },
  {
    name: 'Grace O.',
    location: 'London, UK',
    text: 'As a Kenyan in the diaspora, tracking my NSE and global investments was a nightmare. Sumstack changed everything.',
    avatar: 'GO',
  },
  {
    name: 'Peter K.',
    location: 'Toronto, Canada',
    text: 'The coached tier with Barbara has been transformational for my investment strategy.',
    avatar: 'PK',
  },
]

export function LandingView() {
  const { setAuthModal, setActiveTab } = useAppStore()
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-background">

      {/* Top Nav Bar */}
      <div className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <TrendingUp className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">Sumstack</span>
          </div>

          {!isAuthenticated && (
            <button
              onClick={() => setAuthModal('login')}
              className="group relative flex items-center gap-2 overflow-hidden rounded-full border border-primary/30 bg-primary/5 px-5 py-2 text-sm font-medium text-primary transition-all duration-300 hover:border-primary hover:bg-primary hover:text-primary-foreground"
            >
              <LogIn className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-12" />
              Sign In
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
            </button>
          )}
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="container mx-auto px-4 py-16 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 text-sm text-accent">
                <Star className="h-4 w-4 fill-accent" />
                <span>Trusted by 10,000+ Kenyan investors</span>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground lg:text-6xl text-balance">
                Grow Your Wealth with{' '}
                <span className="text-primary">AI-Powered</span> Insights
              </h1>
              <p className="text-lg text-muted-foreground lg:text-xl leading-relaxed max-w-lg">
                The only investment tracker built for Kenyans at home and in the diaspora.
                Track NSE, global stocks, MMFs, and real estate — all in one place.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Button
                  size="lg"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setAuthModal('signup')}
                >
                  Start Free Today
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setActiveTab('videos')}
                >
                  <Play className="mr-2 h-5 w-5" />
                  Watch Demo
                </Button>
              </div>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Free forever plan
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  No credit card required
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="relative rounded-2xl border bg-card p-4 shadow-2xl">
                <img
                  src="https://cdn.pixabay.com/photo/2021/08/01/15/44/laptop-6515014_1280.jpg"
                  alt="Sumstack Dashboard Preview"
                  className="rounded-lg w-full"
                />
                <div className="absolute -bottom-4 -left-4 rounded-xl border bg-card p-4 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Portfolio Growth</p>
                      <p className="font-semibold text-primary">+18.5% YTD</p>
                    </div>
                  </div>
                </div>
                <div className="absolute -right-4 -top-4 rounded-xl border bg-card p-4 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                      <Brain className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">AI Health Score</p>
                      <p className="font-semibold text-accent">72/100</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold text-primary lg:text-4xl">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
            Everything You Need to Invest Smarter
          </h2>
          <p className="mt-4 text-muted-foreground">
            Built specifically for the Kenyan market with global reach.
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="border-0 bg-muted/30 hover:bg-muted/50 transition-colors">
              <CardContent className="p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-16 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
              How Sumstack Works
            </h2>
            <p className="mt-4 text-muted-foreground">
              Get started in minutes, gain insights for life.
            </p>
          </div>
          <div className="mt-12 grid gap-8 lg:grid-cols-4">
            {[
              {
                step: '01',
                title: 'Create Your Account',
                description: 'Sign up with your ID for secure, verified access to all features.',
                icon: Users,
              },
              {
                step: '02',
                title: 'Add Your Investments',
                description: 'Manually log your MMFs, stocks, real estate, and global holdings.',
                icon: Wallet,
              },
              {
                step: '03',
                title: 'Get AI Insights',
                description: 'Receive personalized analysis, health scores, and weekly recommendations.',
                icon: BarChart3,
              },
              {
                step: '04',
                title: 'Personalized Coaching',
                description: 'Get tailored guidance based on your goals, risk appetite, and portfolio — like having a financial advisor in your pocket.',
                icon: Brain,
              },
            ].map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  {item.step}
                </div>
                <h3 className="mt-6 text-xl font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="container mx-auto px-4 py-16 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
            Loved by Investors Everywhere
          </h2>
          <p className="mt-4 text-muted-foreground">
            See what our community has to say about Sumstack.
          </p>
        </div>
        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name} className="border bg-card">
              <CardContent className="p-6">
                <div className="flex items-center gap-1 text-accent">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-accent" />
                  ))}
                </div>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  &ldquo;{testimonial.text}&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.location}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t bg-primary">
        <div className="container mx-auto px-4 py-16 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-primary-foreground lg:text-4xl">
              Ready to Take Control of Your Investments?
            </h2>
            <p className="mt-4 text-primary-foreground/80">
              Join thousands of Kenyan investors growing their wealth smarter.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => setAuthModal('signup')}
              >
                Get Started Free
                <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/60 text-black bg-white/10 hover:bg-white/20"
                onClick={() => setActiveTab('pricing')}
              >
                View Pricing
                <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-secondary">
        <div className="container mx-auto px-4 py-12">
          <div className="grid gap-8 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <TrendingUp className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold text-white">Sumstack</span>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                AI-powered investment tracking for Kenyans at home and abroad.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white">Product</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => setActiveTab('news')} className="hover:text-foreground">Insights</button></li>
                <li><button onClick={() => setActiveTab('markets')} className="hover:text-foreground">Markets</button></li>
                <li><button onClick={() => setActiveTab('videos')} className="hover:text-foreground">Videos</button></li>
                <li><button onClick={() => setActiveTab('pricing')} className="hover:text-foreground">Pricing</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white">Company</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">About Us</a></li>
                <li><a href="#" className="hover:text-foreground">Careers</a></li>
                <li><a href="#" className="hover:text-foreground">Contact</a></li>
                <li><a href="#" className="hover:text-foreground">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white">Legal</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-foreground">Terms of Service</a></li>
                <li><a href="#" className="hover:text-foreground">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} Sumstack. All rights reserved. Powered by BudgetnKE.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}