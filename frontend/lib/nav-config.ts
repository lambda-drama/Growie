import type { LucideIcon } from 'lucide-react'
import {
  Newspaper,
  TrendingUp,
  PlayCircle,
  Users,
  Wallet,
  LayoutDashboard,
  Layers,
  Brain,
  CreditCard,
  CalendarDays,
  Goal,
  FileText,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  badge?: number
  requiresAuth?: boolean
  /** Hidden from nav UI; routes still work via hash */
  hidden?: boolean
}

export const publicNavItems: NavItem[] = [
  { id: 'news', label: 'Market insights', icon: Newspaper },
  { id: 'markets', label: 'Markets', icon: TrendingUp, hidden: true },
  { id: 'pricing', label: 'Pricing', icon: CreditCard },
]

/** Main sidebar (authenticated): Dashboard → My Stack → Market insights → Goals → Reports */
export const authNavPrimary: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, requiresAuth: true },
  { id: 'stack', label: 'My Stack', icon: Layers, requiresAuth: true },
  { id: 'news', label: 'Market insights', icon: Newspaper, requiresAuth: true },
  { id: 'goals', label: 'Goals', icon: Goal, requiresAuth: true },
  { id: 'reports', label: 'Reports', icon: FileText, requiresAuth: true },
]

/** Below divider in sidebar */
export const authNavSecondary: NavItem[] = [
  { id: 'community', label: 'Community', icon: Users, badge: 5, requiresAuth: true },
  { id: 'appointments', label: 'Live Coach', icon: CalendarDays, requiresAuth: true },
]

/** Still routable; not shown in sidebar */
export const authNavHidden: NavItem[] = [
  { id: 'portfolio', label: 'Portfolio', icon: Wallet, requiresAuth: true, hidden: true },
  { id: 'analysis', label: 'AI Analysis', icon: Brain, requiresAuth: true, hidden: true },
  { id: 'videos', label: 'Videos', icon: PlayCircle, requiresAuth: true, hidden: true },
]

export const authNavItems: NavItem[] = [
  ...authNavPrimary,
  ...authNavSecondary,
  ...authNavHidden,
]

export function visibleNavItems(items: NavItem[]): NavItem[] {
  return items.filter((i) => !i.hidden)
}
