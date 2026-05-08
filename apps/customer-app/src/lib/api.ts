import Constants from 'expo-constants'

const BASE_URL: string = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:3000'

// All four fields are required for a successful refresh round-trip.
// Backend `POST /api/v1/customer/auth/refresh` parses
// `{ refreshToken, sessionId, entityId }` via Zod (see
// src/api/auth/customer/routes.ts:81-94). Until 2026-05-08 the client
// posted only `{ refreshToken }` — every 15-minute access-token expiry
// triggered a Zod-rejection 400 → forced sign-out (M3 device QA).
type Tokens = {
  access:    string | null
  refresh:   string | null
  sessionId: string | null
  entityId:  string | null
}

let tokens: Tokens = { access: null, refresh: null, sessionId: null, entityId: null }
let onSessionExpiredCb: (() => void) | null = null
// Notifies subscribers when the backend rotates access + refresh tokens
// during a 401 retry. The store-side bridge persists the new pair to
// secureStorage and updates zustand state so the next bootstrap reads
// the live tokens — without this, an app relaunch after rotation reads
// the stale refresh token, posts it back, and gets REFRESH_TOKEN_INVALID
// from Redis (the old key was deleted by the rotation that issued the
// new pair). 2026-05-08 PR #50 P2 fix.
let onTokensRefreshedCb:
  | ((next: { accessToken: string; refreshToken: string }) => void)
  | null = null
let refreshing: Promise<void> | null = null

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly field?: string
  // Optional payload carrying any non-standard fields from the backend's
  // error envelope (e.g. INVALID_PIN.remainingAttempts,
  // PIN_RATE_LIMIT_EXCEEDED.retryAfter). Standard fields (code, message,
  // statusCode, field) are excluded from this object and surfaced via the
  // dedicated properties above.
  readonly details?: Record<string, unknown>
  constructor(
    message: string,
    code: string,
    status: number,
    field?: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.code = code
    this.status = status
    if (field !== undefined) this.field = field
    if (details !== undefined) this.details = details
  }
}

async function doFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  // Only set Content-Type when there's an actual body. Fastify's body parser
  // throws FST_ERR_CTP_EMPTY_JSON_BODY when `application/json` is announced
  // but the body is empty — which surfaced on bodyless DELETEs (delete review)
  // and bodyless POSTs (favourite add) as a generic 500 INTERNAL_ERROR toast.
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  }
  if (init.body !== undefined && init.body !== null) {
    headers['Content-Type'] = 'application/json'
  }
  if (tokens.access) headers['Authorization'] = `Bearer ${tokens.access}` as string
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })

  // Refresh + retry path — guarded on ALL three refresh-payload fields so
  // we never POST a partial body to the backend (would 400 → spurious
  // logout). If sessionId or entityId were lost in memory (e.g.
  // mid-bootstrap), surface the original 401 instead of forcing a logout.
  if (
    res.status === 401 &&
    retry &&
    tokens.refresh &&
    tokens.sessionId &&
    tokens.entityId &&
    !path.endsWith('/auth/refresh')
  ) {
    try {
      await refreshTokens()
      return doFetch<T>(path, init, false)
    } catch {
      tokens = { access: null, refresh: null, sessionId: null, entityId: null }
      onSessionExpiredCb?.()
      throw new ApiClientError('Session expired', 'SESSION_EXPIRED', 401)
    }
  }

  const text = await res.text()
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  if (!res.ok) {
    // Backend serialises errors as `{ error: { code, message, statusCode, field? } }`
    // (see src/api/app.ts setErrorHandler + AppError.toJSON()). Unwrap the
    // envelope so `code` / `message` / `field` are read from the inner object.
    // Falls back to top-level fields for backwards compatibility with anything
    // that doesn't wrap.
    const nested =
      json.error && typeof json.error === 'object' && !Array.isArray(json.error)
        ? (json.error as Record<string, unknown>)
        : null
    const errorBody = nested ?? json
    // Strip the standard fields (code/message/statusCode/field) so what's
    // left is the per-error details payload (e.g. remainingAttempts,
    // retryAfter). undefined `details` when the body has only standard
    // fields — keeps the API surface clean for callers that don't need it.
    const { code: _c, message: _m, statusCode: _s, field: _f, ...extra } = errorBody
    void _c; void _m; void _s; void _f
    const details = Object.keys(extra).length > 0 ? (extra as Record<string, unknown>) : undefined
    throw new ApiClientError(
      (errorBody.message as string | undefined) ?? res.statusText,
      (errorBody.code as string | undefined) ?? 'UNKNOWN',
      res.status,
      errorBody.field as string | undefined,
      details,
    )
  }
  return json as T
}

