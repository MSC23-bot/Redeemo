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
 */
import {
  getAccessToken,
  getRefreshToken,
  getSessionMeta,
  updateTokens,
  clearSession,
} from '@/lib/auth/session'

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
    window.location.assign('/login')
  }
}

/**
 * Attempt a single refresh using the stored refresh token + session meta.
 * Returns true and rotates the stored tokens on success; returns false on any
 * failure (no session, invalid token, network/HTTP error). Never throws.
 */
async function tryRefresh(): Promise<boolean> {
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
    const data = (await res.json().catch(() => null)) as {
      accessToken?: string
      refreshToken?: string
    } | null
    if (!data?.accessToken || !data?.refreshToken) return false
    updateTokens(data.accessToken, data.refreshToken)
    return true
  } catch {
    return false
  }
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
