'use client'

import { LayoutDashboard, Layers, Newspaper, MoreHorizontal, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { useAuth } from '@/hooks/use-auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  authNavPrimary,
  authNavSecondary,
  publicNavItems,
  visibleNavItems,
  type NavItem,
} from '@/lib/nav-config'

const guestBottomItems: NavItem[] = visibleNavItems(
  publicNavItems.filter((i) => i.id === 'news' || i.id === 'pricing')
)

const authBottomItems: NavItem[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard, requiresAuth: true },
  { id: 'stack', label: 'Stack', icon: Layers, requiresAuth: true },
  { id: 'news', label: 'Insights', icon: Newspaper, requiresAuth: true },
]

const authMoreItems: NavItem[] = [
  ...authNavPrimary.filter((i) => !['dashboard', 'stack', 'news'].includes(i.id)),
  ...authNavSecondary,
]

export function BottomNav() {
  const { activeTab, setActiveTab, setAuthModal } = useAppStore()
  const { isAuthenticated } = useAuth()

  const navItems = isAuthenticated ? authBottomItems : guestBottomItems.filter((i) => i.id === 'news')
  const moreItems = isAuthenticated
    ? authMoreItems
    : guestBottomItems.filter((i) => i.id === 'pricing')

  const isMoreActive = moreItems.some((item) => item.id === activeTab)

  const handleNavClick = (item: NavItem) => {
    if (item.requiresAuth && !isAuthenticated) {
      setAuthModal('signup')
      return
    }
    setActiveTab(item.id)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item)}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive && 'fill-primary/20')} />
              <span className="font-medium">{item.label}</span>
            </button>
          )
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                isMoreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MoreHorizontal className={cn('h-5 w-5', isMoreActive && 'fill-primary/20')} />
              <span className="font-medium">More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="mb-2 w-48">
            {moreItems.map((item, index) => {
              const Icon = item.icon
              const isLocked = item.requiresAuth && !isAuthenticated
              const showSeparator =
                isAuthenticated && index === authNavPrimary.filter((i) => !['dashboard', 'stack', 'news'].includes(i.id)).length

              return (
                <div key={item.id}>
                  <DropdownMenuItem
                    onClick={() => handleNavClick(item)}
                    className={cn(
                      'gap-3',
                      activeTab === item.id && 'bg-primary/10 text-primary',
                      isLocked && 'opacity-60'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {isLocked && <Lock className="ml-auto h-3 w-3" />}
                  </DropdownMenuItem>
                  {showSeparator && <DropdownMenuSeparator />}
                </div>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  )
}
