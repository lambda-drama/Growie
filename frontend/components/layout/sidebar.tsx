'use client'

import {
  Newspaper,
  TrendingUp,
  PlayCircle,
  Users,
  Wallet,
  LayoutDashboard,
  Layers,
  Brain,
  Star,
  HelpCircle,
  CreditCard,
  Lock,
  CalendarDays,
  Goal,
  FileText,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'

interface NavItem {
  id: string
  label: string
  icon: React.ElementType
  badge?: number
  requiresAuth?: boolean
}

// Public nav items (visible to all)
const publicNavItems: NavItem[] = [
  { id: 'news', label: 'Insights', icon: Newspaper },
  { id: 'markets', label: 'Markets', icon: TrendingUp },
  { id: 'pricing', label: 'Pricing', icon: CreditCard },
]

// Auth-required nav items
const authNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, requiresAuth: true },
  { id: 'stack', label: 'My Stack', icon: Layers, requiresAuth: true },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet, requiresAuth: true },
  { id: 'community', label: 'Community', icon: Users, badge: 5, requiresAuth: true },
  { id: 'analysis', label: 'AI Analysis', icon: Brain, requiresAuth: true },
  { id: 'goals', label: 'Goals', icon: Goal, requiresAuth: true },
  { id: 'reports', label: 'Reports', icon: FileText, requiresAuth: true },
  { id: 'videos', label: 'Videos', icon: PlayCircle, requiresAuth: true },
  { id: 'appointments', label: 'Live Coach', icon: CalendarDays, requiresAuth: true },
]

export function Sidebar() {
  const { activeTab, setActiveTab, setAuthModal } = useAppStore()
  const { isAuthenticated, user } = useAuth()
  const isFreeMember = (user?.subscriptionTier ?? 'free') === 'free'

  const handleNavClick = (item: NavItem) => {
    if (item.requiresAuth && !isAuthenticated) {
      setAuthModal('signup')
      return
    }
    setActiveTab(item.id)
  }

  // Combine items based on auth state - auth items first if logged in
  const navItems = isAuthenticated
    ? [...authNavItems, ...publicNavItems.filter((i) => i.id !== 'pricing')]
    : publicNavItems

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:pt-14 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Main Navigation */}
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            const isLocked = item.requiresAuth && !isAuthenticated
            
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isLocked && 'opacity-60'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
                {isLocked && (
                  <Lock className="ml-auto h-4 w-4" />
                )}
                {item.badge && !isLocked && (
                  <span className={cn(
                    'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold',
                    isActive 
                      ? 'bg-primary-foreground/20 text-primary-foreground' 
                      : 'bg-accent text-accent-foreground'
                  )}>
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Auth-required items for non-logged in users */}
        {!isAuthenticated && (
          <div className="border-t border-sidebar-border pt-4">
            <p className="px-3 text-xs font-medium text-sidebar-foreground/60 mb-2">Members Only</p>
            {authNavItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setAuthModal('signup')}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full"
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                  <Lock className="ml-auto h-4 w-4" />
                </button>
              )
            })}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Barbs AI promo */}
        {isAuthenticated && (
          <div className="rounded-lg border border-violet-500/30 bg-gradient-to-br from-violet-600/90 to-primary p-4 text-white shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <span className="font-semibold">Powered by Barbs AI</span>
            </div>
            <p className="mt-2 text-xs text-white/85">Intelligent insights. Smarter decisions.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full gap-1 bg-white text-primary hover:bg-white/90"
              onClick={() => setActiveTab('analysis')}
            >
              Learn more
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Upgrade Card (for free users who are logged in) */}
        {isAuthenticated && isFreeMember && (
          <div className="rounded-lg border border-accent bg-accent/10 p-4">
            <div className="flex items-center gap-2 text-accent">
              <Star className="h-5 w-5 fill-accent" />
              <span className="font-semibold">Upgrade to Pro</span>
            </div>
            <p className="mt-2 text-xs text-sidebar-foreground/60">
              Get unlimited AI analysis, full weekly insights, and more.
            </p>
            <Button 
              onClick={() => setActiveTab('pricing')}
              className="mt-3 w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              View Plans
            </Button>
          </div>
        )}

        {/* Sign Up CTA for non-logged in users */}
        {!isAuthenticated && (
          <div className="rounded-lg border border-primary bg-primary/10 p-4">
            <p className="font-semibold text-sidebar-foreground">Join Sumstack Today</p>
            <p className="mt-1 text-xs text-sidebar-foreground/60">
              Track your investments and get AI-powered insights.
            </p>
            <Button 
              onClick={() => setAuthModal('signup')}
              className="mt-3 w-full"
            >
              Sign Up Free
            </Button>
          </div>
        )}

        {/* Help */}
        <button
          type="button"
          onClick={() => (isAuthenticated ? setActiveTab('support') : setAuthModal('login'))}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <HelpCircle className="h-5 w-5" />
          <span>Help &amp; Support</span>
        </button>

        {/* Partner Logo */}
        <div className="border-t border-sidebar-border pt-4">
          <p className="text-xs text-sidebar-foreground/60">Data Partner</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-secondary" />
            <span className="text-sm font-medium text-secondary">Scope Markets</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
