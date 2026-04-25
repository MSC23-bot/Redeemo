'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authApi, profileApi, type LoginResponse } from '@/lib/api'
import { saveTokens, clearTokens, getRefreshToken, saveUser, getUser, clearUser, saveSession, getSession, clearSession, getOrCreateDeviceId, patchStoredUser } from '@/lib/auth'

// Base = what the login/register response returns. We augment with verification
// state fetched from /profile so the app can render soft email/phone banners.
type User = LoginResponse['user'] & {
  phone?: string | null
  emailVerified?: boolean
  phoneVerified?: boolean
}

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (partial: Partial<User>) => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const hydrateFromProfile = useCallback(async () => {
    try {
      const me = await profileApi.get()
      setUser((prev) => ({
        id: me.id,
        name: me.name ?? prev?.name ?? '',
        email: me.email,
        profileImageUrl: me.profileImageUrl ?? null,
        phone: me.phone,
        emailVerified: me.emailVerified,
        phoneVerified: me.phoneVerified,
      }))
      // Mirror the core fields back into localStorage-stored user so a reload stays consistent.
      patchStoredUser({
        name: me.name ?? undefined,
        email: me.email,
        profileImageUrl: me.profileImageUrl ?? null,
      })
    } catch { /* non-fatal — user stays on the stored minimal shape */ }
  }, [])

  useEffect(() => {
    async function bootstrap() {
      const refreshToken = getRefreshToken()
      const session = getSession()
      const stored = getUser()

      if (!refreshToken && !stored) {
        setIsLoading(false)
        return
      }

      const normalise = (u: ReturnType<typeof getUser>): User | null =>
        u ? { ...u, profileImageUrl: u.profileImageUrl ?? null } : null

      if (refreshToken && session) {
        try {
          const result = await authApi.refresh(refreshToken, session.sessionId, session.entityId)
          saveTokens(result.accessToken, result.refreshToken)
          if (stored) setUser(normalise(stored))
          // Pull fresh profile (for emailVerified/phoneVerified + latest name/email)
          await hydrateFromProfile()
        } catch {
          // Refresh failed — restore from stored user optimistically (access token may still be valid)
          if (stored) {
            setUser(normalise(stored))
            await hydrateFromProfile()
          } else {
            clearTokens()
            clearUser()
            clearSession()
          }
        }
      } else if (stored) {
        // No refresh token / session — restore user optimistically from stored data
        setUser(normalise(stored))
        await hydrateFromProfile()
      }

      setIsLoading(false)
    }

    void bootstrap()
  }, [hydrateFromProfile])

  const login = useCallback(async (email: string, password: string) => {
    const deviceId = getOrCreateDeviceId()

    const result = await authApi.login({
      email,
      password,
      deviceId,
      deviceType: 'web',
      deviceName: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : undefined,
    })
    saveTokens(result.accessToken, result.refreshToken)
    saveUser(result.user)
    setUser(result.user)

    // Decode JWT payload to extract sessionId for future refresh calls
    try {
      const payload = JSON.parse(atob(result.accessToken.split('.')[1]))
      if (payload.sessionId) saveSession(result.user.id, payload.sessionId)
    } catch { /* non-critical */ }

    // Hydrate verification state + canonical fields from the server.
    await hydrateFromProfile()
  }, [hydrateFromProfile])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch { /* ignore network error on logout */ }
    clearTokens()
    clearUser()
    clearSession()
    setUser(null)
  }, [])

  const updateUser = useCallback((partial: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...partial } : prev)
    patchStoredUser(partial)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser, refreshProfile: hydrateFromProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
