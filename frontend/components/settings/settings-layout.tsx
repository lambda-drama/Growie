'use client'

import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SettingsLayoutProps {
  title: string
  description?: string
  onBack: () => void
  children: React.ReactNode
}

export function SettingsLayout({ title, description, onBack, children }: SettingsLayoutProps) {
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" />
        Settings
      </Button>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  )
}
