'use client'

import {
  Star,
  HelpCircle,
  Lock,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import {
  authNavPrimary,
  authNavSecondary,
  publicNavItems,
  visibleNavItems,
  type NavItem,
} from '@/lib/nav-config'

function NavButton({
  item,
  isActive,
  isLocked,
  onClick,
}: {
  item: NavItem
  isActive: boolean
  isLocked: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isLocked && 'opacity-60'
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="truncate">{item.label}</span>
      {isLocked && <Lock className="ml-auto h-4 w-4 shrink-0" />}
      {item.badge && !isLocked && (
        <span
          className={cn(
            'ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-xs font-bold',
            isActive
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-accent text-accent-foreground'
          )}
        >
          {item.badge}
        </span>
      )}
    </button>
  )
}

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

  const visiblePublic = visibleNavItems(publicNavItems)
  const membersOnlyItems = [...authNavPrimary, ...authNavSecondary]

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:pt-14 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-1 flex-col gap-4 p-4">
        <nav className="flex flex-col gap-1">
          {isAuthenticated ? (
            <>
              {authNavPrimary.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={activeTab === item.id}
                  isLocked={false}
                  onClick={() => handleNavClick(item)}
                />
              ))}

              <hr className="my-2 border-sidebar-border" aria-hidden />

              {authNavSecondary.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={activeTab === item.id}
                  isLocked={false}
                  onClick={() => handleNavClick(item)}
                />
              ))}
            </>
          ) : (
            visiblePublic.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                isActive={activeTab === item.id}
                isLocked={false}
                onClick={() => handleNavClick(item)}
              />
            ))
          )}
        </nav>

        {!isAuthenticated && (
          <div className="border-t border-sidebar-border pt-4">
            <p className="mb-2 px-3 text-xs font-medium text-sidebar-foreground/60">Members only</p>
            <div className="flex flex-col gap-1">
              {membersOnlyItems.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={false}
                  isLocked
                  onClick={() => setAuthModal('signup')}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex-1" />

        {isAuthenticated && (
          <div className="rounded-lg border border-primary/20 bg-primary p-4 text-primary-foreground shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <span className="font-semibold">Powered by Barbs AI</span>
            </div>
            <p className="mt-2 text-xs text-primary-foreground/85">Intelligent insights. Smarter decisions.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full gap-1 bg-white text-primary hover:bg-white/90"
              onClick={() => setActiveTab('barbs-ai')}
            >
              Learn more
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

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

        {!isAuthenticated && (
          <div className="rounded-lg border border-primary bg-primary/10 p-4">
            <p className="font-semibold text-sidebar-foreground">Join Sumstack Today</p>
            <p className="mt-1 text-xs text-sidebar-foreground/60">
              Track your investments and get AI-powered insights.
            </p>
            <Button onClick={() => setAuthModal('signup')} className="mt-3 w-full">
              Sign Up Free
            </Button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            if (isAuthenticated) {
              sessionStorage.setItem('growe_settings_section', 'support')
              setActiveTab('settings')
            } else {
              setAuthModal('login')
            }
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <HelpCircle className="h-5 w-5" />
          <span>Help &amp; Support</span>
        </button>

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
