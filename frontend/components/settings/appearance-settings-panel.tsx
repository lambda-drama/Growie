'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Palette, Sun } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SettingsLayout } from './settings-layout'

interface AppearanceSettingsPanelProps {
  onBack: () => void
}

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
] as const

export function AppearanceSettingsPanel({ onBack }: AppearanceSettingsPanelProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <SettingsLayout
      title="Appearance"
      description="Customise the look and feel."
      onBack={onBack}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5" />
            Theme
          </CardTitle>
          <CardDescription>Choose light, dark, or match your device setting.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {THEMES.map(({ id, label, icon: Icon }) => {
              const active = mounted && theme === id
              return (
                <Button
                  key={id}
                  type="button"
                  variant="outline"
                  className={cn(
                    'h-auto flex-col gap-2 py-4',
                    active && 'border-2 border-primary bg-primary/5 text-primary'
                  )}
                  onClick={() => setTheme(id)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{label}</span>
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </SettingsLayout>
  )
}
