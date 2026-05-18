'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, User } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import growe from '@/services/auth'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DisplayCurrencyPicker } from '@/components/currency/display-currency-picker'
import { syncDisplayCurrencyFromCode } from '@/lib/sync-display-currency'
import type { IdTypeOption } from '@/services/auth'
import { SettingsLayout } from './settings-layout'

interface AccountSettingsPanelProps {
  onBack: () => void
}

export function AccountSettingsPanel({ onBack }: AccountSettingsPanelProps) {
  const { user, refreshProfile } = useAuth()
  const [idTypes, setIdTypes] = useState<IdTypeOption[]>([])
  const [fullName, setFullName] = useState('')
  const [idType, setIdType] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [preferredCurrency, setPreferredCurrency] = useState<string>('KES')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setFullName(user.fullName)
    setIdType(user.idType)
    setIdNumber(user.idNumber)
    setPreferredCurrency(user.preferredCurrency)
  }, [user])

  useEffect(() => {
    let ok = true
    growe
      .getIdTypes()
      .then((t) => {
        if (ok) setIdTypes(t)
      })
      .catch(() => {
        if (ok) setIdTypes([])
      })
    return () => {
      ok = false
    }
  }, [])

  const handleSaveProfile = async () => {
    setError(null)
    setProfileMsg(null)
    setSavingProfile(true)
    const r = await growe.updateAccountProfile({
      fullName: fullName.trim(),
      idType: idType.trim(),
      idNumber: idNumber.trim(),
      preferredCurrency,
    })
    setSavingProfile(false)
    if (!r.success) {
      setError(r.message)
      return
    }
    setProfileMsg('Profile saved.')
    await syncDisplayCurrencyFromCode(preferredCurrency)
    await refreshProfile()
  }

  if (!user) {
    return (
      <SettingsLayout title="Account settings" onBack={onBack}>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout
      title="Account settings"
      description="Manage your account details and preferences."
      onBack={onBack}
    >
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>Your name, ID, and display currency on Growie.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-fullname">Full name</Label>
            <Input
              id="settings-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label>ID / document type</Label>
            {idTypes.length > 0 ? (
              <Select value={idType} onValueChange={setIdType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {idTypes.map((t) => (
                    <SelectItem key={t.type_code} value={t.type_code}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={idType} onChange={(e) => setIdType(e.target.value)} placeholder="Document type" />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-id">ID / document number</Label>
            <Input
              id="settings-id"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label>Preferred currency</Label>
            <DisplayCurrencyPicker
              value={preferredCurrency || 'KES'}
              onSelect={(code) => setPreferredCurrency(code)}
              triggerClassName="w-full justify-between font-normal sm:h-10"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2 border-t sm:flex-row sm:items-center sm:justify-between">
          {profileMsg && <span className="text-sm text-primary">{profileMsg}</span>}
          <Button onClick={() => void handleSaveProfile()} disabled={savingProfile}>
            {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Save profile
          </Button>
        </CardFooter>
      </Card>
    </SettingsLayout>
  )
}
