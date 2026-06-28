/**
 * @jest-environment node
 */
import { apiFetch, apiFetchRaw, ApiError } from '@/lib/api/client'
import { getAccessToken, setAccessToken, setOnSessionLost } from '@/lib/auth/tokenStore'

function jsonRes(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response
}

describe('apiFetch (M1 Slice 1 BFF-lite client)', () => {
  beforeEach(() => {
    setAccessToken(null)
    setOnSessionLost(null)
    jest.restoreAllMocks()
  })

  it('parses ApiError from the nested envelope, the flat shape, and the fastify default 429 string', () => {
    expect(new ApiError(400, { error: { code: 'OTP_INVALID', message: 'bad code' } }).code).toBe('OTP_INVALID')
    expect(new ApiError(409, { code: 'X', message: 'flat' }).code).toBe('X')
    const edge429 = new ApiError(429, { statusCode: 429, error: 'Too Many Requests', message: 'slow down' })
    expect(edge429.status).toBe(429)
    expect(edge429.code).toBeUndefined() // edge limiter has no nested error.code; FE keys off status 429
    expect(edge429.message).toBe('Too Many Requests') // string `error` field takes precedence over `message`
  })

  it('attaches the in-memory bearer token and returns json on success', async () => {
    setAccessToken('tok')
    const fetchMock = jest.fn(async () => jsonRes(200, { ok: 1 }))
    global.fetch = fetchMock as unknown as typeof fetch
    const r = await apiFetch<{ ok: number }>('/x', { auth: true })
    expect(r.ok).toBe(1)
    const headers = ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok')
  })

  it('on a 401 refreshes ONCE via the BFF and retries the original request', async () => {
    setAccessToken('expired')
    let profileCalls = 0
    global.fetch = jest.fn(async (url: unknown) => {
      const u = String(url)
      if (u.endsWith('/api/merchant-auth/refresh')) return jsonRes(200, { accessToken: 'fresh' })
      profileCalls += 1
      return profileCalls === 1 ? jsonRes(401, {}) : jsonRes(200, { ok: 1 })
    }) as unknown as typeof fetch
    const r = await apiFetch<{ ok: number }>('/profile', { auth: true })
    expect(r.ok).toBe(1)
    expect(getAccessToken()).toBe('fresh')
  })

  it('hard-logout when refresh fails: clears the token, fires onSessionLost ONCE, and does NOT loop', async () => {
    setAccessToken('expired')
    const lost = jest.fn()
    setOnSessionLost(lost)
    let refreshCalls = 0
    global.fetch = jest.fn(async (url: unknown) => {
      if (String(url).endsWith('/api/merchant-auth/refresh')) {
        refreshCalls += 1
        return jsonRes(401, {})
      }
      return jsonRes(401, { error: { code: 'SESSION_REVOKED' } })
    }) as unknown as typeof fetch
    await expect(apiFetch('/profile', { auth: true })).rejects.toBeInstanceOf(ApiError)
    expect(refreshCalls).toBe(1)
    expect(getAccessToken()).toBeNull()
    expect(lost).toHaveBeenCalledTimes(1)
  })

  it('single-flight: two concurrent 401s share ONE refresh (single-use rotation safe)', async () => {
    setAccessToken('expired')
    let refreshCalls = 0
    global.fetch = jest.fn(async (url: unknown) => {
      if (String(url).endsWith('/api/merchant-auth/refresh')) {
        refreshCalls += 1
        await new Promise((r) => setTimeout(r, 10))
        return jsonRes(200, { accessToken: 'fresh' })
      }
      return getAccessToken() === 'fresh' ? jsonRes(200, { ok: 1 }) : jsonRes(401, {})
    }) as unknown as typeof fetch
    await Promise.all([apiFetch('/a', { auth: true }), apiFetch('/b', { auth: true })])
    expect(refreshCalls).toBe(1)
  })

  it('does NOT refresh on a 401 for a non-auth request', async () => {
    const fetchMock = jest.fn(async () => jsonRes(401, { error: { code: 'WHATEVER' } }))
    global.fetch = fetchMock as unknown as typeof fetch
    await expect(apiFetch('/public', {})).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1) // no refresh attempt
  })
})

// apiFetchRaw shares the SAME auth lifecycle as apiFetch (it is the non-JSON-parsing
// variant used by the gated CSV export). These pins prove the export download gets
// refresh-once + session-lost teardown + typed ApiError, not a weaker hand-rolled fetch.
describe('apiFetchRaw (raw-Response variant for non-JSON downloads)', () => {
  beforeEach(() => {
    setAccessToken(null)
    setOnSessionLost(null)
    jest.restoreAllMocks()
  })

  it('resolves to the RAW Response on success and attaches the bearer token', async () => {
    setAccessToken('tok')
    const res = jsonRes(200, { ok: 1 })
    const fetchMock = jest.fn(async () => res)
    global.fetch = fetchMock as unknown as typeof fetch
    const out = await apiFetchRaw('/export.csv', { auth: true })
    expect(out).toBe(res) // the raw Response, NOT parsed json
    const headers = ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok')
  })

  it('on a 401 refreshes ONCE and retries, returning the retried raw Response', async () => {
    setAccessToken('expired')
    let exportCalls = 0
    const okRes = jsonRes(200, { ok: 1 })
    global.fetch = jest.fn(async (url: unknown) => {
      const u = String(url)
      if (u.endsWith('/api/merchant-auth/refresh')) return jsonRes(200, { accessToken: 'fresh' })
      exportCalls += 1
      return exportCalls === 1 ? jsonRes(401, {}) : okRes
    }) as unknown as typeof fetch
    const out = await apiFetchRaw('/export.csv', { auth: true })
    expect(out).toBe(okRes)
    expect(exportCalls).toBe(2)
    expect(getAccessToken()).toBe('fresh')
  })

  it('hard-logout when refresh fails: clears the token, fires onSessionLost ONCE, throws ApiError', async () => {
    setAccessToken('expired')
    const lost = jest.fn()
    setOnSessionLost(lost)
    let refreshCalls = 0
    global.fetch = jest.fn(async (url: unknown) => {
      if (String(url).endsWith('/api/merchant-auth/refresh')) {
        refreshCalls += 1
        return jsonRes(401, {})
      }
      return jsonRes(401, { error: { code: 'SESSION_REVOKED' } })
    }) as unknown as typeof fetch
    await expect(apiFetchRaw('/export.csv', { auth: true })).rejects.toBeInstanceOf(ApiError)
    expect(refreshCalls).toBe(1)
    expect(getAccessToken()).toBeNull()
    expect(lost).toHaveBeenCalledTimes(1)
  })

  it('throws a typed ApiError on a non-ok response (never returns the Response)', async () => {
    global.fetch = jest.fn(async () =>
      jsonRes(500, { error: { code: 'BOOM' } }),
    ) as unknown as typeof fetch
    await expect(apiFetchRaw('/export.csv', { auth: true })).rejects.toBeInstanceOf(ApiError)
  })
})
