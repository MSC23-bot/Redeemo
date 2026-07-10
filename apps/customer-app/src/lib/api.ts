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

/**
 * Reason a customer session ended. Drives copy selection in the bridge —
 * `SESSION_REPLACED` shows the "signed in on another device" message,
 * everything else shows the generic "session expired" message. Locked
 * 2026-05-08, deferred-followups §AC7 / §AD6.
 */
export type SignOutReason = 'SESSION_EXPIRED' | 'SESSION_REPLACED'

let onSessionExpiredCb: ((reason: SignOutReason) => void) | null = null
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

/**
 * AUTH-TERMINAL refresh failure. Thrown from `refreshTokens()` when the
 * backend returns a 4xx response indicating the session is genuinely
 * over (`REFRESH_TOKEN_INVALID`, `SESSION_REPLACED`). The catch path
 * in `doFetch` clears tokens, fires `onSessionExpired(reason)`, and
 * throws `ApiClientError` with the matching code. After this fires
 * the user IS signed out.
 */
class RefreshFailedError extends Error {
  readonly kind = 'auth-terminal' as const
  readonly reason: SignOutReason
  constructor(reason: SignOutReason, message?: string) {
    super(message ?? `refresh failed (${reason})`)
    this.name = 'RefreshFailedError'
    this.reason = reason
  }
}

/**
 * TRANSPORT refresh failure. Thrown from `refreshTokens()` when the
 * refresh request itself could not complete or the backend returned a
 * 5xx response. Cases that fall here:
 *   - `fetch()` rejection: DNS failure, connection refused, server
 *     unreachable, request abort/timeout, offline.
 *   - HTTP 5xx response: backend crashed, gateway timeout, dev server
 *     restarting (e.g. `EADDRINUSE` during a hot-reload).
 *   - Non-JSON response from a misbehaving gateway.
 *
 * Critical contract: this case MUST NOT clear the user's auth state.
 * The refresh token might still be valid; the user must stay signed
 * in across transient network/server blips and try again later.
 * `doFetch` translates this into a NETWORK_ERROR `ApiClientError` so
 * React Query / mutation cache callers can retry without the user
 * being kicked back to the login screen.
 *
 * Locked 2026-05-08, deferred-followups §AC11 (PR #52).
 */
