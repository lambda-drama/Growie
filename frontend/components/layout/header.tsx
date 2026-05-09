'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { useTheme } from 'next-themes'
import { Bell, Settings, TrendingUp, LogOut, User, Sun, Moon, Monitor, LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAppStore } from '@/lib/store'
import { syncDisplayCurrencyFromCode } from '@/lib/sync-display-currency'
import { DisplayCurrencyPicker } from '@/components/currency/display-currency-picker'
import { useAuth } from '@/hooks/use-auth'
import {
  getSupportUnreadCount,
  getMyIssues,
  markSupportInboxRead,
  type SupportIssue,
} from '@/services/support'
import { format } from 'date-fns'

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

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function Header() {
  const { currency, setAuthModal, setActiveTab } = useAppStore()
  const { isAuthenticated, user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifItems, setNotifItems] = useState<SupportIssue[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  const { data: unread = 0, mutate: mutateUnread } = useSWR(
    isAuthenticated ? 'support-unread-count' : null,
    getSupportUnreadCount,
    { refreshInterval: 45_000, revalidateOnFocus: true }
  )

  const handleLogout = async () => {
    await logout()
    setActiveTab('landing')
  }

  const openNotifications = async (open: boolean) => {
    setNotifOpen(open)
    if (open && isAuthenticated) {
      try {
        const list = await getMyIssues()
        setNotifItems(list.filter((i) => i.hasReply).slice(0, 8))
        await markSupportInboxRead()
        void mutateUnread(0, { revalidate: false })
      } catch {
        setNotifItems([])
      }
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <button
          onClick={() => setActiveTab(isAuthenticated ? 'portfolio' : 'landing')}
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <TrendingUp className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground">Sumstack</span>
          {isAuthenticated && user?.subscriptionTier && user.subscriptionTier !== 'free' && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
              {user.subscriptionTier === 'pro' ? 'PRO' : 'COACHED'}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <DisplayCurrencyPicker
                value={currency || 'USD'}
                onSelect={(code) => void syncDisplayCurrencyFromCode(code)}
              />

              <DropdownMenu open={notifOpen} onOpenChange={openNotifications}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications">
                    <Bell className="h-4 w-4" />
                    {unread > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-destructive-foreground">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Support updates</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifItems.length === 0 && (
                    <p className="px-2 py-3 text-sm text-muted-foreground">No new support replies.</p>
                  )}
                  {notifItems.map((i) => (
                    <DropdownMenuItem
                      key={i.name}
                      className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                      onSelect={() => {
                        setActiveTab('support')
                        setNotifOpen(false)
                      }}
                    >
                      <span className="w-full font-medium line-clamp-1">{i.subject}</span>
                      <span className="w-full text-xs text-muted-foreground line-clamp-2">
                      {i.resolutionDetails
                        ? stripHtml(i.resolutionDetails)
                        : i.replied
                          ? 'You have a reply on this ticket.'
                          : 'Updated'}
                      {i.modified
                        ? ` · ${format(new Date(i.modified), 'd MMM')}`
                        : ''}
                    </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setActiveTab('support')
                      setNotifOpen(false)
                    }}
                  >
                    <LifeBuoy className="mr-2 h-4 w-4" />
                    Open Help &amp; Support
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      {user?.image ? (
                        <AvatarImage src={user.image} alt="" className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                        {user ? getInitials(user.fullName) : 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{user?.fullName}</span>
                      <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setActiveTab('portfolio')}>
                    <User className="mr-2 h-4 w-4" />
                    My Portfolio
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('settings')}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  {mounted && (
                    <>
                      <DropdownMenuLabel className="pt-1 text-xs text-muted-foreground">Theme</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setTheme('light')}>
                        <Sun className="mr-2 h-4 w-4" />
                        Light
                        {theme === 'light' && <span className="ml-auto text-xs">✓</span>}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme('dark')}>
                        <Moon className="mr-2 h-4 w-4" />
                        Dark
                        {theme === 'dark' && <span className="ml-auto text-xs">✓</span>}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme('system')}>
                        <Monitor className="mr-2 h-4 w-4" />
                        System
                        {theme === 'system' && <span className="ml-auto text-xs">✓</span>}
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setAuthModal('login')}>
                Sign In
              </Button>
              <Button size="sm" onClick={() => setAuthModal('signup')}>
                Get Started
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
