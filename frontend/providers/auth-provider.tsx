'use client'

/**
 * AuthProvider — React context for Growe authentication.
 *
 * Follows the same structure as the healthcare app's AuthProvider.tsx:
 *   1. On mount, check if a Frappe session already exists and restore state.
 *   2. Expose login / signup / logout functions.
 *   3. Store the current user in both React state and localStorage for
 *      instant hydration on the next page load.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import growe, { type GroweUser, type SignupPayload } from '@/services/auth'
import { useAppStore } from '@/lib/store'
import { readStoredDisplayCurrency, syncDisplayCurrencyFromCode } from '@/lib/sync-display-currency'

// ─── Context types ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: GroweUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>
  signup: (payload: SignupPayload) => Promise<{ success: boolean; message: string }>
  /** Reload Growe Member from the server and refresh local state (and subscription tier in the UI store). */
  refreshProfile: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const STORAGE_KEY = 'growe_user'

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GroweUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Avoid SSR mismatch
  useEffect(() => { setMounted(true) }, [])

  // On mount: try to restore an existing session
  useEffect(() => {
    if (!mounted) return

    const restoreSession = async () => {
      // 1. Check for an existing Frappe server session first
      try {
        const serverUser = await growe.checkSession()
        if (serverUser) {
          setUser(serverUser)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(serverUser))
          setIsLoading(false)
          return
        }
      } catch {
        // No server session
      }

      // 2. Fallback: hydrate from localStorage while we validate in background
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as GroweUser
          setUser(parsed)

          // Validate in background — clear if expired
          growe.checkSession().then((fresh) => {
            if (!fresh) {
              setUser(null)
              localStorage.removeItem(STORAGE_KEY)
            } else {
              setUser(fresh)
              localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
            }
          }).catch(() => {
            setUser(null)
            localStorage.removeItem(STORAGE_KEY)
          })
        } catch {
          localStorage.removeItem(STORAGE_KEY)
        }
      }

      setIsLoading(false)
    }

    restoreSession()
  }, [mounted])

  // Keep global subscription tier in sync with the server-backed profile
  useEffect(() => {
    if (user) {
      useAppStore.getState().setSubscriptionTier(user.subscriptionTier)
    } else {
      useAppStore.getState().setSubscriptionTier('free')
    }
  }, [user])

  // Display currency: prefer last header choice (localStorage), then profile preferred currency
  useEffect(() => {
    if (!mounted) return

    const saved = readStoredDisplayCurrency()

    if (!user) {
      if (saved) {
        void syncDisplayCurrencyFromCode(saved)
      } else {
        useAppStore.getState().setCurrency('USD')
        useAppStore.getState().setKesToDisplayMultiplier(1)
      }
      return
    }

    const code = saved ?? user.preferredCurrency ?? 'USD'
    void syncDisplayCurrencyFromCode(code)
  }, [mounted, user])

  // ── Auth actions ─────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    try {
      const result = await growe.login(email, password)
      if (result.success && result.user) {
        setUser(result.user)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.user))
      }
      return { success: result.success, message: result.message }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      return { success: false, message: msg }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signup = useCallback(async (payload: SignupPayload) => {
    setIsLoading(true)
    try {
      const result = await growe.signup(payload)
      if (result.success && result.user) {
        setUser(result.user)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.user))
      }
      return { success: result.success, message: result.message }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Signup failed'
      return { success: false, message: msg }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    const fresh = await growe.getProfile()
    if (fresh) {
      setUser(fresh)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
    } else {
      setUser(null)
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const logout = useCallback(async () => {
    // Clear local state immediately
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
    // Then destroy the server session
    await growe.logout()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        refreshProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
