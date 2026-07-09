/**
 * client.ts — bearer attachment + the 401 refresh-once-retry contract (H5
 * migration: refresh now goes through the same-origin BFF route
 * `/api/admin-auth/refresh`, no body, no bearer — the httpOnly cookie carries
 * the refresh material server-side).
 *
 * fetch is mocked; session/tokenStore helpers are the real in-memory ones.
 */
import { apiFetch, ApiError } from '../client'
import { setSession, getAccessToken } from '@/lib/auth/session'
import { setAccessToken as setStoredAccessToken, setOnSessionLost } from '@/lib/auth/tokenStore'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

let fetchMock: jest.Mock
let assignMock: jest.Mock

beforeEach(() => {
  setOnSessionLost(null)
  // Reset the token store directly rather than via clearSession() (which would
  // fire tokenStore's no-handler-registered fallback, window.location.assign,
  // against jsdom's real navigation — not what these tests are about). A
  // truthy set re-arms the hard-logout latch, then null clears the token.
  setStoredAccessToken('reset-arm')
  setStoredAccessToken(null)
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch

  // Make window.location.assign spy-able (jsdom's is non-configurable).
  // pathname/search are read by redirectToLogin to build the ?next= return path.
  assignMock = jest.fn()
  Object.defineProperty(window, 'location', {
    value: { assign: assignMock, href: '', pathname: '/queue/abc', search: '' },
    writable: true,
  })
})

describe('apiFetch — basics', () => {
  it('prefixes the base URL and parses JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    const out = await apiFetch<{ ok: boolean }>('/api/v1/ping')
    expect(out).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/ping',
      expect.any(Object)
    )
  })

  it('attaches the bearer token when auth: true', async () => {
    setSession('ACCESS-1')
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: 1 }))

    await apiFetch('/api/v1/admin/thing', { auth: true })

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer ACCESS-1')
  })

  it('does NOT attach a bearer when auth is omitted', async () => {
    setSession('ACCESS-1')
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}))

    await apiFetch('/api/v1/public')

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers
    expect(headers.get('Authorization')).toBeNull()
  })

  it('throws a typed ApiError from { error: { code, message } }', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: { code: 'OTP_INVALID', message: 'bad code', statusCode: 400 },
      })
    )
    await expect(apiFetch('/api/v1/x', { method: 'POST', body: '{}' })).rejects.toMatchObject(
      { code: 'OTP_INVALID', status: 400, statusCode: 400 }
    )
  })
})

