/**
 * client.ts — bearer attachment + the 401 refresh-once-retry contract.
 *
 * fetch is mocked; session helpers are the real localStorage-backed ones.
 */
import { apiFetch, ApiError } from '../client'
import { setSession, getAccessToken, type AdminRole } from '@/lib/auth/session'

const META = {
  entityId: 'admin-1',
  sessionId: 'sess-1',
  adminRole: 'OPERATIONS' as AdminRole,
  email: 'ops@redeemo.co.uk',
}

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
  localStorage.clear()
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch

  // Make window.location.assign spy-able (jsdom's is non-configurable).
  assignMock = jest.fn()
  Object.defineProperty(window, 'location', {
    value: { assign: assignMock, href: '' },
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
    setSession({ accessToken: 'ACCESS-1', refreshToken: 'ref-1', meta: META })
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: 1 }))

    await apiFetch('/api/v1/admin/thing', { auth: true })

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer ACCESS-1')
  })

  it('does NOT attach a bearer when auth is omitted', async () => {
    setSession({ accessToken: 'ACCESS-1', refreshToken: 'ref-1', meta: META })
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

describe('apiFetch — 401 refresh-once-retry', () => {
  it('on 401 refreshes once, rotates tokens, and retries the original request', async () => {
    setSession({ accessToken: 'OLD', refreshToken: 'REF-OLD', meta: META })

    fetchMock
      // 1) original request -> 401
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      // 2) refresh -> new tokens
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'NEW', refreshToken: 'REF-NEW' })
      )
      // 3) retried original -> success
      .mockResolvedValueOnce(jsonResponse(200, { data: 'ok' }))

    const out = await apiFetch<{ data: string }>('/api/v1/admin/thing', { auth: true })

    expect(out).toEqual({ data: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // The refresh call hit the admin refresh endpoint with the stored meta.
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://localhost:3000/api/v1/admin/auth/refresh'
    )
    const refreshBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string
    )
    expect(refreshBody).toEqual({
      refreshToken: 'REF-OLD',
      sessionId: 'sess-1',
      entityId: 'admin-1',
    })

    // The retried request carried the NEW access token.
    const retryHeaders = (fetchMock.mock.calls[2][1] as RequestInit).headers as Headers
    expect(retryHeaders.get('Authorization')).toBe('Bearer NEW')

    // Stored token was rotated.
    expect(getAccessToken()).toBe('NEW')

    // No redirect happened.
    expect(assignMock).not.toHaveBeenCalled()
  })

  it('clears the session and redirects to /login when refresh fails', async () => {
    setSession({ accessToken: 'OLD', refreshToken: 'REF-OLD', meta: META })

    fetchMock
      // 1) original -> 401
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))
      // 2) refresh -> 401 (failure)
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'REFRESH_TOKEN_INVALID' } }))

    await expect(apiFetch('/api/v1/admin/thing', { auth: true })).rejects.toBeInstanceOf(
      ApiError
    )

    expect(fetchMock).toHaveBeenCalledTimes(2) // no third (retry) call
    expect(getAccessToken()).toBeNull() // session cleared
    expect(assignMock).toHaveBeenCalledWith('/login')
  })

  it('does not attempt refresh when there is no session (avoids a loop)', async () => {
    // No setSession -> no refresh token / meta.
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }))

    await expect(apiFetch('/api/v1/admin/thing', { auth: true })).rejects.toBeInstanceOf(
      ApiError
    )

    expect(fetchMock).toHaveBeenCalledTimes(1) // only the original; no refresh call
    expect(assignMock).toHaveBeenCalledWith('/login')
  })

  it('does not refresh on a 401 for an unauthenticated (auth: false) request', async () => {
    setSession({ accessToken: 'OLD', refreshToken: 'REF-OLD', meta: META })
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'NOPE' } }))

    await expect(apiFetch('/api/v1/public')).rejects.toBeInstanceOf(ApiError)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(assignMock).not.toHaveBeenCalled()
  })
})
