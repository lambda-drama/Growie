const STORAGE_KEY = 'growe_user_preferences'

export interface UserPreferences {
  notifications: {
    news: boolean
    community: boolean
  }
  privacy: {
    showProfileInCommunity: boolean
    allowPortfolioAnalytics: boolean
    allowMarketingEmails: boolean
  }
}

const DEFAULTS: UserPreferences = {
  notifications: {
    news: true,
    community: true,
  },
  privacy: {
    showProfileInCommunity: true,
    allowPortfolioAnalytics: true,
    allowMarketingEmails: false,
  },
}

export function loadUserPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<UserPreferences>
    return {
      notifications: { ...DEFAULTS.notifications, ...parsed.notifications },
      privacy: { ...DEFAULTS.privacy, ...parsed.privacy },
    }
  } catch {
    return DEFAULTS
  }
}

export function saveUserPreferences(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function updateUserPreferences(patch: Partial<UserPreferences>): UserPreferences {
  const current = loadUserPreferences()
  const next: UserPreferences = {
    notifications: { ...current.notifications, ...patch.notifications },
    privacy: { ...current.privacy, ...patch.privacy },
  }
  saveUserPreferences(next)
  return next
}
