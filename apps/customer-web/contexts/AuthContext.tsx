'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authApi, type LoginResponse } from '@/lib/api'
import { saveTokens, clearTokens, getAccessToken, getRefreshToken, saveUser, getUser, clearUser } from '@/lib/auth'

type User = LoginResponse['user']

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function bootstrap() {
      const accessToken = getAccessToken()
      const refreshToken = getRefreshToken()

      if (!accessToken && !refreshToken) {
        setIsLoading(false)
        return
      }

      if (refreshToken) {
        try {
          const result = await authApi.refresh(refreshToken)
          saveTokens(result.accessToken, result.refreshToken)
          // After successful refresh, restore user from storage
          const stored = getUser()
          if (stored) setUser(stored)
        } catch {
          // Refresh failed — clear everything
          clearTokens()
          clearUser()
        }
      } else if (accessToken) {
        // Have access token but no refresh token — restore user optimistically
        const stored = getUser()
        if (stored) setUser(stored)
      }

      setIsLoading(false)
    }

    void bootstrap()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    // Generate or retrieve stable device ID
    let deviceId = typeof window !== 'undefined' ? localStorage.getItem('deviceId') : null
    if (!deviceId) {
      deviceId = `web-${Date.now()}-${Math.random().toString(36).substring(7)}`
      if (typeof window !== 'undefined') localStorage.setItem('deviceId', deviceId)
    }

    const result = await authApi.login({
      email,
      password,
      deviceId,
      deviceType: 'web',
    })
    saveTokens(result.accessToken, result.refreshToken)
    saveUser(result.user)
    setUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch { /* ignore network error on logout */ }
    clearTokens()
    clearUser()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
