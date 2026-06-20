// M1 Slice 1: the merchant access token lives ONLY in memory (module scope), never
// in localStorage. The long-lived refresh material lives in an httpOnly cookie the
// browser JS cannot read. This is the core of the BFF-lite XSS posture: a script
// that runs in the page can read this short-lived (15m) access token but cannot
// read or exfiltrate the refresh token.
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
  // A fresh (non-null) token re-arms the hard-logout latch, so a later dead session
  // can teardown again.
  if (token) sessionLostFired = false
}

// apiFetch triggers a HARD logout when a refresh fails or the backend reports the
// session is dead (SESSION_REVOKED / REFRESH_TOKEN_INVALID / MERCHANT_SUSPENDED).
// The SessionProvider registers a handler that clears React state + router.replace
// to /sign-in. Default fallback (no provider mounted): a full-page nav to /sign-in.
let onSessionLost: (() => void) | null = null

// At-most-once latch: when several authed requests 401 concurrently they each reach
// the hard-logout path after the shared refresh fails. The latch guarantees the
// teardown (router.replace / full-page nav) fires exactly once until a fresh token
// re-arms it, regardless of how many requests failed.
let sessionLostFired = false

export function setOnSessionLost(fn: (() => void) | null): void {
  onSessionLost = fn
}

export function triggerSessionLost(): void {
  if (sessionLostFired) return
  sessionLostFired = true
  if (onSessionLost) {
    onSessionLost()
  } else if (typeof window !== 'undefined') {
    window.location.assign('/sign-in')
  }
}
