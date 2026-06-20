'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken, setAccessToken, setOnSessionLost } from './tokenStore'
import { refreshSession } from '@/lib/api/client'
import { authApi, type SessionMerchant } from '@/lib/api/auth'

// M1 Slice 1: the client session. The access token lives in the module-scope
// tokenStore (mirrored into React state for render). On mount the app refreshes ONCE
// from the httpOnly cookie to re-mint the access token; signOut clears everything +
// bounces to /sign-in; apiFetch's hard-logout (refresh failed / SESSION_REVOKED)
// routes through the same teardown.
export interface SessionValue {
  accessToken: string | null
  businessName: string | null
  approvalStatus: string | null
  /** false until the refresh-on-mount completes (prevents an auth flash). */
  ready: boolean
  isAuthenticated: boolean
  /** Called by the auth screens after a successful login/verify. */
  setSession: (accessToken: string, merchant: SessionMerchant) => void
  refresh: () => Promise<boolean>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [accessToken, setTok] = useState<string | null>(null)
  const [merchant, setMerchant] = useState<SessionMerchant | null>(null)
  const [ready, setReady] = useState(false)

  const applyToken = useCallback((t: string | null) => {
    setAccessToken(t)
    setTok(t)
  }, [])

  const setSession = useCallback(
    (t: string, m: SessionMerchant) => {
      applyToken(t)
      setMerchant(m)
    },
    [applyToken],
  )

  const signOut = useCallback(async () => {
    try {
      await authApi.logout(getAccessToken())
    } catch {
      // best-effort
    }
    applyToken(null)
    setMerchant(null)
    router.replace('/sign-in')
  }, [applyToken, router])

  const refresh = useCallback(async () => {
    const ok = await refreshSession()
    if (ok) setTok(getAccessToken())
    return ok
  }, [])

  // apiFetch hard-logout hook: clear in-memory state + bounce to /sign-in WITHOUT a
  // backend call (the session is already dead). Never loops (apiFetch only fires it
  // after a failed refresh).
  useEffect(() => {
    setOnSessionLost(() => {
      applyToken(null)
      setMerchant(null)
      router.replace('/sign-in')
    })
    return () => setOnSessionLost(null)
  }, [applyToken, router])

  // Refresh-on-mount: hydrate the access token from the httpOnly cookie exactly once.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    let cancelled = false
    void (async () => {
      const ok = await refreshSession()
      if (cancelled) return
      if (ok) setTok(getAccessToken())
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const value: SessionValue = {
    accessToken,
    businessName: merchant?.businessName ?? null,
    approvalStatus: merchant?.approvalStatus ?? null,
    ready,
    isAuthenticated: !!accessToken,
    setSession,
    refresh,
    signOut,
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