async function refreshTokens(): Promise<void> {
  if (!tokens.refresh || !tokens.sessionId || !tokens.entityId) throw new Error('missing refresh context')
  if (refreshing) return refreshing
  refreshing = (async () => {
    const r = await fetch(`${BASE_URL}/api/v1/customer/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: tokens.refresh,
        sessionId:    tokens.sessionId,
        entityId:     tokens.entityId,
      }),
    })
    if (!r.ok) throw new Error('refresh failed')
    const body = (await r.json()) as { accessToken: string; refreshToken: string }
    // sessionId + entityId are stable across refresh — backend rotates the
    // access + refresh tokens against the same Redis session row.
    tokens = {
      access:    body.accessToken,
      refresh:   body.refreshToken,
      sessionId: tokens.sessionId,
      entityId:  tokens.entityId,
    }
    // Fire AFTER the in-memory swap so a subscriber that reads via
    // `api.get(...)` immediately on the next tick already sees the new
    // bearer. Subscribers MUST treat this as a fire-and-forget signal —
    // any persistence work they do is best-effort and asynchronous; if
    // it throws, the in-memory rotation still stands and the very next
    // request succeeds. Uniform try/catch matches the SessionExpired
    // notification contract.
    try {
      onTokensRefreshedCb?.({ accessToken: body.accessToken, refreshToken: body.refreshToken })
    } catch {
      /* swallow — subscribers are best-effort */
    }
  })()
  try { await refreshing } finally { refreshing = null }
}

export type SetTokensInput = {
  accessToken:  string | null
  refreshToken: string | null
  sessionId:    string | null
  entityId:     string | null
}

export function setTokens({ accessToken, refreshToken, sessionId, entityId }: SetTokensInput) {
  tokens = { access: accessToken, refresh: refreshToken, sessionId, entityId }
}

export const api = {
  get:   <T>(path: string) => doFetch<T>(path, { method: 'GET' }),
  post:  <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put:   <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del:   <T>(path: string) => doFetch<T>(path, { method: 'DELETE' }),
  setTokens(access: string | null, refresh: string | null, sessionId: string | null, entityId: string | null) {
    tokens = { access, refresh, sessionId, entityId }
  },
  onSessionExpired(cb: () => void) { onSessionExpiredCb = cb },
  /**
   * Subscribe to access+refresh-token rotation events. Fires inside
   * `refreshTokens()` after the in-memory `tokens` object has been
   * updated to the new pair. Single-subscriber by design (mirrors
   * `onSessionExpired`); a second `onTokensRefreshed(cb)` call replaces
   * the previous handler. The store-side `TokensPersistenceBridge`
   * registers exactly one handler at app boot and keeps it for the
   * session lifetime.
   */
  onTokensRefreshed(cb: (next: { accessToken: string; refreshToken: string }) => void) {
    onTokensRefreshedCb = cb
  },
  __setTokensForTests(
    access:    string | null,
    refresh:   string | null,
    sessionId: string | null = null,
    entityId:  string | null = null,
  ) { tokens = { access, refresh, sessionId, entityId } },
}
