'use client'

import { SupportView } from '@/views/support-view'
import { SettingsLayout } from './settings-layout'

interface SupportSettingsPanelProps {
  onBack: () => void
}

export function SupportSettingsPanel({ onBack }: SupportSettingsPanelProps) {
  return (
    <SettingsLayout
      title="Support"
      description="Get help and contact support."
      onBack={onBack}
    >
      <SupportView embedded />
    </SettingsLayout>
  )
}