class RefreshTransportError extends Error {
  readonly kind = 'transport' as const
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'RefreshTransportError'
    if (cause !== undefined) this.cause = cause
  }
}

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
  // Map Phase 2 S2 — `init.signal` (when the caller passes one, e.g. React
  // Query's per-query AbortSignal via `api.get(path, { signal })`) flows
  // straight through to `fetch` via the RequestInit spread below; no other
  // change needed for the happy path. The wrapping try/catch below exists
  // ONLY to intercept the abort rejection before it can reach the 401/
  // refresh branch.
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  } catch (err) {
    // AbortError — the caller cancelled this request (e.g. a superseded
    // Map pan/zoom cancelling the in-flight viewport fetch via React
    // Query's per-query AbortSignal). Rethrow immediately: there is no
    // `res` to read `res.status` from, so this MUST bypass the 401/
    // refresh retry path below, and it MUST NOT be reinterpreted as a
    // network failure or trigger any auth side-effect (no token clear,
    // no `onSessionExpired`). React Query recognises an `AbortError`
    // rejection (`isCancelledError`) and silently drops the result
    // instead of surfacing it as a query error or retrying.
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw err
  }

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
    } catch (refreshErr) {
      // Auth-terminal: backend confirmed the session is over. Clear
      // tokens, notify the bridge with the reason so it can pick
      // distinct copy (SESSION_REPLACED vs SESSION_EXPIRED), and
      // surface a typed ApiClientError to callers.
      if (refreshErr instanceof RefreshFailedError) {
        tokens = { access: null, refresh: null, sessionId: null, entityId: null }
        onSessionExpiredCb?.(refreshErr.reason)
        throw new ApiClientError(
          refreshErr.reason === 'SESSION_REPLACED'
            ? 'Your account was signed in on another device, so this session has ended.'
            : 'Session expired',
          refreshErr.reason,
          401,
        )
      }
      // Transport: network blip, server unreachable, 5xx, dev-server
      // restarting (EADDRINUSE), gateway returning HTML. The user must
      // STAY signed in — refresh will succeed on the next attempt.
      // Surface a retryable NETWORK_ERROR so the caller (React Query
      // mutation cache, query retry) can handle it as a transient
      // failure. tokens are intentionally NOT cleared.
      // Locked 2026-05-08, deferred-followups §AC11.
      throw new ApiClientError(
        'Connection lost. Check your network and try again.',
        'NETWORK_ERROR',
        0,
      )
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
  // DEV-ONLY diagnostic: log refresh body shape (presence flags, NEVER
  // values) before the fetch. Locked 2026-05-08 after a device-QA
  // 400-on-refresh that needed a console hint to distinguish "stale
  // build / stale secureStorage missing sessionId" from "live build
  // with all 4 keys but backend rejected for some other reason".
  // Stripped from production by the `__DEV__` guard.
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.info('[api.refresh] body shape:', {
      hasRefreshToken: !!tokens.refresh,
      hasSessionId:    !!tokens.sessionId,
      hasEntityId:     !!tokens.entityId,
    })
  }
  refreshing = (async () => {
    // fetch() rejection is a TRANSPORT failure — DNS down, server
    // unreachable, request abort, offline. NEVER auth-terminal: the
    // refresh token might still be valid. Locked 2026-05-08
    // (deferred-followups §AC11) after a device-QA logout caused by
    // the dev server bouncing on `EADDRINUSE` while the phone was
    // off-network.
    let r: Response
    try {
      r = await fetch(`${BASE_URL}/api/v1/customer/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: tokens.refresh,
          sessionId:    tokens.sessionId,
          entityId:     tokens.entityId,
        }),
      })
    } catch (fetchErr) {
      throw new RefreshTransportError('refresh fetch failed', fetchErr)
    }
    // DEV-ONLY: log refresh response status so a 400 vs 401 vs 5xx
    // shows up immediately in the Metro/Expo console, paired with the
    // shape log above. Stripped from production.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.info('[api.refresh] response status:', r.status)
    }
    // 5xx → server-side problem. Same treatment as a network failure:
    // preserve auth, surface a retryable error, the user stays signed
    // in. Covers backend crash, gateway 502/503/504, dev-server hot-
    // reload windows, etc.
    if (r.status >= 500) {
      throw new RefreshTransportError(`refresh server error (${r.status})`)
    }
    if (!r.ok) {
      // Parse the error envelope so the inner code (REFRESH_TOKEN_INVALID
      // vs SESSION_REPLACED vs anything else) propagates to the catch in
      // `doFetch` via `RefreshFailedError.reason`. Best-effort parse —
      // a malformed body falls back to generic SESSION_EXPIRED treatment.
      let reason: SignOutReason = 'SESSION_EXPIRED'
      try {
        const errBody = (await r.json()) as { error?: { code?: string } }
        if (errBody?.error?.code === 'SESSION_REPLACED') {
          reason = 'SESSION_REPLACED'
        }
      } catch {
        /* swallow — body wasn't JSON; fall through to generic reason */
      }
      throw new RefreshFailedError(reason)
    }
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

export type ApiGetOpts = { signal?: AbortSignal }

export const api = {
  // `opts` is optional and additive — every existing `api.get(path)`
  // callsite across the app is untouched (`opts` defaults to `undefined`
  // and no second argument is ever added to the underlying `fetch()`/
  // `doFetch()` call unless a caller actually passes a signal). Map Phase
  // 2 S2's `discoveryApi.getInAreaBranches` / `searchMerchants` are the
  // first callers to pass `{ signal }` through from React Query's
  // per-query AbortSignal.
  get:   <T>(path: string, opts?: ApiGetOpts) =>
    opts?.signal ? doFetch<T>(path, { method: 'GET', signal: opts.signal }) : doFetch<T>(path, { method: 'GET' }),
  post:  <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put:   <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del:   <T>(path: string) => doFetch<T>(path, { method: 'DELETE' }),
  setTokens(access: string | null, refresh: string | null, sessionId: string | null, entityId: string | null) {
    tokens = { access, refresh, sessionId, entityId }
  },
  /**
   * Subscribe to forced sign-out events. Called with a `reason` so the
   * subscriber can pick distinct copy: `SESSION_REPLACED` → "Your
   * account was signed in on another device, so this session has
   * ended." Any other reason → generic "Your session has expired.
   * Please sign in again."
   *
   * Single-subscriber by design: a second `onSessionExpired(cb)` call
   * REPLACES the previous handler. The store-level
   * `SessionExpiredBridge` registers the only subscriber today; future
   * code attaching a listener must coordinate to avoid silently
   * dropping it.
   *
   * JS-level note: passing a no-arg callback still works — JS ignores
   * extra arguments. TypeScript will complain unless the call site
   * widens the signature.
   */
  onSessionExpired(cb: (reason: SignOutReason) => void) { onSessionExpiredCb = cb },
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