describe('apiFetch — 401 refresh-once-retry via the BFF route', () => {
  it('on 401 refreshes once via /api/admin-auth/refresh (no body, no bearer) and retries the original request', async () => {
    setSession('OLD')

    fetchMock
      // 1) original request -> 401
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      // 2) BFF refresh -> new access token
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'NEW' }))
      // 3) retried original -> success
      .mockResolvedValueOnce(jsonResponse(200, { data: 'ok' }))

    const out = await apiFetch<{ data: string }>('/api/v1/admin/thing', { auth: true })

    expect(out).toEqual({ data: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // The refresh call hit the SAME-ORIGIN BFF route, not the backend directly.
    expect(fetchMock.mock.calls[1][0]).toBe('/api/admin-auth/refresh')
    const refreshInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(refreshInit.method).toBe('POST')
    expect(refreshInit.body).toBeUndefined() // no body — the httpOnly cookie carries the material
    expect((refreshInit.headers as Headers | undefined)?.get?.('Authorization')).toBeFalsy() // no bearer sent

    // The retried request carried the NEW access token.
    const retryHeaders = (fetchMock.mock.calls[2][1] as RequestInit).headers as Headers
    expect(retryHeaders.get('Authorization')).toBe('Bearer NEW')

    // Stored token was rotated.
    expect(getAccessToken()).toBe('NEW')

    // No redirect happened.
    expect(assignMock).not.toHaveBeenCalled()
  })

  it('hard-logs-out when the retried request STILL 401s after a successful refresh', async () => {
    // The token was refreshed successfully, but the very next call with the
    // fresh token still 401s (e.g. the account was suspended mid-session). The
    // session is genuinely dead -> clear + redirect, not a bare thrown error.
    setSession('OLD')

    fetchMock
      // 1) original -> 401
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      // 2) BFF refresh -> new access token (success)
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'NEW' }))
      // 3) retried original with NEW -> STILL 401
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'ACCOUNT_SUSPENDED' } }))

    await expect(apiFetch('/api/v1/admin/thing', { auth: true })).rejects.toBeInstanceOf(
      ApiError
    )

    expect(fetchMock).toHaveBeenCalledTimes(3) // original, refresh, retry — no fourth refresh
    expect(getAccessToken()).toBeNull() // session cleared
    expect(assignMock).toHaveBeenCalledWith('/login?next=%2Fqueue%2Fabc')
  })

  it('clears the session and redirects to /login when the BFF refresh fails', async () => {
    setSession('OLD')

    fetchMock
      // 1) original -> 401
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      // 2) BFF refresh -> 401 (no cookie / dead session)
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'REFRESH_TOKEN_INVALID' } }))

    await expect(apiFetch('/api/v1/admin/thing', { auth: true })).rejects.toBeInstanceOf(
      ApiError
    )

    expect(fetchMock).toHaveBeenCalledTimes(2) // no third (retry) call
    expect(getAccessToken()).toBeNull() // session cleared
    // Captures the current location into ?next= so login can return the user.
    expect(assignMock).toHaveBeenCalledWith('/login?next=%2Fqueue%2Fabc')
  })

  it('clears the session when the BFF refresh responds 200 but omits accessToken (contract drift)', async () => {
    setSession('OLD')
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      .mockResolvedValueOnce(jsonResponse(200, {}))

    await expect(apiFetch('/api/v1/admin/thing', { auth: true })).rejects.toBeInstanceOf(ApiError)
    expect(getAccessToken()).toBeNull()
    expect(assignMock).toHaveBeenCalled()
  })

  it('captures pathname + search in ?next= when redirecting to login', async () => {
    // Already on a deep page WITH a query string -> the whole thing round-trips.
    Object.defineProperty(window, 'location', {
      value: { assign: assignMock, href: '', pathname: '/merchants', search: '?focus=m-1' },
      writable: true,
    })
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))

    await expect(apiFetch('/api/v1/admin/thing', { auth: true })).rejects.toBeInstanceOf(
      ApiError
    )

    expect(assignMock).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent('/merchants?focus=m-1')}`
    )
  })

  it('does NOT round-trip the login page itself into ?next= (no loop)', async () => {
    // Already on /login -> redirect plainly, never /login?next=/login.
    Object.defineProperty(window, 'location', {
      value: { assign: assignMock, href: '', pathname: '/login', search: '' },
      writable: true,
    })
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))

    await expect(apiFetch('/api/v1/admin/thing', { auth: true })).rejects.toBeInstanceOf(
      ApiError
    )

    expect(assignMock).toHaveBeenCalledWith('/login')
  })

  it('does not refresh on a 401 for an unauthenticated (auth: false) request', async () => {
    setSession('OLD')
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'NOPE' } }))

    await expect(apiFetch('/api/v1/public')).rejects.toBeInstanceOf(ApiError)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(assignMock).not.toHaveBeenCalled()
  })

  it('coalesces concurrent 401s into a SINGLE refresh (no single-use-token race)', async () => {
    setSession('OLD')

    // URL-aware mock (concurrent awaits make strict call ordering
    // nondeterministic): every authed request 401s the first time it is seen
    // with the OLD token, then succeeds once the bearer is the NEW token; the
    // BFF refresh route succeeds exactly once and installs the new token.
    let refreshCalls = 0
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url === '/api/admin-auth/refresh') {
        refreshCalls += 1
        return Promise.resolve(jsonResponse(200, { accessToken: 'NEW' }))
      }
      const auth = (init.headers as Headers).get('Authorization')
      if (auth === 'Bearer NEW') {
        return Promise.resolve(jsonResponse(200, { data: 'ok' }))
      }
      // OLD (or missing) bearer -> 401 to trigger the refresh path.
      return Promise.resolve(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
    })

    // Two authed requests 401 concurrently; both should ride ONE shared refresh.
    const [a, b] = await Promise.all([
      apiFetch<{ data: string }>('/api/v1/admin/alpha', { auth: true }),
      apiFetch<{ data: string }>('/api/v1/admin/beta', { auth: true }),
    ])

    expect(a).toEqual({ data: 'ok' })
    expect(b).toEqual({ data: 'ok' })

    // The crux: the single-use refresh token was hit exactly once.
    expect(refreshCalls).toBe(1)
    const refreshHits = fetchMock.mock.calls.filter((c) => c[0] === '/api/admin-auth/refresh')
    expect(refreshHits).toHaveLength(1)

    // Neither concurrent call cleared the session or redirected.
    expect(getAccessToken()).toBe('NEW')
    expect(assignMock).not.toHaveBeenCalled()
  })
})
