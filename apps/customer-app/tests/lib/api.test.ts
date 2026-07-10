import { api, ApiClientError } from '@/lib/api'

const originalFetch = global.fetch

describe('api client', () => {
  afterEach(() => { global.fetch = originalFetch })

  it('attaches Authorization bearer when access token is set', async () => {
    api.__setTokensForTests('ACCESS', 'REFRESH')
    const calls: RequestInit[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    await api.get('/thing')
    expect((calls[0]!.headers as Record<string, string>)['Authorization']).toBe('Bearer ACCESS')
  })

  it('refreshes on 401 and retries once', async () => {
    // sessionId + entityId are required for the refresh body shape (see
    // tests/lib/api.refresh.test.ts for the full contract). Without
    // them set, the 401 retry path skips refresh entirely.
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    let calls = 0
    global.fetch = jest.fn(async (url: string) => {
      calls++
      if (calls === 1) return new Response('{}', { status: 401 })
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'NEW', refreshToken: 'NEW_R' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const res = await api.get<{ ok: boolean }>('/thing')
    expect(res.ok).toBe(true)
  })

  it('throws ApiClientError with code + status on non-2xx', async () => {
    api.__setTokensForTests('A', 'R')
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ code: 'EMAIL_TAKEN', message: 'x' }), { status: 400, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    await expect(api.post('/x', {})).rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 400 })
  })

  // Regression: Fastify's body parser throws FST_ERR_CTP_EMPTY_JSON_BODY when
  // `Content-Type: application/json` is announced with an empty body. This
  // surfaced as a 500 toast on bodyless DELETEs (delete-review) and bodyless
  // POSTs (favourite add). Pin: bodyless requests must NOT set Content-Type.
  it('does not set Content-Type on bodyless DELETE', async () => {
    api.__setTokensForTests('A', 'R')
    const calls: RequestInit[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    await api.del('/api/v1/customer/branches/b1/reviews/r1')
    const headers = calls[0]!.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('does not set Content-Type on bodyless POST (favourite add)', async () => {
    api.__setTokensForTests('A', 'R')
    const calls: RequestInit[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    await api.post('/api/v1/customer/favourites/merchants/m1', undefined)
    const headers = calls[0]!.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('does not set Content-Type on GET', async () => {
    api.__setTokensForTests('A', 'R')
    const calls: RequestInit[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    await api.get('/anything')
    const headers = calls[0]!.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('sets Content-Type:application/json when a body is present', async () => {
    api.__setTokensForTests('A', 'R')
    const calls: RequestInit[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    await api.post('/x', { foo: 'bar' })
    const headers = calls[0]!.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  // ── ApiClientError.details (Voucher Detail M2 Section B prep) ────────
  // Mirrors the AppError(code, details?) extension on the backend so
  // INVALID_PIN.remainingAttempts and PIN_RATE_LIMIT_EXCEEDED.retryAfter
  // flow through to typed customer-app code without a separate raw fetch.

  it('captures non-standard error fields from the envelope into ApiClientError.details', async () => {
    api.__setTokensForTests('A', 'R')
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({
        error: { code: 'INVALID_PIN', message: 'Wrong PIN', statusCode: 400, remainingAttempts: 3 }
      }), { status: 400, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch

    try {
      await api.post('/api/v1/redemption', { voucherId: 'v', branchId: 'b', pin: '1234' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError)
      const e = err as ApiClientError
      expect(e.code).toBe('INVALID_PIN')
      expect(e.status).toBe(400)
      expect(e.details).toEqual({ remainingAttempts: 3 })
    }
  })

  it('captures retryAfter on rate-limit error', async () => {
    api.__setTokensForTests('A', 'R')
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({
        error: { code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'Locked', statusCode: 429, retryAfter: 540 }
      }), { status: 429, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch

    try {
      await api.post('/api/v1/redemption', {})
    } catch (err) {
      expect((err as ApiClientError).details).toEqual({ retryAfter: 540 })
    }
  })

  it('details is undefined when envelope has only standard fields', async () => {
    api.__setTokensForTests('A', 'R')
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({
        error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Subscribe', statusCode: 403 }
      }), { status: 403, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch

    try {
      await api.post('/api/v1/redemption', {})
    } catch (err) {
      const e = err as ApiClientError
      expect(e.code).toBe('SUBSCRIPTION_REQUIRED')
      expect(e.details).toBeUndefined()
    }
  })

  it('preserves backward-compat: error.field still surfaces on top-level property, not in details', async () => {
    api.__setTokensForTests('A', 'R')
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({
        error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Used', statusCode: 409, field: 'email' }
      }), { status: 409, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch

    try {
      await api.post('/api/v1/auth/register', {})
    } catch (err) {
      const e = err as ApiClientError
      expect(e.field).toBe('email')
      // `field` extracted to its own property; not duplicated into details.
      expect(e.details).toBeUndefined()
    }
  })

  // ── Map Phase 2 S2 — AbortSignal support ──────────────────────────────

  it('api.get passes opts.signal through to fetch', async () => {
    api.__setTokensForTests('A', 'R')
    const calls: RequestInit[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const controller = new AbortController()
    await api.get('/thing', { signal: controller.signal })
    expect(calls[0]!.signal).toBe(controller.signal)
  })

  it('api.get omits signal from the fetch init when no opts are passed (backward compat)', async () => {
    api.__setTokensForTests('A', 'R')
    const calls: RequestInit[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    await api.get('/thing')
    expect(calls[0]!.signal).toBeUndefined()
  })

  it('an aborted fetch rejects with AbortError and does not touch the 401/refresh path', async () => {
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException('Aborted', 'AbortError')
    let fetchCalls = 0
    global.fetch = jest.fn(async () => {
      fetchCalls++
      throw abortError
    }) as unknown as typeof fetch

    await expect(api.get('/thing', { signal: controller.signal })).rejects.toBe(abortError)
    // Exactly one fetch call — the abort rejection must NOT trigger the
    // refresh-token round-trip (which would be a second call to
    // /auth/refresh) or any retry of the original request.
    expect(fetchCalls).toBe(1)
  })

  it('an aborted fetch does not clear tokens or fire onSessionExpired', async () => {
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    const abortError = new DOMException('Aborted', 'AbortError')
    global.fetch = jest.fn(async () => { throw abortError }) as unknown as typeof fetch
    const onSessionExpired = jest.fn()
    api.onSessionExpired(onSessionExpired)

    await expect(api.get('/thing', { signal: new AbortController().signal })).rejects.toBe(abortError)
    expect(onSessionExpired).not.toHaveBeenCalled()

    // A subsequent normal request still carries the ORIGINAL bearer token
    // (tokens were not cleared by the abort).
    const calls: RequestInit[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    await api.get('/thing')
    expect((calls[0]!.headers as Record<string, string>)['Authorization']).toBe('Bearer STALE')

    // Reset the module-level subscriber so later tests in this file don't
    // pick up a stale handler (onSessionExpired is single-subscriber).
    api.onSessionExpired(() => {})
  })

  it('mixed payload — field plus details fields both surface correctly', async () => {
    api.__setTokensForTests('A', 'R')
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({
        error: { code: 'CUSTOM', message: 'x', statusCode: 400, field: 'pin', remainingAttempts: 2 }
      }), { status: 400, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch

    try {
      await api.post('/x', {})
    } catch (err) {
      const e = err as ApiClientError
      expect(e.field).toBe('pin')
      expect(e.details).toEqual({ remainingAttempts: 2 })
    }
  })
})
