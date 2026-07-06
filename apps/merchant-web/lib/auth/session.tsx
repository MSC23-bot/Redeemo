'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessToken, setAccessToken, setOnSessionLost } from './tokenStore'
import { resetSessionState } from './sessionReset'
import { getSessionEpoch } from './sessionEpoch'
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

// Bounded wait for the BFF logout response (logout-durability design §4.5
// point 2-3). Must sit ABOVE the BFF route's own internal backend-revoke
// timeout (3000ms in app/api/merchant-auth/logout/route.ts) so this await
// still returns having received the BFF's cookie-clearing response in the
// common case, while remaining bounded so signOut can never hang.
const SIGN_OUT_TIMEOUT_MS = 5000

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
  const teardownInFlightRef = useRef<Promise<number> | null>(null)

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
      //
      // FAIL CLOSED (correction 6): resetSessionState is deliberately NOT wrapped in
      // try/catch here. If a safe reset cannot complete (a clear() failure - the only
      // path that still throws after correction 5 swallows cancelQueries rejections),
      // the throw propagates and the new token/session is NEVER installed.
      const generation = await resetSessionState(queryClient)
      // OWNERSHIP GUARD (correction 8): if a NEWER transition bumped the epoch while
      // this reset was in flight (e.g. a second, later login), skip the commit so an
      // older async completion cannot clobber the newer session.
      if (getSessionEpoch() !== generation) return
      applyToken(t)
      setMerchant(m)
    },
    [applyToken, queryClient],
  )

  // COMPOSED signOut (PR #389 cache-isolation core + PR #390 confirmed-cookie-
  // clearance / logout-durability). Both contracts are preserved, in one ordered
  // pipeline (design §4.3 cache-isolation + §4.5 confirmed clearance):
  //   0. capture the SIGNED access token BEFORE the reset - it is the authoritative
  //      revoke proof forwarded to the BFF/backend;
  //   1. resetSessionState (#389): bump the session epoch + null the token store +
  //      isolate the React-Query cache, all synchronously-first, best-effort;
  //   2. the BOUNDED, AWAITED BFF logout (§4.5) so cookie clearance is labelled
  //      confirmed vs UNCONFIRMED before navigating;
  //   3. the ownership guard (#389) gates the FINAL React-state clear + navigate so a
  //      re-login that supersedes this sign-out mid-flight is never clobbered.
  // The final applyToken(null)/setMerchant(null) sit AFTER the guard on purpose: the
  // token store + cache are already cleared by resetSessionState (no data can leak
  // during the bounded logout), and gating the React-state commit is what makes the
  // concurrent-re-login race safe.
  const signOut = useCallback(async () => {
    // 0. Capture the signed access token BEFORE the reset nulls the store - it is the
    //    authoritative revoke proof (the backend verifies its SIGNED claims).
    const token = getAccessToken()

    // 1. Failure-safe reset (#389 corrections 5/6/7): bump epoch + isolate cache + null
    //    the token store BEFORE the network call. Best-effort - even a broken clear()
    //    still ends the user signed-out below (correction 7).
    let generation: number | undefined
    try {
      generation = await resetSessionState(queryClient)
    } catch {
      // reset best-effort - fall through to null local state + navigate anyway.
    }

    // 2. Confirmed-cookie-clearance (§4.5 steps 2-3+5): invoke the BFF logout under a
    //    STRICT bounded timeout and AWAIT the response BEFORE navigating, forwarding
    //    the captured signed token. A resolved 2xx is the only evidence the clearing
    //    Set-Cookie was received (the httpOnly cookie is unreachable from page JS). A
    //    non-2xx / aborted / thrown result means cookie clearance is UNCONFIRMED (the
    //    cookie may still be live on this browser); navigation still proceeds so the
    //    user is never trapped, but the degraded state is surfaced, not silently
    //    treated as clean.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SIGN_OUT_TIMEOUT_MS)
    try {
      const result = await authApi.logout(token, controller.signal)
      if (!result.ok) {
        console.warn('[signOut] cookie clearance unconfirmed', { status: result.status, remoteRevoke: result.remoteRevoke })
      }
    } catch {
      // authApi.logout is total (returns a LogoutResult even on abort/error), but
      // defend correction 7 regardless: a thrown logout must NOT skip the signed-out
      // commit below.
      console.warn('[signOut] cookie clearance unconfirmed (logout aborted or threw)')
    } finally {
      clearTimeout(timer)
    }

    // 3. Ownership guard (#389 correction 8): if a NEWER transition (e.g. a re-login
    //    during the bounded logout round-trip) superseded this sign-out, do NOT
    //    clobber it. On a reset that threw (generation undefined) fall through to the
    //    safe signed-out commit.
    if (generation !== undefined && getSessionEpoch() !== generation) return
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
      // CONTINUE SAFELY (correction 7): finish runs on BOTH `.then` and `.catch`, so a
      // dead session ALWAYS reaches /sign-in even if the reset pipeline rejects (a
      // broken clear()), and no rejection is left floating/unhandled.
      // OWNERSHIP GUARD (correction 8): when the reset resolved with a generation,
      // skip the clear+navigate if a NEWER transition (e.g. a re-login) has since
      // superseded this dead-session teardown. On a rejected reset the generation is
      // unknown, so we fall back to the safe default of navigating to /sign-in.
      const finish = (generation?: number) => {
        if (generation !== undefined && getSessionEpoch() !== generation) return
        applyToken(null)
        setMerchant(null)
        router.replace('/sign-in')
      }
      teardownInFlightRef.current.then((generation) => finish(generation)).catch(() => finish())
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
