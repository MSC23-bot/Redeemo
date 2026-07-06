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

// Bounded wait for the BFF logout response (logout-durability design §4.5
// point 2-3). Must sit ABOVE the BFF route's own internal backend-revoke
// timeout (3000ms in app/api/merchant-auth/logout/route.ts) so this await
// still returns having received the BFF's cookie-clearing response in the
// common case, while remaining bounded so signOut can never hang.
const SIGN_OUT_TIMEOUT_MS = 5000

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

  // Confirmed-cookie-clearance signOut contract (logout-durability design
  // §4.5). NOTE: this branch is built off current `main`, which does NOT yet
  // carry the client-side session-epoch + React-Query cache-isolation core
  // (`resetSessionState`, design §4.3 — that lands via a separate PR built off
  // a different branch). The two compose on merge: once that core lands,
  // step 1 below should become `await resetSessionState(queryClient)`. For
  // now this clears the two pieces of client state this module owns
  // (in-memory access token + React `merchant` state) — the ordering and
  // network contract below (steps 0/2/3/5) are the full §4.5 contract.
  const signOut = useCallback(async () => {
    // 0. Capture the access token BEFORE resetting any state. This captured
    //    value is the authoritative revoke proof (the backend verifies its
    //    SIGNED claims); capturing it first decouples the revoke from the
    //    client-side token-null on the next line.
    const token = getAccessToken()

    // 1. Clear client state immediately, independent of any network call.
    applyToken(null)
    setMerchant(null)

    // 2-3. Invoke the BFF logout under a STRICT bounded timeout and AWAIT the
    //    response BEFORE navigating. A resolved 2xx is the evidence the
    //    clearing Set-Cookie was received (the httpOnly cookie is otherwise
    //    unreachable from page JS) — navigating without awaiting this would
    //    let the router abort a non-keepalive request before that response
    //    lands, leaving cookie clearance unconfirmed (the rejected "fire-and-
    //    forget" ordering).
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SIGN_OUT_TIMEOUT_MS)
    try {
      const result = await authApi.logout(token, controller.signal)
      // 5. Honest degraded behaviour: a non-2xx / aborted / unreachable
      //    result means cookie clearance is UNCONFIRMED — the httpOnly
      //    cookie may still be live on this browser, so a subsequent
      //    refresh-on-mount could re-hydrate the session. Navigation still
      //    proceeds (the user must never be trapped), but this is surfaced
      //    rather than silently treated as a clean logout.
      if (!result.ok) {
        console.warn('[signOut] cookie clearance unconfirmed', { status: result.status, remoteRevoke: result.remoteRevoke })
      }
    } finally {
      clearTimeout(timer)
    }

    // 4. Then navigate.
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
