'use client'

import { useEffect, useState } from 'react'
import { SettingsHub, type SettingsSectionId } from '@/components/settings/settings-hub'
import { AccountSettingsPanel } from '@/components/settings/account-settings-panel'
import { NotificationsSettingsPanel } from '@/components/settings/notifications-settings-panel'
import { SecuritySettingsPanel } from '@/components/settings/security-settings-panel'
import { PrivacySettingsPanel } from '@/components/settings/privacy-settings-panel'
import { AppearanceSettingsPanel } from '@/components/settings/appearance-settings-panel'
import { PricingSettingsPanel } from '@/components/settings/pricing-settings-panel'
import { SupportSettingsPanel } from '@/components/settings/support-settings-panel'

export function SettingsView() {
  const [section, setSection] = useState<SettingsSectionId | null>(null)

  useEffect(() => {
    const deep = sessionStorage.getItem('growe_settings_section') as SettingsSectionId | null
    if (
      deep &&
      ['account', 'pricing', 'notifications', 'security', 'privacy', 'appearance', 'support'].includes(deep)
    ) {
      sessionStorage.removeItem('growe_settings_section')
      setSection(deep)
    }
  }, [])

  if (section === 'account') {
    return <AccountSettingsPanel onBack={() => setSection(null)} />
  }
  if (section === 'pricing') {
    return <PricingSettingsPanel onBack={() => setSection(null)} />
  }
  if (section === 'notifications') {
    return <NotificationsSettingsPanel onBack={() => setSection(null)} />
  }
  if (section === 'security') {
    return <SecuritySettingsPanel onBack={() => setSection(null)} />
  }
  if (section === 'privacy') {
    return <PrivacySettingsPanel onBack={() => setSection(null)} />
  }
  if (section === 'appearance') {
    return <AppearanceSettingsPanel onBack={() => setSection(null)} />
  }
  if (section === 'support') {
    return <SupportSettingsPanel onBack={() => setSection(null)} />
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account, preferences, and privacy.</p>
      </div>
      <SettingsHub onSelect={setSection} />
    </div>
  )
}
