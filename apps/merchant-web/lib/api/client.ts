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
 *
 * Session cache-isolation CORE (T2): every call captures the session epoch
 * (lib/auth/sessionEpoch.ts) at entry and threads that SAME captured value through
 * the one refresh-retry via a private `_epoch` option (never re-captured on the
 * retry). If the epoch has moved by the time a request resolves - a session
 * boundary happened mid-flight - the response is discarded: apiFetch throws a
 * synthetic `SESSION_SWITCHED` ApiError instead of delivering old-session data, and
 * the 401 branch's own session side effects (setAccessToken(null) /
 * triggerSessionLost()) are skipped entirely so a dead request can never hard-log-out
 * a session that has already moved on. See design spec §4.2.
 */
import { getAccessToken, setAccessToken, triggerSessionLost } from '@/lib/auth/tokenStore'
import { getSessionEpoch } from '@/lib/auth/sessionEpoch'

/** Reserved synthetic error code for a request/refresh discarded by the epoch guard. */
export const SESSION_SWITCHED_CODE = 'SESSION_SWITCHED'

/** A synthetic, never-delivered-as-data ApiError raised when the epoch has moved. */
function sessionSwitchedError(): ApiError {
  return new ApiError(0, { code: SESSION_SWITCHED_CODE, message: 'Session switched during this request' })
}

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
  /**
   * Internal: the session epoch captured at the ORIGINAL request's entry, threaded
   * through the one refresh-retry so the retry is judged against the epoch that was
   * live when the request was first issued, not a fresh capture at retry time.
   */
  _epoch?: number
}

/**
 * Single refresh via the BFF route handler (cookie carries the material, no body).
 * Captures the session epoch before the fetch; if the epoch has moved by the time
 * this resolves, returns false WITHOUT calling setAccessToken - a stale in-flight
 * refresh must never re-arm the token store (or the hard-logout latch) for a
 * session that has already been torn down (design spec §3 / §4.2, in-memory arm).
 */
async function doRefresh(): Promise<boolean> {
  const capturedEpoch = getSessionEpoch()
  try {
    const res = await fetch('/api/merchant-auth/refresh', { method: 'POST' })
    if (!res.ok) return false
    const data = (await res.json().catch(() => null)) as { accessToken?: string } | null
    if (getSessionEpoch() !== capturedEpoch) return false
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
    // F1 self-ownership guard: the `.finally` must only clear the slot it still
    // owns. Without the `refreshInFlight === p` check, an OLD promise settling
    // AFTER a newer session's teardown has already reset (and a new refresh has
    // started) would null the NEW slot out from under it, re-opening the
    // single-flight and letting two concurrent refreshes race the single-use
    // rotation (design spec §4.2).
    const p: Promise<boolean> = doRefresh().finally(() => {
      if (refreshInFlight === p) refreshInFlight = null
    })
    refreshInFlight = p
  }
  return refreshInFlight
}

/** Single-flight refresh, exposed for the SessionProvider (refresh-on-mount + manual). */
export function refreshSession(): Promise<boolean> {
  return tryRefresh()
}

/**
 * Teardown hook (lib/auth/sessionReset.ts, T3): forces the module-level single-flight
 * refresh slot back to empty at a session boundary, so the next session's first 401
 * starts its OWN refresh rather than adopting - and awaiting the resolution of - a
 * promise that belongs to a dead session (design spec §4.2 / §4.3 step 2).
 */
export function resetRefreshInFlight(): void {
  refreshInFlight = null
}

/**
 * The shared BFF-lite authed-fetch CORE: bearer attach + refresh-once-on-401
 * (single-flight via tryRefresh) + session-lost teardown + a typed ApiError on a
 * non-ok response. Resolves to the RAW Response on success. apiFetch() parses JSON
 * on top of this; apiFetchRaw() exposes it for non-JSON downloads (the gated CSV
 * export) so those downloads get the IDENTICAL auth lifecycle rather than a
 * hand-rolled weaker fetch that cannot refresh an expired token.
 */
/** Internal: the terminal Response paired with the epoch captured for this request. */
type FetchOutcome = { res: Response; capturedEpoch: number }

