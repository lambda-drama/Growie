'use client'

import { PricingView } from '@/views/pricing-view'
import { SettingsLayout } from './settings-layout'

interface PricingSettingsPanelProps {
  onBack: () => void
}

export function PricingSettingsPanel({ onBack }: PricingSettingsPanelProps) {
  return (
    <SettingsLayout
      title="Pricing"
      description="View your current plan and upgrade, downgrade, or switch anytime."
      onBack={onBack}
    >
      <PricingView embedded />
    </SettingsLayout>
  )
}
