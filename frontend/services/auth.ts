/**
 * GroweAuth — auth service class following the same pattern as healthcare app.
 *
 * Layout:
 *   auth.ts (this file)   → raw HTTP calls to Frappe
 *   providers/auth-provider.tsx → React context that wraps this service
 *   hooks/use-auth.ts     → useAuth() consumer hook
 */

// ─── Public response types ────────────────────────────────────────────────────

export interface SignupPayload {
  fullName: string
  email: string
  password: string
  idType: string
  idNumber: string
  /** Optional profile / ID photo; stored on Growe Member `image` after signup. */
  profileImage?: File | null
}

export interface GroweUser {
  email: string
  fullName: string
  idType: string
  idNumber: string
  subscriptionTier: 'free' | 'pro' | 'coached'
  preferredCurrency: string
  /** Frappe Attach Image URL, e.g. `/files/foo.jpg`; empty when none. */
  image?: string
}

export interface AuthResult {
  success: boolean
  message: string
  user?: GroweUser
}

export interface IdTypeOption {
  type_code: string
  label: string
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface FrappeProfileResponse {
  user: string
  full_name: string
  image?: string
  subscription_tier: string
  preferred_currency: string
  id_documents: Array<{ id_type: string; id_number: string }>
}

function normalizeSubscriptionTier(raw: string | undefined): GroweUser['subscriptionTier'] {
  if (!raw) return 'free'
  const t = String(raw).trim().toLowerCase()
  if (t === 'pro' || t === 'coached' || t === 'free') return t
  return 'free'
}

function mapProfile(member: FrappeProfileResponse): GroweUser {
  const firstId = member.id_documents?.[0]
  const img = (member.image || '').trim()
  return {
    email: member.user,
    fullName: member.full_name,
    idType: firstId?.id_type ?? '',
    idNumber: firstId?.id_number ?? '',
    subscriptionTier: normalizeSubscriptionTier(member.subscription_tier),
    preferredCurrency: member.preferred_currency ?? 'USD',
    ...(img ? { image: img } : {}),
  }
}

function extractFrappeError(body: Record<string, unknown>): string {
  if (body._server_messages) {
    try {
      const msgs = JSON.parse(body._server_messages as string) as Array<string | { message?: string }>
      const first = msgs[0]
      if (typeof first === 'string') {
        const parsed = JSON.parse(first) as { message?: string }
        return parsed.message ?? 'An error occurred'
      }
      if (typeof first === 'object' && first.message) return first.message
    } catch {
      // fall through
    }
  }
  if (body.exception) {
    const parts = String(body.exception).split(': ')
    return parts.slice(1).join(': ') || String(body.exception)
  }
  if (body.message && typeof body.message === 'string') return body.message
  return 'An unexpected error occurred'
}

// ─── GroweAuth class ──────────────────────────────────────────────────────────

class GroweAuth {
  // Relative URLs — Next.js dev proxy handles /api → Frappe; in production
  // Frappe serves directly. Same approach as healthcare app.
  private readonly base = ''

  /** Read CSRF token injected by the Jinja template, or fetch a fresh one. */
  private getCSRF(): string {
    if (typeof window === 'undefined') return ''
    return ((window as unknown as Record<string, unknown>).csrf_token as string) ?? ''
  }

