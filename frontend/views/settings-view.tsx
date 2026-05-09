'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, KeyRound, User } from 'lucide-react'
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

export function SettingsView() {
  const { user, refreshProfile } = useAuth()
  const [idTypes, setIdTypes] = useState<IdTypeOption[]>([])

  const [fullName, setFullName] = useState('')
  const [idType, setIdType] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [preferredCurrency, setPreferredCurrency] = useState<string>('KES')

  const [curPwd, setCurPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')

  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
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

  const handleChangePassword = async () => {
    setError(null)
    setPasswordMsg(null)
    if (newPwd !== confirmPwd) {
      setError('New password and confirmation do not match.')
      return
    }
    setSavingPassword(true)
    const r = await growe.changePassword(curPwd, newPwd)
    setSavingPassword(false)
    if (!r.success) {
      setError(r.message)
      return
    }
    setPasswordMsg('Password updated successfully.')
    setCurPwd('')
    setNewPwd('')
    setConfirmPwd('')
  }

  if (!user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Update your name, documents, and password.</p>
      </div>

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
          <CardDescription>Your public name, ID, and display currency on Sumstack.</CardDescription>
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
              <Input
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                placeholder="Document type"
              />
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5" />
            Password
          </CardTitle>
          <CardDescription>Change the password for your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cur-pw">Current password</Label>
            <Input
              id="cur-pw"
              type="password"
              value={curPwd}
              onChange={(e) => setCurPwd(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pw">New password</Label>
            <Input
              id="new-pw"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pw">Confirm new password</Label>
            <Input
              id="confirm-pw"
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2 border-t sm:flex-row sm:items-center sm:justify-between">
          {passwordMsg && <span className="text-sm text-primary">{passwordMsg}</span>}
          <Button
            onClick={() => void handleChangePassword()}
            disabled={savingPassword || !curPwd || !newPwd}
            variant="secondary"
          >
            {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update password
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
