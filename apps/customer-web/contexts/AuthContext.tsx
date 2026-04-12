'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authApi, type LoginResponse } from '@/lib/api'
import { saveTokens, clearTokens, getAccessToken } from '@/lib/auth'

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
    const token = getAccessToken()
    if (token) {
      const stored = localStorage.getItem('redeemo_user')
      if (stored) {
        try { setUser(JSON.parse(stored)) } catch { /* ignore */ }
      }
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    saveTokens(result.accessToken, result.refreshToken)
    localStorage.setItem('redeemo_user', JSON.stringify(result.user))
    setUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch { /* ignore network error on logout */ }
    clearTokens()
    localStorage.removeItem('redeemo_user')
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
