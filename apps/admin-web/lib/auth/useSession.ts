'use client'

/**
 * Client-side session hook + provider.
 *
 * Exposes the signed-in admin's auth state to client components:
 *   { isAuthenticated, role, can(cap) }
 *
 * The session lives in localStorage (see session.ts), which is unavailable
 * during SSR, so this resolves on mount. `ready` distinguishes "still reading
 * storage" from "definitely signed out", which the protected shell uses to
 * avoid a redirect flash before hydration. A storage event listener keeps tabs
 * in sync (e.g. logging out in one tab signs out the others).
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getAdminRole,
  getSessionMeta,
  isAuthenticated as readIsAuthenticated,
  hasCapability,
  type AdminCapability,
  type AdminRole,
} from './session'

type SessionState = {
  /** True once the client has read localStorage at least once. */
  ready: boolean
  isAuthenticated: boolean
  role: AdminRole | null
  email: string | null
  /** Capability check against the current role (mirror of the backend). */
  can: (cap: AdminCapability) => boolean
  /** Re-read storage (call after login / logout to refresh in-memory state). */
  refresh: () => void
}

const SessionContext = createContext<SessionState | null>(null)

function readSnapshot(): {
  isAuthenticated: boolean
  role: AdminRole | null
  email: string | null
} {
  return {
    isAuthenticated: readIsAuthenticated(),
    role: getAdminRole(),
    email: getSessionMeta()?.email ?? null,
  }
}

/** Standalone hook (no provider required). */
export function useSessionState(): SessionState {
  const [ready, setReady] = useState(false)
  const [snapshot, setSnapshot] = useState({
    isAuthenticated: false,
    role: null as AdminRole | null,
    email: null as string | null,
  })

  const refresh = useCallback(() => {
    setSnapshot(readSnapshot())
    setReady(true)
  }, [])

  useEffect(() => {
    refresh()
    // Cross-tab sync: a logout / login in another tab updates this one.
    function onStorage() {
      refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  const can = useCallback(
    (cap: AdminCapability) => hasCapability(snapshot.role, cap),
    [snapshot.role]
  )

  return useMemo(
    () => ({
      ready,
      isAuthenticated: snapshot.isAuthenticated,
      role: snapshot.role,
      email: snapshot.email,
      can,
      refresh,
    }),
    [ready, snapshot, can, refresh]
  )
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSessionState()
  return createElement(SessionContext.Provider, { value }, children)
}

/**
 * Consume the session from the nearest SessionProvider. Throws if used outside
 * one, which keeps a single source of truth (no duplicate storage listeners).
 */
export function useSession(): SessionState {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return ctx
}
