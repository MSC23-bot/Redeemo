'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessToken, setAccessToken, setOnSessionLost } from './tokenStore'
import { resetSessionState } from './sessionReset'
import { refreshSession } from '@/lib/api/client'
import { authApi, type SessionMerchant } from '@/lib/api/auth'

// M1 Slice 1: the client session. The access token lives in the module-scope
// tokenStore (mirrored into React state for render). On mount the app refreshes ONCE
// from the httpOnly cookie to re-mint the access token; signOut clears everything +
// bounces to /sign-in; apiFetch's hard-logout (refresh failed / SESSION_REVOKED)
// routes through the same teardown.
//
// Session cache-isolation CORE (T4): every session boundary - signOut, the
// hard-logout teardown (onSessionLost), and setSession on every login/verify path -
// routes through the SAME resetSessionState pipeline (lib/auth/sessionReset.ts)
// BEFORE any new token is applied or the user is navigated away, so a same-tab
// account switch can never paint the previous account's cached data. See design
// spec docs/superpowers/specs/2026-07-05-merchant-web-session-cache-isolation-design.md §4.3/§4.4.
export interface SessionValue {
  accessToken: string | null
  businessName: string | null
  approvalStatus: string | null
  /** false until the refresh-on-mount completes (prevents an auth flash). */
  ready: boolean
  isAuthenticated: boolean
  /**
   * Called by the auth screens after a successful login/verify. Async (Codex #2):
   * awaits the FULL session-reset pipeline before installing the new token/merchant,
   * so a same-tab login as a different merchant can never briefly serve the
   * previous account's cached data. Callers MUST await this before navigating.
   */
  setSession: (accessToken: string, merchant: SessionMerchant) => Promise<void>
  refresh: () => Promise<boolean>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [accessToken, setTok] = useState<string | null>(null)
  const [merchant, setMerchant] = useState<SessionMerchant | null>(null)
  const [ready, setReady] = useState(false)

  // Single-flight ref for the async hard-logout teardown (Codex #4). Defence in
  // depth only: tokenStore's own `sessionLostFired` latch already guarantees
  // triggerSessionLost's registered callback body runs at most once per dead
  // session, so a re-entry here reuses the SAME promise rather than starting a
  // second teardown. Cleared PROVIDER-SIDE inside applyToken when a truthy token is
  // applied (a new session is live) - never by the tokenStore module itself.
  const teardownInFlightRef = useRef<Promise<void> | null>(null)

  const applyToken = useCallback((t: string | null) => {
    setAccessToken(t)
    setTok(t)
    if (t) teardownInFlightRef.current = null
  }, [])

  const setSession = useCallback(
    async (t: string, m: SessionMerchant) => {
      // The new token can NEVER be installed before the cache+session reset
      // completes - this is a hard ordering guarantee (Codex #2). Any pre-login
      // hung request is epoch-dead and its retryer cancelled before the first
      // new-session query mounts.
      await resetSessionState(queryClient)
      applyToken(t)
      setMerchant(m)
    },
    [applyToken, queryClient],
  )

  const signOut = useCallback(async () => {
    // Capture the access token BEFORE the reset nulls it - it is still forwarded to
    // the best-effort backend revoke below (the token-null ordering does not skip
    // the revoke).
    const token = getAccessToken()
    await resetSessionState(queryClient)
    try {
      await authApi.logout(token)
    } catch {
      // best-effort
    }
    applyToken(null)
    setMerchant(null)
    router.replace('/sign-in')
  }, [applyToken, queryClient, router])

  const refresh = useCallback(async () => {
    const ok = await refreshSession()
    if (ok) setTok(getAccessToken())
    return ok
  }, [])

  // apiFetch hard-logout hook: async teardown ownership (Codex #4). A SINGLE
  // resetSessionState promise is started and stored in teardownInFlightRef; a
  // duplicate invocation reuses that same promise instead of starting a second
  // pipeline. Navigation happens ONLY after the teardown settles - on success via
  // `.then`, and on a (unexpected) teardown rejection via `.catch`, so a dead
  // session ALWAYS reaches /sign-in and no rejection is left floating/unhandled.
  useEffect(() => {
    setOnSessionLost(() => {
      if (!teardownInFlightRef.current) {
        teardownInFlightRef.current = resetSessionState(queryClient)
      }
      const finish = () => {
        applyToken(null)
        setMerchant(null)
        router.replace('/sign-in')
      }
      teardownInFlightRef.current.then(finish).catch(finish)
    })
    return () => setOnSessionLost(null)
  }, [applyToken, queryClient, router])

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
