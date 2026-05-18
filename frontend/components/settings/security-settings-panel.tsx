'use client'

import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import growe from '@/services/auth'
import { SettingsLayout } from './settings-layout'

interface SecuritySettingsPanelProps {
  onBack: () => void
}

export function SecuritySettingsPanel({ onBack }: SecuritySettingsPanelProps) {
  const [curPwd, setCurPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <SettingsLayout
      title="Security"
      description="Manage your password and security preferences."
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
            <KeyRound className="h-5 w-5" />
            Password
          </CardTitle>
          <CardDescription>Change the password for your Growie account.</CardDescription>
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
    </SettingsLayout>
  )
}
