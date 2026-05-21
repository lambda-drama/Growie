'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { loadUserPreferences, updateUserPreferences } from '@/lib/user-preferences'
import { SettingsLayout } from './settings-layout'

interface NotificationsSettingsPanelProps {
  onBack: () => void
}

export function NotificationsSettingsPanel({ onBack }: NotificationsSettingsPanelProps) {
  const [news, setNews] = useState(true)
  const [community, setCommunity] = useState(true)

  useEffect(() => {
    const prefs = loadUserPreferences()
    setNews(prefs.notifications.news)
    setCommunity(prefs.notifications.community)
  }, [])

  const toggleNews = (checked: boolean) => {
    setNews(checked)
    updateUserPreferences({ notifications: { news: checked, community } })
  }

  const toggleCommunity = (checked: boolean) => {
    setCommunity(checked)
    updateUserPreferences({ notifications: { news, community: checked } })
  }

  return (
    <SettingsLayout
      title="Notifications"
      description="Choose how and when you receive updates."
      onBack={onBack}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5" />
            Alerts &amp; activity
          </CardTitle>
          <CardDescription>Control in-app notifications for insights and community.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
            <div>
              <Label htmlFor="notif-news" className="text-base font-medium">
                Enable news
              </Label>
              <p className="text-sm text-muted-foreground">
                Weekly insights, market stories, and curated analysis in your feed.
              </p>
            </div>
            <Switch id="notif-news" checked={news} onCheckedChange={toggleNews} />
          </div>
          <div className="flex items-center justify-between gap-4 py-4 last:pb-0">
            <div>
              <Label htmlFor="notif-community" className="text-base font-medium">
                Enable chats (community)
              </Label>
              <p className="text-sm text-muted-foreground">
                Replies, mentions, and activity from the Sumstack community.
              </p>
            </div>
            <Switch id="notif-community" checked={community} onCheckedChange={toggleCommunity} />
          </div>
        </CardContent>
      </Card>
    </SettingsLayout>
  )
}
