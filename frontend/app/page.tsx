'use client'

import { useEffect } from 'react'
import { AppShell } from '@/components/layout'
import {
  DashboardView,
  PortfolioView,
  NewsView,
  MarketsView,
  VideosView,
  CommunityView,
  AnalysisView,
  BarbsAIView,
  PricingView,
  LandingView,
  SettingsView,
  SupportView,
  AppointmentsView,
  GoalsView,
  MyStackView,
  ReportsView,
} from '@/views'
import { AuthModal } from '@/components/auth'
import { useAppStore } from '@/lib/store'
import { useAuth } from '@/hooks/use-auth'

const ALL_TABS = [
  'dashboard',
  'stack',
  'portfolio',
  'news',
  'markets',
  'videos',
  'community',
  'analysis',
  'barbs-ai',
  'appointments',
  'goals',
  'reports',
  'pricing',
  'settings',
  'support',
  'landing',
]
const publicTabs = ['news', 'markets', 'pricing', 'barbs-ai']
const authRequiredTabs = ['dashboard', 'stack', 'portfolio', 'goals', 'reports', 'community', 'settings', 'support', 'analysis', 'videos', 'appointments']

function hashTab(): string {
  if (typeof window === 'undefined') return ''
  const raw = window.location.hash.replace('#', '').trim()
  /** Support `#news?insight=GI-….` deep links — tab name is always before `?`. */
  const path = raw.split('?')[0].trim().toLowerCase()
  /** Portfolio nav is hidden; map leftover `#portfolio` history/bookmarks to My Stack. */
  if (path === 'portfolio') return 'stack'
  return ALL_TABS.includes(path) ? path : ''
}

export default function HomePage() {
  const { activeTab, setAuthModal, setActiveTab } = useAppStore()
  const { isAuthenticated, isLoading } = useAuth()

  // On mount: restore tab from URL hash
  useEffect(() => {
    const tab = hashTab()
    if (tab) setActiveTab(tab)

    const onHash = () => {
      const t = hashTab()
      if (t) setActiveTab(t)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect unauthenticated users away from protected tabs (wait for auth to load)
  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated && authRequiredTabs.includes(activeTab)) {
      setActiveTab('news')
      setAuthModal('login')
    }
  }, [activeTab, isAuthenticated, isLoading, setActiveTab, setAuthModal])

  const renderView = () => {
    switch (activeTab) {
      case 'news':      return <NewsView />
      case 'markets':   return <MarketsView />
      case 'videos':    return <VideosView />
      case 'community': return isAuthenticated ? <CommunityView /> : <NewsView />
      case 'dashboard': return isAuthenticated ? <DashboardView /> : <NewsView />
      case 'stack':     return isAuthenticated ? <MyStackView /> : <NewsView />
      case 'portfolio': return isAuthenticated ? <PortfolioView /> : <NewsView />
      case 'goals':     return isAuthenticated ? <GoalsView /> : <NewsView />
      case 'reports':   return isAuthenticated ? <ReportsView /> : <NewsView />
      case 'analysis':  return <AnalysisView />
      case 'barbs-ai':  return <BarbsAIView />
      case 'pricing':   return <PricingView />
      case 'settings':  return isAuthenticated ? <SettingsView /> : <NewsView />
      case 'support':       return isAuthenticated ? <SupportView /> : <NewsView />
      case 'appointments': return isAuthenticated ? <AppointmentsView /> : <NewsView />
      default:              return isAuthenticated ? <DashboardView /> : <NewsView />
    }
  }

  if (!isAuthenticated && !publicTabs.includes(activeTab)) {
    return (
      <>
        <LandingView />
        <AuthModal />
      </>
    )
  }

  return (
    <>
      <AppShell>{renderView()}</AppShell>
      <AuthModal />
    </>
  )
}