  /** Multipart upload to Growe Member `image`; requires an authenticated session. */
  private async uploadMemberProfileImage(file: File): Promise<{ success: boolean; message: string }> {
    const csrf = this.getCSRF() || (await this.fetchCSRFToken()) || ''
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`${this.base}/api/method/growie_app.api.auth.upload_member_image`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
        },
        credentials: 'include',
        body: fd,
      })
      const body = (await res.json()) as Record<string, unknown>
      if (!res.ok || body.exc) {
        return { success: false, message: extractFrappeError(body) }
      }
      return { success: true, message: 'OK' }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Upload failed',
      }
    }
  }

  private headers(includeCSRF = true): HeadersInit {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (includeCSRF) {
      const csrf = this.getCSRF()
      if (csrf) h['X-Frappe-CSRF-Token'] = csrf
    }
    return h
  }

  // ── CSRF ────────────────────────────────────────────────────────────────────

  /** Fetch a fresh CSRF token from Frappe and store it in window.csrf_token. */
  async fetchCSRFToken(): Promise<string | null> {
    try {
      const res = await fetch(`${this.base}/api/method/frappe.sessions.get_csrf_token`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      })
      if (!res.ok) return null
      const data = await res.json() as { message?: string }
        if (data.message) {
          ;(window as unknown as Record<string, unknown>).csrf_token = data.message
          return data.message
        }
      return null
    } catch {
      return null
    }
  }

  // ── Login ───────────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<AuthResult> {
    try {
      // Frappe login uses form-data (not JSON)
      const body = new FormData()
      body.append('usr', email)
      body.append('pwd', password)

      let res = await fetch(`${this.base}/api/method/login`, {
        method: 'POST',
        body,
        credentials: 'include',
      })

      // Fallback endpoint (some Frappe versions)
      if (res.status === 404) {
        res = await fetch(`${this.base}/api/method/frappe.auth.login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ usr: email, pwd: password }),
          credentials: 'include',
        })
      }

      if (!res.ok) {
        const text = await res.text()
        let msg = `Login failed (${res.status})`
        try { msg = (JSON.parse(text) as { message?: string }).message ?? msg } catch { /**/ }
        return { success: false, message: msg }
      }

      const data = await res.json() as { message?: string }
      if (data.message !== 'Logged In' && typeof data.message !== 'object') {
        return { success: false, message: data.message ?? 'Login failed' }
      }

      // Refresh CSRF token after login
      await this.fetchCSRFToken()

      // Fetch Growe Member profile
      const user = await this.getProfile()
      if (!user) return { success: false, message: 'Login succeeded but profile could not be loaded.' }

      return { success: true, message: 'Logged in successfully', user }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Login failed' }
    }
  }

  // ── Signup ──────────────────────────────────────────────────────────────────

  async signup(payload: SignupPayload): Promise<AuthResult> {
    try {
      // Ensure we have a valid CSRF token before the signup POST.
      // The Jinja template provides one, but refresh just in case.
      const csrf = this.getCSRF() || (await this.fetchCSRFToken()) || ''

      const res = await fetch(`${this.base}/api/method/growie_app.api.auth.signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          full_name: payload.fullName,
          email: payload.email,
          password: payload.password,
          id_type: payload.idType,
          id_number: payload.idNumber,
          preferred_currency: 'USD',
        }),
      })

      const body = await res.json() as Record<string, unknown>

      if (!res.ok || body.exc) {
        return { success: false, message: extractFrappeError(body) }
      }

      // Backend auto-logs in after signup — refresh CSRF token
      await this.fetchCSRFToken()

      let photoUploadError: string | undefined
      if (payload.profileImage && payload.profileImage.size > 0) {
        const uploaded = await this.uploadMemberProfileImage(payload.profileImage)
        if (!uploaded.success) photoUploadError = uploaded.message
      }

      const profile = await this.getProfile()
      if (!profile) {
        return {
          success: false,
          message:
            photoUploadError
              ? `Account created, but loading your profile failed. Please sign in. (Photo upload: ${photoUploadError})`
              : 'Account created but your profile could not be loaded. Please sign in manually.',
        }
      }

      if (photoUploadError)
        console.warn('[growe signup] Profile image not saved:', photoUploadError)

      const okMessage = photoUploadError
        ? `Account created — your photo could not be saved (${photoUploadError}).`
        : 'Account created successfully'

      return { success: true, message: okMessage, user: profile }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Signup failed' }
    }
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  /** Fetch the Growe Member profile for the current session user. */
  async getProfile(): Promise<GroweUser | null> {
    try {
      const res = await fetch(`${this.base}/api/method/growie_app.api.auth.get_profile`, {
        method: 'GET',
        headers: this.headers(false),
        credentials: 'include',
      })
      if (!res.ok) return null
      const data = await res.json() as { message?: FrappeProfileResponse }
      if (!data.message) return null
      return mapProfile(data.message)
    } catch {
      return null
    }
  }

  /**
   * Persist subscription tier to Growe Member (must be logged in).
   * Server stores DocType options Free/Pro/Coached; API uses lowercase.
   */
  async updateSubscriptionTier(
    tier: GroweUser['subscriptionTier'],
  ): Promise<{ success: boolean; message: string }> {
    if (tier !== 'free' && tier !== 'pro' && tier !== 'coached') {
      return { success: false, message: 'Invalid subscription tier.' }
    }
    try {
      const csrf = this.getCSRF() || (await this.fetchCSRFToken()) || ''
      const res = await fetch(`${this.base}/api/method/growie_app.api.auth.update_profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ subscription_tier: tier }),
      })
      const body = await res.json() as Record<string, unknown>
      if (!res.ok || body.exc) {
        return { success: false, message: extractFrappeError(body) }
      }
      return { success: true, message: 'Subscription updated.' }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Could not update subscription.',
      }
    }
  }

  /** Update full name, ID row, and/or preferred currency. */
  async updateAccountProfile(updates: {
    fullName?: string
    idType?: string
    idNumber?: string
    preferredCurrency?: GroweUser['preferredCurrency']
  }): Promise<{ success: boolean; message: string; user?: GroweUser }> {
    try {
      const csrf = this.getCSRF() || (await this.fetchCSRFToken()) || ''
      const body: Record<string, string> = {}
      if (updates.fullName !== undefined) body.full_name = updates.fullName
      if (updates.idType !== undefined) body.id_type = updates.idType
      if (updates.idNumber !== undefined) body.id_number = updates.idNumber
      if (updates.preferredCurrency !== undefined) {
        body.preferred_currency = updates.preferredCurrency
      }
      const res = await fetch(`${this.base}/api/method/growie_app.api.auth.update_profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const resBody = (await res.json()) as Record<string, unknown>
      if (!res.ok || resBody.exc) {
        return { success: false, message: extractFrappeError(resBody) }
      }
      const fresh = await this.getProfile()
      if (fresh) return { success: true, message: 'Profile updated.', user: fresh }
      return { success: true, message: 'Profile updated.' }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Could not update profile.',
      }
    }
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const csrf = this.getCSRF() || (await this.fetchCSRFToken()) || ''
      const res = await fetch(`${this.base}/api/method/growie_app.api.auth.change_password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      const body = await res.json() as Record<string, unknown>
      if (!res.ok || body.exc) {
        return { success: false, message: extractFrappeError(body) }
      }
      return { success: true, message: 'Password updated.' }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Could not change password.',
      }
    }
  }

  // ── Session ─────────────────────────────────────────────────────────────────

  /** Returns the Frappe session username, or null for Guest / unauthenticated. */
  async getLoggedUser(): Promise<string | null> {
    try {
      const res = await fetch(`${this.base}/api/method/frappe.auth.get_logged_user`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      })
      if (!res.ok) return null
      const data = await res.json() as { message?: string }
      const username = data.message
      return username && username !== 'Guest' ? username : null
    } catch {
      return null
    }
  }

  /** Check whether a Frappe session exists and, if so, load the Growe profile. */
  async checkSession(): Promise<GroweUser | null> {
    const username = await this.getLoggedUser()
    if (!username) return null
    return this.getProfile()
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(): Promise<void> {
    try {
      const csrf = this.getCSRF()
      await fetch(`${this.base}/api/method/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
        },
        credentials: 'include',
      })
    } catch {
      // Ignore — local state will be cleared by the caller
    }
  }

  // ── ID Types ─────────────────────────────────────────────────────────────────

  /**
   * Fetch available document/ID types from the Growe ID Type doctype via
   * growie_app.api.common.get_documents_type — no hardcoded values.
   */
  async getIdTypes(): Promise<IdTypeOption[]> {
    const res = await fetch(`${this.base}/api/method/growie_app.api.common.get_documents_type`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })

    if (!res.ok) throw new Error(`Failed to load ID types: ${res.status}`)
    const data = await res.json() as { message?: IdTypeOption[] }
    if (!data.message || !data.message.length) {
      throw new Error('No ID types returned from server. Please run bench migrate.')
    }
    return data.message
  }
}

// Singleton — same pattern as healthcare's `healthcareAuth`
export const growe = new GroweAuth()
export default growe
