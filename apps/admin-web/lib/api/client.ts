/**
 * Admin API fetch wrapper.
 *
 * Mirrors customer-web's `apiFetch`:
 *   - prefixes NEXT_PUBLIC_API_URL
 *   - JSON by default, attaches the admin bearer token when `auth: true`
 *   - throws a typed `ApiError` from the `{ error: { code, message, statusCode } }`
 *     shape (also tolerates a flat `{ code, message }`)
 *
 * Admin-specific addition: on a 401 for an authed request it attempts a single
 * token refresh, and on success retries the original request once. If refresh
 * fails (or there is no session to refresh) it clears the session and redirects
 * to /login. The refresh call itself is never retried (no refresh-on-refresh),
 * so this can never loop.
 *
 * Concurrency: the refresh token is single-use — the backend rotates it
 * (deletes the old, stores a new one) on every `/refresh`. If two authed
 * requests 401 at once and each POSTed `/refresh` with the same stored token,
 * the second would fail against the now-rotated token and spuriously clear a
 * still-valid session. So the in-flight refresh is memoised into a module-level
 * singleton (`tryRefresh`): concurrent callers all await ONE refresh promise.
 */
import {
  getAccessToken,
  getRefreshToken,
  getSessionMeta,
  updateTokens,
  clearSession,
} from '@/lib/auth/session'
import { refreshResponseSchema } from './auth'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  public status: number
  public statusCode: number
  public code: string | undefined
  public body: unknown

  constructor(status: number, body: unknown) {
    const bodyObj = body as
      | {
          error?: { code?: string; message?: string } | string
          code?: string
          message?: string
        }
      | null
    const nestedErr =
      bodyObj?.error != null && typeof bodyObj.error === 'object'
        ? (bodyObj.error as { code?: string; message?: string })
        : null
    const message =
      nestedErr?.message ??
      (typeof bodyObj?.error === 'string' ? bodyObj.error : undefined) ??
      bodyObj?.message ??
      `API error ${status}`
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.statusCode = status
    this.code = nestedErr?.code ?? bodyObj?.code
    this.body = body
  }
}

export type ApiFetchOptions = RequestInit & {
  /** Attach the admin bearer token (and enable 401 refresh-once-retry). */
  auth?: boolean
  /** Internal: set on the retried request so a second 401 does not re-refresh. */
  _isRetry?: boolean
}

function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    const here = window.location.pathname + window.location.search
    // Capture where the user was so login can return them after re-auth. Never
    // round-trip the login page itself (would loop); the login page re-validates
    // `next` as a same-origin path before using it (open-redirect defence).
    const next = here.startsWith('/login') ? '' : here
    window.location.assign(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  }
}

/**
 * Perform a single refresh using the stored refresh token + session meta.
 * Returns true and rotates the stored tokens on success; returns false on any
 * failure (no session, invalid token, network/HTTP error, contract drift).
 * Never throws.
 *
 * The response is validated with `refreshResponseSchema` — the SAME schema
 * `auth.ts` exports — so the `/refresh` payload is validated in exactly one
 * place rather than hand-checked here.
 */
async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  const meta = getSessionMeta()
  if (!refreshToken || !meta) return false

  try {
    const res = await fetch(`${BASE}/api/v1/admin/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken,
        sessionId: meta.sessionId,
        entityId: meta.entityId,
      }),
    })
    if (!res.ok) return false
    const raw = await res.json().catch(() => null)
    const parsed = refreshResponseSchema.safeParse(raw)
    if (!parsed.success) return false
    updateTokens(parsed.data.accessToken, parsed.data.refreshToken)
    return true
  } catch {
    return false
  }
}

/**
 * Module-level singleton wrapper around `doRefresh`. The first concurrent
 * caller kicks off the refresh; any caller that arrives while it is in flight
 * awaits the SAME promise instead of POSTing `/refresh` again with the (now
 * single-use) refresh token. The slot is cleared once the refresh settles so a
 * later 401 can refresh afresh.
 */
let refreshInFlight: Promise<boolean> | null = null
function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { auth = false, _isRetry = false, ...init } = options
  const headers = new Headers(init.headers)

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (auth) {
    const token = getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers })

  if (res.status === 401 && auth && !_isRetry) {
    // Single refresh attempt, then one retry of the original request.
    const refreshed = await tryRefresh()
    if (refreshed) {
      return apiFetch<T>(path, { ...options, _isRetry: true })
    }
    // Refresh failed -> session is dead. Clear and bounce to login.
    clearSession()
    redirectToLogin()
    const body = await res.json().catch(() => null)
    throw new ApiError(401, body)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body)
  }

  if (res.status === 204) return undefined as T

  return (await res.json()) as T
}
