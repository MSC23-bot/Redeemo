'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authApi, type LoginResponse } from '@/lib/api'
import { saveTokens, clearTokens, getRefreshToken, saveUser, getUser, clearUser, saveSession, getSession, clearSession, getOrCreateDeviceId, patchStoredUser } from '@/lib/auth'

type User = LoginResponse['user']

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (partial: Partial<User>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
        } catch {
          // Refresh failed — restore from stored user optimistically (access token may still be valid)
          if (stored) {
            setUser(normalise(stored))
          } else {
            clearTokens()
            clearUser()
            clearSession()
          }
        }
      } else if (stored) {
        // No refresh token / session — restore user optimistically from stored data
        setUser(normalise(stored))
      }

      setIsLoading(false)
    }

    void bootstrap()
  }, [])

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
  }, [])

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
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
