'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { useAuth } from '@/hooks/use-auth'
import growe from '@/services/auth'
import { getDocumentTypes, type IdTypeOption } from '@/services/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TrendingUp, Eye, EyeOff, Upload, X, AlertCircle } from 'lucide-react'

export function AuthModal() {
  // Modal visibility is still driven by Zustand UI state
  const { authModal, setAuthModal, setActiveTab } = useAppStore()
  // Auth actions come from the context (healthcare pattern)
  const { login, signup, isLoading } = useAuth()

  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [idPhoto, setIdPhoto] = useState<File | null>(null)
  const [idPhotoPreview, setIdPhotoPreview] = useState<string | null>(null)
  const [idTypes, setIdTypes] = useState<IdTypeOption[]>([])
  const [idTypesError, setIdTypesError] = useState<string | null>(null)

  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [signupForm, setSignupForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    idType: 'national_id',
    idNumber: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Load ID types from the Growe ID Type doctype when signup modal opens
  useEffect(() => {
    if (authModal !== 'signup') return
    setIdTypes([])
    setIdTypesError(null)
    getDocumentTypes()
      .then((types) => {
        setIdTypes(types)
        if (types.length > 0) {
          setSignupForm((f) => ({ ...f, idType: types[0].type_code, idNumber: '' }))
        }
        if (types.length === 0) {
          setIdTypesError('No document types found. Please contact support.')
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load ID types'
        setIdTypesError(msg)
      })
  }, [authModal])

  const resetAll = () => {
    setLoginForm({ email: '', password: '' })
    setSignupForm({ fullName: '', email: '', password: '', confirmPassword: '', idType: 'national_id', idNumber: '' })
    setFieldErrors({})
    setServerError(null)
    setIdPhoto(null)
    setIdPhotoPreview(null)
  }

  const handleClose = () => {
    setAuthModal(null)
    resetAll()
  }

  const handleIdPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setIdPhoto(file)
      const reader = new FileReader()
      reader.onloadend = () => setIdPhotoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  const validateLogin = () => {
    const errs: Record<string, string> = {}
    if (!loginForm.email) errs.email = 'Email is required'
    if (!loginForm.password) errs.password = 'Password is required'
    setFieldErrors(errs)
    return !Object.keys(errs).length
  }

  /**
   * Password rules:
   *  - Minimum 8 characters
   *  - At least one uppercase letter (A–Z)
   *  - At least one lowercase letter (a–z)
   *  - At least one digit (0–9)
   *
   * Returns a human-readable error string, or null if valid.
   * Checks are ordered so the user gets the most actionable message first.
   */
  const validatePassword = (password: string): string | null => {
    if (!password) return 'Password is required'
    if (password.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter'
    if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter'
    if (!/[0-9]/.test(password)) return 'Password must include at least one number'
    return null
  }

  /**
   * Validates an ID number based on the selected ID type.
   *
   * Passport — ICAO Doc 9303 standard (used by Kenya and most countries):
   *   - 1–2 uppercase letters followed by 6–7 digits
   *   - Total length: 7–9 characters
   *   - Examples: A1234567, AB123456
   *
   * Kenyan National ID:
   *   - 7–8 numeric digits only, no letters or spaces
   *   - Examples: 12345678, 1234567
   */
  const validateIdNumber = (idType: string, idNumber: string): string | null => {
    const value = idNumber.trim()

    if (!value) {
      const idLabel = idTypes.find((t) => t.type_code === idType)?.label ?? 'ID'
      return `${idLabel} number is required`
    }

    if (idType === 'Passport') {
      // Accepts: A1234567 · AB1234567 · AB123456  (ICAO 9303, 7–9 chars)
      if (!/^[A-Z]{1,2}[0-9]{6,7}$/i.test(value)) {
        return 'Invalid passport number — expected 1–2 letters followed by 6–7 digits (e.g. A1234567 or AB123456)'
      }
    }

    if (idType === 'National ID') {
      // Kenyan National ID: strictly 7 or 8 digits
      if (!/^\d{7,8}$/.test(value)) {
        return 'Invalid National ID — must be 7 or 8 digits with no letters or spaces'
      }
    }

    return null
  }

  const validateSignup = () => {
    const errs: Record<string, string> = {}
    if (!signupForm.fullName) errs.fullName = 'Full name is required'
    if (!signupForm.email) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(signupForm.email)) errs.email = 'Invalid email format'

    const passwordErr = validatePassword(signupForm.password)
    if (passwordErr) errs.password = passwordErr

    if (signupForm.password !== signupForm.confirmPassword)
      errs.confirmPassword = 'Passwords do not match'

    const idErr = validateIdNumber(signupForm.idType, signupForm.idNumber)
    if (idErr) errs.idNumber = idErr

    setFieldErrors(errs)
    return !Object.keys(errs).length
  }

  // ── Submit handlers ─────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!validateLogin()) return

    const result = await login(loginForm.email, loginForm.password)
    if (result.success) {
      handleClose()
      setActiveTab('portfolio')
    } else {
      setServerError(result.message)
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!validateSignup()) return

    const result = await signup({
      fullName: signupForm.fullName,
      email: signupForm.email,
      password: signupForm.password,
      idType: signupForm.idType,
      idNumber: signupForm.idNumber,
      profileImage: idPhoto ?? undefined,
    })

    if (result.success) {
      handleClose()
      setActiveTab('portfolio')
    } else {
      setServerError(result.message)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={authModal !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">Sumstack</span>
          </div>
          <DialogTitle>
            {authModal === 'login' ? 'Welcome Back' : 'Create Your Account'}
          </DialogTitle>
          <DialogDescription>
            {authModal === 'login'
              ? 'Sign in to access your portfolio and insights.'
              : 'Join thousands of Kenyan investors growing their wealth.'}
          </DialogDescription>
        </DialogHeader>

        {serverError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {authModal === 'login' ? (
          /* ── Login ─────────────────────────────────────────────────────── */
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                className={fieldErrors.email ? 'border-destructive' : ''}
                disabled={isLoading}
              />
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className={fieldErrors.password ? 'border-destructive pr-10' : 'pr-10'}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in…' : 'Sign In'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => { resetAll(); setAuthModal('signup') }}
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </button>
            </p>
          </form>
        ) : (
          /* ── Signup ─────────────────────────────────────────────────────── */
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-2">

              {/* Full name */}
              <div className="space-y-2">
                <Label htmlFor="signup-name">Full Name</Label>
                <Input
                  id="signup-name"
                  placeholder="Enter your full name"
                  value={signupForm.fullName}
                  onChange={(e) => setSignupForm({ ...signupForm, fullName: e.target.value })}
                  className={fieldErrors.fullName ? 'border-destructive' : ''}
                  disabled={isLoading}
                />
                {fieldErrors.fullName && <p className="text-xs text-destructive">{fieldErrors.fullName}</p>}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={signupForm.email}
                  onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                  className={fieldErrors.email ? 'border-destructive' : ''}
                  disabled={isLoading}
                />
                {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
              </div>

              {/* Password + Confirm */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 8 chars, A–Z, a–z, 0–9"
                      value={signupForm.password}
                      onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                      className={fieldErrors.password ? 'border-destructive pr-10' : 'pr-10'}
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm Password</Label>
                  <Input
                    id="signup-confirm"
                    type="password"
                    placeholder="Repeat password"
                    value={signupForm.confirmPassword}
                    onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                    className={fieldErrors.confirmPassword ? 'border-destructive' : ''}
                    disabled={isLoading}
                  />
                  {fieldErrors.confirmPassword && (
                    <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                  )}
                </div>
              </div>

              {/* Identity Verification */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Identity Verification</p>

                {idTypesError && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{idTypesError}</AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="id-type">ID Type</Label>
                    <Select
                      value={signupForm.idType}
                      onValueChange={(v) => setSignupForm({ ...signupForm, idType: v, idNumber: '' })}
                      disabled={isLoading || idTypes.length === 0}
                    >
                      <SelectTrigger id="id-type">
                        <SelectValue placeholder={idTypes.length === 0 ? 'Loading…' : 'Select ID type'} />
                      </SelectTrigger>
                      <SelectContent>
                        {idTypes.map((t) => (
                          <SelectItem key={t.type_code} value={t.type_code}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="id-number">
                      {idTypes.find((t) => t.type_code === signupForm.idType)?.label ?? 'ID'} No.
                    </Label>
                    <Input
                      id="id-number"
                      placeholder={
                        signupForm.idType === 'Passport'
                          ? 'e.g. A1234567'
                          : signupForm.idType === 'National ID'
                          ? 'e.g. 12345678'
                          : 'Enter your ID number'
                      }
                      value={signupForm.idNumber}
                      onChange={(e) => setSignupForm({ ...signupForm, idNumber: e.target.value })}
                      className={fieldErrors.idNumber ? 'border-destructive' : ''}
                      disabled={isLoading}
                    />
                    {fieldErrors.idNumber && (
                      <p className="text-xs text-destructive">{fieldErrors.idNumber}</p>
                    )}
                  </div>
                </div>

                {/* ID Photo (optional) */}
                <div className="space-y-2 mt-4">
                  <Label>ID Photo <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  {idPhotoPreview ? (
                    <div className="relative inline-block">
                      <img
                        src={idPhotoPreview}
                        alt="ID Preview"
                        className="h-24 w-auto rounded-lg border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => { setIdPhoto(null); setIdPhotoPreview(null) }}
                        className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="mt-1 text-xs text-muted-foreground">Upload ID photo</span>
                      <input type="file" accept="image/*" onChange={handleIdPhotoChange} className="hidden" />
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground">Helps speed up account verification.</p>
                </div>
              </div>
            </div>

            {/* Footer — always visible */}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating account…' : 'Create Account'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { resetAll(); setAuthModal('login') }}
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </button>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}