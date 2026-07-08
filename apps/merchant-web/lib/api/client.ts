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
 * NOT each POST /refresh and race the single-use refresh-token rotation. The
 * session is treated as dead - clear the in-memory token + trigger a hard logout -
 * both when the refresh call itself fails AND when the retried request STILL 401s
 * despite a nominally successful refresh (a still-401 retry is refresh-once
 * EXHAUSTED, not a fresh 401 to refresh again). Both are the SAME terminal
 * condition; neither falls through to a plain, un-torn-down ApiError.
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
 *
 * Defense-in-depth closure (post-#389 composed review): EVERY body-consuming
 * success-or-error path re-checks the epoch AFTER the body await, not just before it
 * - including the non-401 `!res.ok` error throw, the 401-failed-refresh error throw,
 * and a JSON-parse/arrayBuffer-read REJECTION (`guardStaleReject`). A mid-flight
 * epoch move can therefore never deliver stale data NOR throw a stale ApiError to a
 * caller; only same-epoch behaviour is preserved unchanged. `assertEpoch()` is the
 * single shared gate primitive so this logic is defined exactly once.
 */
import { getAccessToken, setAccessToken, triggerSessionLost } from '@/lib/auth/tokenStore'
import { getSessionEpoch } from '@/lib/auth/sessionEpoch'

/** Reserved synthetic error code for a request/refresh discarded by the epoch guard. */
export const SESSION_SWITCHED_CODE = 'SESSION_SWITCHED'

/** A synthetic, never-delivered-as-data ApiError raised when the epoch has moved. */
function sessionSwitchedError(): ApiError {
  return new ApiError(0, { code: SESSION_SWITCHED_CODE, message: 'Session switched during this request' })
}

/**
 * Shared epoch-re-check primitive (defense-in-depth follow-up to PR #389's composed
 * review). Throws the synthetic SESSION_SWITCHED error if the session epoch has moved
 * since `capturedEpoch` was captured at request entry. Every terminal path below -
 * success or error, before or after a body is consumed - routes through this single
 * helper so the gate logic is defined exactly once.
 */
function assertEpoch(capturedEpoch: number): void {
  if (getSessionEpoch() !== capturedEpoch) {
    throw sessionSwitchedError()
  }
}

/**
 * Wraps a body-consuming read (`res.json()`, `res.arrayBuffer()`, etc.) so that a
 * REJECTION from the read itself is also subject to the epoch gate, not just a
 * successful resolution. If the promise rejects AND the epoch moved during the
 * await, the original rejection reason (e.g. a JSON parse SyntaxError) is discarded
 * in favour of SESSION_SWITCHED - a dead session must never surface even a parse
 * error to a caller that has already moved to a new session. If the epoch has NOT
 * moved, the original error is rethrown unchanged (behavior-preserving).
 */
async function guardStaleReject<T>(promise: Promise<T>, capturedEpoch: number): Promise<T> {
  try {
    return await promise
  } catch (err) {
    assertEpoch(capturedEpoch)
    throw err
  }
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

  if (res.status === 401 && auth) {
    // Correction 1 (pre-refresh epoch gate): before an OLD 401 starts a refresh,
    // verify the request's captured epoch still equals the current session epoch. If
    // a session boundary landed during the original request, this 401 belongs to a
    // dead session - abort with SESSION_SWITCHED rather than refreshing under a new
    // session (and never touch the single-use refresh-token rotation on its behalf).
    // This gate applies whether or not this is already the retry: a still-401 retry
    // (below) reaches the SAME terminal path, and it too must not act on a stale epoch.
    assertEpoch(capturedEpoch)
    if (!_isRetry) {
      const refreshed = await tryRefresh()
      if (refreshed) {
        // Correction 1 (pre-retry-dispatch epoch gate) + Correction 2 (cross-account
        // write safety): re-verify the epoch BEFORE dispatching the retry. The retry
        // attaches the CURRENT bearer token - which, after a mid-flight account switch,
        // is a DIFFERENT merchant's token. Aborting here guarantees an old request's
        // retry never leaves the browser under a new merchant's credentials. (Belt and
        // suspenders with the transport guard below, which only fires AFTER the retry's
        // network call has already gone out.)
        assertEpoch(capturedEpoch)
        return apiFetchResponse(path, { ...options, _isRetry: true, _epoch: capturedEpoch })
      }
    }
    // Terminal session-loss: reached either because the
    // refresh-once attempt itself failed, OR because this request IS the retry and it
    // STILL 401'd even though tryRefresh() reported success (observed on staging after
    // a Redis region move: the BFF refresh route mints a fresh access token from the
    // still-valid httpOnly cookie, but the backend independently rejects the request -
    // e.g. a Redis-backed session/session-cache lookup the region move wiped - so the
    // "refreshed" token is dead on arrival). Before this fix, a still-401 retry fell
    // through past this block entirely (guarded by `!_isRetry` at the top) into the
    // generic `!res.ok` branch below, which throws a plain ApiError WITHOUT ever
    // calling setAccessToken(null) / triggerSessionLost() - leaving a stale bearer
    // token in memory and no redirect. That is exactly the confusing half-logged-in
    // shell (fail-closed baseline nav + "Something went wrong" content, no way back to
    // sign-in) reported on staging. Both the failed-refresh case and this still-401-
    // after-refresh case now route through the SAME existing hard-logout side effects,
    // which SessionProvider (lib/auth/session.tsx) already wires to a full teardown +
    // redirect to /sign-in - no new ad-hoc session-lost signal is introduced here.
    //
    // Session-side-effect epoch gate (Codex #3): a request that 401s here and finds the
    // epoch has moved belongs to a DEAD session - a new session is already live. It
    // must not run any session-mutating side effect (setAccessToken(null) /
    // triggerSessionLost()); only a current-epoch request may drive a hard logout.
    assertEpoch(capturedEpoch)
    setAccessToken(null)
    triggerSessionLost()
    const body = await res.json().catch(() => null)
    // Post-body-consumption epoch gate (defense-in-depth follow-up to #389's composed
    // review): a session boundary landing during this await still belongs to a DEAD
    // session by the time we reach the throw - re-check so the stale 401's ApiError
    // can never be delivered to a caller that has already moved to a new session.
    assertEpoch(capturedEpoch)
    throw new ApiError(401, body)
  }

  // Transport-layer epoch guard (design spec §4.2): after ANY terminal resolution
  // (success or a non-401 error), an old-session response can never be delivered to
  // a caller once a session boundary has happened mid-flight - discard it in favour
  // of a synthetic SESSION_SWITCHED error (status 0; never delivered as data).
  assertEpoch(capturedEpoch)

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    // Post-body-consumption epoch gate (defense-in-depth follow-up to #389's composed
    // review): mirrors the success-path re-check in apiFetch/apiFetchRaw below - an
    // old-session error body must not reach the caller as a delivered ApiError once a
    // boundary has landed while the body was still being read.
    assertEpoch(capturedEpoch)
    throw new ApiError(res.status, body)
  }
  return { res, capturedEpoch }
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { res, capturedEpoch } = await apiFetchResponse(path, options)
  if (res.status === 204) return undefined as T
  // guardStaleReject: if res.json() itself REJECTS (malformed JSON / truncated body)
  // and the epoch moved during that await, surface SESSION_SWITCHED instead of the
  // raw parse error - a dead session must not throw anything but SESSION_SWITCHED to
  // a caller that has already moved to a new session. Same-epoch parse failures
  // rethrow the original error unchanged (behavior-preserving).
  const data = (await guardStaleReject(res.json(), capturedEpoch)) as T
  // Correction 3 (post-body epoch gate): re-check AFTER JSON body consumption, not
  // only after fetch returned headers. A session boundary that lands while the body
  // is still streaming must still abort the pre-side-effect delivery - the parsed
  // old-session payload is discarded rather than handed to the caller.
  assertEpoch(capturedEpoch)
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
    assertEpoch(capturedEpoch)
    return res
  }
  // guardStaleReject: if res.arrayBuffer() itself REJECTS (stream error / aborted
  // download) and the epoch moved during that await, surface SESSION_SWITCHED instead
  // of the raw read error, mirroring apiFetch's guarded JSON read above. Same-epoch
  // read failures rethrow the original error unchanged (behavior-preserving).
  const buffered = await guardStaleReject(res.arrayBuffer(), capturedEpoch)
  assertEpoch(capturedEpoch)
  return new Response(buffered, { status: res.status, statusText: res.statusText, headers: res.headers })
}
