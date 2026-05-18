'use client'

import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SettingsSectionId =
  | 'account'
  | 'pricing'
  | 'notifications'
  | 'security'
  | 'privacy'
  | 'appearance'
  | 'support'

const SECTIONS: {
  id: SettingsSectionId
  title: string
  description: string
}[] = [
  {
    id: 'account',
    title: 'Account settings',
    description: 'Manage your account details and preferences.',
  },
  {
    id: 'pricing',
    title: 'Pricing',
    description: 'View your plan and change or upgrade your subscription.',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Choose how and when you receive updates.',
  },
  {
    id: 'security',
    title: 'Security',
    description: 'Manage your password and security preferences.',
  },
  {
    id: 'privacy',
    title: 'Privacy',
    description: 'Manage your data and privacy preferences.',
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Customise the look and feel.',
  },
  {
    id: 'support',
    title: 'Support',
    description: 'Get help and contact support.',
  },
]

interface SettingsHubProps {
  onSelect: (id: SettingsSectionId) => void
}

export function SettingsHub({ onSelect }: SettingsHubProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <p className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Settings
      </p>
      <ul>
        {SECTIONS.map((section, index) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => onSelect(section.id)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50',
                index < SECTIONS.length - 1 && 'border-b border-border'
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold uppercase tracking-wide text-primary">
                  {section.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{section.description}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