async function apiFetchResponse(path: string, options: ApiFetchOptions = {}): Promise<FetchOutcome> {
  const { auth = false, _isRetry = false, _epoch, ...init } = options
  // Capture ONCE at the original request's entry; the retry below threads this same
  // value through via `_epoch` rather than re-capturing (design spec §4.2 F2) - a
  // boundary landing between a successful refresh and the retry's own entry would
  // otherwise let the retry's captured epoch equal the NEW current epoch, and its
  // resolution would wrongly survive the guard below.
  const capturedEpoch = _epoch ?? getSessionEpoch()
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
    // Correction 1 (pre-refresh epoch gate): before an OLD 401 starts a refresh,
    // verify the request's captured epoch still equals the current session epoch. If
    // a session boundary landed during the original request, this 401 belongs to a
    // dead session - abort with SESSION_SWITCHED rather than refreshing under a new
    // session (and never touch the single-use refresh-token rotation on its behalf).
    if (getSessionEpoch() !== capturedEpoch) {
      throw sessionSwitchedError()
    }
    const refreshed = await tryRefresh()
    if (refreshed) {
      // Correction 1 (pre-retry-dispatch epoch gate) + Correction 2 (cross-account
      // write safety): re-verify the epoch BEFORE dispatching the retry. The retry
      // attaches the CURRENT bearer token - which, after a mid-flight account switch,
      // is a DIFFERENT merchant's token. Aborting here guarantees an old request's
      // retry never leaves the browser under a new merchant's credentials. (Belt and
      // suspenders with the transport guard below, which only fires AFTER the retry's
      // network call has already gone out.)
      if (getSessionEpoch() !== capturedEpoch) {
        throw sessionSwitchedError()
      }
      return apiFetchResponse(path, { ...options, _isRetry: true, _epoch: capturedEpoch })
    }
    // Session-side-effect epoch gate (Codex #3): a request that 401s, fails its
    // refresh, and finds the epoch has moved belongs to a DEAD session - a new
    // session is already live. It must not run any session-mutating side effect
    // (setAccessToken(null) / triggerSessionLost()); only a current-epoch request
    // may drive a hard logout.
    if (getSessionEpoch() !== capturedEpoch) {
      throw sessionSwitchedError()
    }
    setAccessToken(null)
    triggerSessionLost()
    const body = await res.json().catch(() => null)
    throw new ApiError(401, body)
  }

  // Transport-layer epoch guard (design spec §4.2): after ANY terminal resolution
  // (success or a non-401 error), an old-session response can never be delivered to
  // a caller once a session boundary has happened mid-flight - discard it in favour
  // of a synthetic SESSION_SWITCHED error (status 0; never delivered as data).
  if (getSessionEpoch() !== capturedEpoch) {
    throw sessionSwitchedError()
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body)
  }
  return { res, capturedEpoch }
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { res, capturedEpoch } = await apiFetchResponse(path, options)
  if (res.status === 204) return undefined as T
  const data = (await res.json()) as T
  // Correction 3 (post-body epoch gate): re-check AFTER JSON body consumption, not
  // only after fetch returned headers. A session boundary that lands while the body
  // is still streaming must still abort the pre-side-effect delivery - the parsed
  // old-session payload is discarded rather than handed to the caller.
  if (getSessionEpoch() !== capturedEpoch) {
    throw sessionSwitchedError()
  }
  return data
}

/**
 * Like apiFetch but resolves to the RAW Response on success (no JSON parse), for
 * non-JSON downloads such as the gated event-level CSV export. Reuses the full
 * apiFetch auth lifecycle: bearer attach, refresh-once-on-401 (single-flight),
 * session-lost teardown, and typed ApiError. Do NOT hand-roll a weaker fetch for
 * authed downloads - an expired token must still refresh once and retry.
 */
export async function apiFetchRaw(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { res, capturedEpoch } = await apiFetchResponse(path, options)
  // Correction 4 (raw post-body epoch gate): the CSV/raw path must be protected
  // THROUGH body consumption too, not returned before the epoch protection ends.
  // Bodyless statuses have nothing to stream, so re-check and hand the Response back
  // as-is; otherwise BUFFER the body here so the epoch can be re-checked AFTER the
  // bytes are consumed, then return an equivalent Response the caller can still read.
  if (res.status === 204 || res.status === 304) {
    if (getSessionEpoch() !== capturedEpoch) {
      throw sessionSwitchedError()
    }
    return res
  }
  const buffered = await res.arrayBuffer()
  if (getSessionEpoch() !== capturedEpoch) {
    throw sessionSwitchedError()
  }
  return new Response(buffered, { status: res.status, statusText: res.statusText, headers: res.headers })
}
