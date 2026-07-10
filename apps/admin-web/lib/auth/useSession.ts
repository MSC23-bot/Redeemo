'use client'

/**
 * Client-side auth session provider + hook (H5 migration: localStorage ->
 * httpOnly-cookie/BFF).
 *
 * Ported from merchant-web's `lib/auth/session.tsx`, deliberately STRIPPED of
 * the sessionEpoch / resetSessionState / cache-isolation machinery: admin-web
 * has no in-tab account-switch flow, so that guard is declared out of scope
 * (migration plan §1 "Explicitly OUT of scope").
 *
 * The access token lives ONLY in memory (tokenStore.ts), mirrored into React
 * state for render. Because a page reload starts with NO in-memory token even
 * when the httpOnly session cookie is still valid, the provider MUST attempt
 * exactly one BFF refresh on mount before deciding the admin is signed out
 * (G1, migration plan §5b): `ready` means "the bootstrap refresh settled", not
 * merely "mounted" — the protected shell must never bounce to /login before
 * this has been tried.
 *
 * role/adminId are re-derived from the access token's own claims
 * (`decodeAdminJwt`) on every install rather than trusted from a stale value:
 * a bare BFF refresh response is `{ accessToken }` only (no meta), but the JWT
 * itself carries `sub`/`sessionId`/`adminRole`, so this is always safe to redo
 * and needs no extra round trip. `email` is the one field the JWT does not
 * carry; it is only ever known from the BFF login/otp-verify response.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken, setAccessToken, setOnSessionLost } from './tokenStore'
import { decodeAdminJwt, hasEffectiveCapability, type AdminCapability, type AdminRole, type AdminSessionMeta } from './session'
import { refreshSession } from '@/lib/api/client'
import { authApi } from '@/lib/api/auth'

export interface SessionValue {
  accessToken: string | null
  /** The signed-in admin's role, decoded from the access token's own claims. */
  role: AdminRole | null
  /** Known only from the BFF login/otp-verify response; null after a bare refresh. */
  email: string | null
  /** The signed-in admin's entity id (JWT `sub`). Used as currentAdminId on the queue. */
  adminId: string | null
  /** false until the bootstrap refresh-on-mount settles (G1). */
  ready: boolean
  isAuthenticated: boolean
  /** Grant-aware capability check (mirror of the backend's requireAdminCapability). */
  can: (cap: AdminCapability) => boolean
  /** Called by the login screen after a successful login/OTP verify. */
  setSession: (accessToken: string, meta: AdminSessionMeta) => void
  /** Manual single-flight refresh via the BFF (also used by the 401 retry path). */
  refresh: () => Promise<boolean>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

// Bounded wait for the BFF logout response (mirrors merchant-web's
// logout-durability design). Must sit ABOVE the BFF route's own internal
// backend-revoke timeout (3000ms in app/api/admin-auth/logout/route.ts) so
// this await still returns having received the BFF's cookie-clearing response
// in the common case, while remaining bounded so signOut can never hang.
const SIGN_OUT_TIMEOUT_MS = 5000

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [accessToken, setTok] = useState<string | null>(null)
  const [role, setRole] = useState<AdminRole | null>(null)
  const [adminId, setAdminId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  // Team & Roles S1: the token's `caps` claim (role baseline UNION active
  // grantable grants, minted server-side). undefined for a legacy token (no
  // claim) or when signed out; `hasEffectiveCapability` falls back to the role
  // baseline in that case. Re-derived from the token on every install, same as
  // role/adminId — never trusted from a stale param.
  const [caps, setCaps] = useState<string[] | undefined>(undefined)
  const [ready, setReady] = useState(false)

  // Mirrors the in-memory token store into React state, and re-derives
  // role/adminId/caps from the token's OWN claims on every install (never
  // trusted from a stale param) — see the module doc comment above.
  const applyToken = useCallback((t: string | null) => {
    setAccessToken(t)
    setTok(t)
    if (!t) {
      setRole(null)
      setAdminId(null)
      setEmail(null)
      setCaps(undefined)
      return
    }
    const claims = decodeAdminJwt(t)
    setRole((claims?.adminRole as AdminRole) ?? null)
    setAdminId(claims?.sub ?? null)
    setCaps(claims?.caps)
  }, [])

  const setSession = useCallback(
    (t: string, meta: AdminSessionMeta) => {
      applyToken(t)
      setEmail(meta.email)
    },
    [applyToken],
  )

  // signOut (G2): capture the SIGNED access token BEFORE clearing local state —
  // it is the authoritative revoke proof the BFF forwards as Bearer to the
  // backend's authenticateAdmin-gated /logout. Awaits the bounded BFF logout
  // (cookie clearance) before navigating; a degraded/unconfirmed outcome is
  // surfaced via console.warn but never traps the admin on the page.
  const signOut = useCallback(async () => {
    const token = getAccessToken()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SIGN_OUT_TIMEOUT_MS)
    try {
      const result = await authApi.logout(token, controller.signal)
      if (!result.ok) {
        console.warn('[signOut] cookie clearance unconfirmed', { status: result.status, remoteRevoke: result.remoteRevoke })
      }
    } catch {
      console.warn('[signOut] cookie clearance unconfirmed (logout aborted or threw)')
    } finally {
      clearTimeout(timer)
    }
    applyToken(null)
    router.replace('/login')
  }, [applyToken, router])

  const refresh = useCallback(async () => {
    const ok = await refreshSession()
    if (ok) applyToken(getAccessToken())
    return ok
  }, [applyToken])

  // apiFetch hard-logout hook: a refresh failure (or a still-401 after a
  // nominally successful refresh) triggers tokenStore's at-most-once latch,
  // which routes through this SAME teardown — clear local state + bounce to
  // /login — regardless of how many concurrent requests hit the dead session.
  useEffect(() => {
    setOnSessionLost(() => {
      applyToken(null)
      router.replace('/login')
    })
    return () => setOnSessionLost(null)
  }, [applyToken, router])

  // G1 refresh-on-mount: hydrate the access token from the httpOnly cookie
  // exactly once. `ready` only flips once this settles, so the admin-shell's
  // render guard never bounces to /login before this bootstrap refresh has
  // been tried — middleware allowing the page through (cookie present) must
  // never race the client into a wrong /login bounce.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    let cancelled = false
    void (async () => {
      const ok = await refreshSession()
      if (cancelled) return
      if (ok) applyToken(getAccessToken())
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [applyToken])

  // Grant-aware: prefers the token's `caps` claim when present (SUPER_ADMIN
  // short-circuit, else caps-claim membership, else legacy role-baseline
  // fallback) — mirrors the backend requireAdminCapability exactly. See
  // hasEffectiveCapability's doc comment in session.ts.
  const can = useCallback((cap: AdminCapability) => hasEffectiveCapability(role, caps, cap), [role, caps])

  const value: SessionValue = {
    accessToken,
    role,
    email,
    adminId,
    ready,
    isAuthenticated: !!accessToken,
    can,
    setSession,
    refresh,
    signOut,
  }

  return createElement(SessionContext.Provider, { value }, children)
}

/**
 * Consume the session from the nearest SessionProvider. Throws if used outside
 * one, which keeps a single source of truth (no duplicate refresh-on-mount
 * effects / token stores).
 */
export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return ctx
}
