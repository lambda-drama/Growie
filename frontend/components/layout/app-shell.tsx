'use client'

import { Header } from './header'
import { Sidebar } from './sidebar'
import { BottomNav } from './bottom-nav'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Sidebar />
      <main className="pb-20 md:pl-64 md:pb-0">
        <div className="p-4 md:p-6">{children}</div>
      </main>
      <BottomNav />
    </div>
  )
}
