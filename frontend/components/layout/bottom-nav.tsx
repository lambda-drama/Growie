'use client'

import {
  Newspaper,
  TrendingUp,
  Wallet,
  LayoutDashboard,
  Layers,
  Brain,
  MoreHorizontal,
  PlayCircle,
  Users,
  CreditCard,
  Lock,
  CalendarDays,
  Goal,
  FileText,
} from 'lucide-react'
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

interface NavItem {
  id: string
  label: string
  icon: React.ElementType
  requiresAuth?: boolean
}

// Public nav items for bottom bar
const publicNavItems: NavItem[] = [
  { id: 'news', label: 'Insights', icon: Newspaper },
  { id: 'markets', label: 'Markets', icon: TrendingUp },
]

// Auth nav items for bottom bar
const authNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard, requiresAuth: true },
  { id: 'analysis', label: 'Analysis', icon: Brain, requiresAuth: true },
]

// More menu items
const publicMoreItems: NavItem[] = [
  { id: 'pricing', label: 'Pricing', icon: CreditCard },
]

const authMoreItems: NavItem[] = [
  { id: 'stack', label: 'My Stack', icon: Layers, requiresAuth: true },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet, requiresAuth: true },
  { id: 'goals', label: 'Goals', icon: Goal, requiresAuth: true },
  { id: 'reports', label: 'Reports', icon: FileText, requiresAuth: true },
  { id: 'community', label: 'Community', icon: Users, requiresAuth: true },
  { id: 'videos', label: 'Videos', icon: PlayCircle, requiresAuth: true },
  { id: 'appointments', label: 'Coach', icon: CalendarDays, requiresAuth: true },
]

export function BottomNav() {
  const { activeTab, setActiveTab, setAuthModal } = useAppStore()
  const { isAuthenticated } = useAuth()

  // Combine nav items based on auth
  const navItems = isAuthenticated
    ? [authNavItems[0], authNavItems[1], ...publicNavItems]
    : publicNavItems

  const moreItems = isAuthenticated
    ? [...publicMoreItems.filter(i => i.id !== 'pricing'), ...authMoreItems]
    : [...publicMoreItems, ...authMoreItems]

  const isMoreActive = moreItems.some(item => item.id === activeTab)

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
              onClick={() => handleNavClick(item)}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive && 'fill-primary/20')} />
              <span className="font-medium">{item.label}</span>
            </button>
          )
        })}
        
        {/* More Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                isMoreActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MoreHorizontal className={cn('h-5 w-5', isMoreActive && 'fill-primary/20')} />
              <span className="font-medium">More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 mb-2">
            {moreItems.map((item, index) => {
              const Icon = item.icon
              const isLocked = item.requiresAuth && !isAuthenticated
              const showSeparator = !isAuthenticated && index === publicMoreItems.length - 1

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
