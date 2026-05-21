'use client'

import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { loadUserPreferences, updateUserPreferences } from '@/lib/user-preferences'
import { SettingsLayout } from './settings-layout'

interface PrivacySettingsPanelProps {
  onBack: () => void
}

export function PrivacySettingsPanel({ onBack }: PrivacySettingsPanelProps) {
  const [showProfile, setShowProfile] = useState(true)
  const [analytics, setAnalytics] = useState(true)
  const [marketing, setMarketing] = useState(false)

  useEffect(() => {
    const prefs = loadUserPreferences()
    setShowProfile(prefs.privacy.showProfileInCommunity)
    setAnalytics(prefs.privacy.allowPortfolioAnalytics)
    setMarketing(prefs.privacy.allowMarketingEmails)
  }, [])

  const save = (patch: Partial<ReturnType<typeof loadUserPreferences>['privacy']>) => {
    updateUserPreferences({
      privacy: {
        showProfileInCommunity: showProfile,
        allowPortfolioAnalytics: analytics,
        allowMarketingEmails: marketing,
        ...patch,
      },
    })
  }

  return (
    <SettingsLayout
      title="Privacy"
      description="Manage your data and privacy preferences."
      onBack={onBack}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Data &amp; visibility
          </CardTitle>
          <CardDescription>Control what Sumstack can use and show about you.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
            <div>
              <Label className="text-base font-medium">Allow profile in community</Label>
              <p className="text-sm text-muted-foreground">
                Show your name and avatar when you post or comment in Community.
              </p>
            </div>
            <Switch
              checked={showProfile}
              onCheckedChange={(v) => {
                setShowProfile(v)
                save({ showProfileInCommunity: v })
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <Label className="text-base font-medium">Allow portfolio analytics</Label>
              <p className="text-sm text-muted-foreground">
                Let Barbs AI and reports use your holdings data to generate insights (never shared publicly).
              </p>
            </div>
            <Switch
              checked={analytics}
              onCheckedChange={(v) => {
                setAnalytics(v)
                save({ allowPortfolioAnalytics: v })
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4 py-4 last:pb-0">
            <div>
              <Label className="text-base font-medium">Allow marketing emails</Label>
              <p className="text-sm text-muted-foreground">
                Product updates, offers, and tips from the Sumstack team.
              </p>
            </div>
            <Switch
              checked={marketing}
              onCheckedChange={(v) => {
                setMarketing(v)
                save({ allowMarketingEmails: v })
              }}
            />
          </div>
        </CardContent>
      </Card>
    </SettingsLayout>
  )
}
