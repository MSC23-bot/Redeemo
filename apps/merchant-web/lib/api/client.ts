/**
 * Merchant API fetch wrapper (M1 Slice 1).
 *
 * Ports admin-web's apiFetch but for the BFF-lite session:
 *   - prefixes NEXT_PUBLIC_API_URL for DIRECT browser->backend calls (authed reads
 *     like GET /merchant/profile, and the public forgot/reset/claim/resend calls)
 *   - attaches the IN-MEMORY access token when `auth: true` (never localStorage)
 *   - throws a typed ApiError from `{ error: { code, message, statusCode } }` (also
 *     tolerates a flat `{ code, message }` and the @fastify/rate-limit default 429
 *     `{ statusCode, error:'Too Many Requests', message }` where error is a string)
 *
 * On a 401 for an authed request it does ONE refresh via the local BFF route
 * /api/merchant-auth/refresh (which reads the httpOnly cookie), then retries once.
 * The refresh is memoised into a module-level single-flight so concurrent 401s do
 * NOT each POST /refresh and race the single-use refresh-token rotation. If refresh
 * fails, the session is dead: clear the in-memory token + trigger a hard logout.
 */
import { getAccessToken, setAccessToken, triggerSessionLost } from '@/lib/auth/tokenStore'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  public status: number
  public statusCode: number
  public code: string | undefined
  public body: unknown

  constructor(status: number, body: unknown) {
    const bodyObj = body as
      | { error?: { code?: string; message?: string } | string; code?: string; message?: string }
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
  /** Attach the in-memory bearer token (and enable 401 refresh-once-retry). */
  auth?: boolean
  /** Internal: set on the retried request so a second 401 does not re-refresh. */
  _isRetry?: boolean
}

/** Single refresh via the BFF route handler (cookie carries the material, no body). */
async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/merchant-auth/refresh', { method: 'POST' })
    if (!res.ok) return false
    const data = (await res.json().catch(() => null)) as { accessToken?: string } | null
    if (data?.accessToken && typeof data.accessToken === 'string') {
      setAccessToken(data.accessToken)
      return true
    }
    return false
  } catch {
    return false
  }
}

let refreshInFlight: Promise<boolean> | null = null
function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/** Single-flight refresh, exposed for the SessionProvider (refresh-on-mount + manual). */
export function refreshSession(): Promise<boolean> {
  return tryRefresh()
}

/**
 * The shared BFF-lite authed-fetch CORE: bearer attach + refresh-once-on-401
 * (single-flight via tryRefresh) + session-lost teardown + a typed ApiError on a
 * non-ok response. Resolves to the RAW Response on success. apiFetch() parses JSON
 * on top of this; apiFetchRaw() exposes it for non-JSON downloads (the gated CSV
 * export) so those downloads get the IDENTICAL auth lifecycle rather than a
 * hand-rolled weaker fetch that cannot refresh an expired token.
 */
async function apiFetchResponse(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { auth = false, _isRetry = false, ...init } = options
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (auth) {
    const token = getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers })

  if (res.status === 401 && auth && !_isRetry) {
    const refreshed = await tryRefresh()
    if (refreshed) return apiFetchResponse(path, { ...options, _isRetry: true })
    setAccessToken(null)
    triggerSessionLost()
    const body = await res.json().catch(() => null)
    throw new ApiError(401, body)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body)
  }
  return res
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const res = await apiFetchResponse(path, options)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/**
 * Like apiFetch but resolves to the RAW Response on success (no JSON parse), for
 * non-JSON downloads such as the gated event-level CSV export. Reuses the full
 * apiFetch auth lifecycle: bearer attach, refresh-once-on-401 (single-flight),
 * session-lost teardown, and typed ApiError. Do NOT hand-roll a weaker fetch for
 * authed downloads - an expired token must still refresh once and retry.
 */
export async function apiFetchRaw(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  return apiFetchResponse(path, options)
}
