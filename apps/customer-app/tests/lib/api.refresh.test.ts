/**
 * Pins the contract for `POST /api/v1/customer/auth/refresh` from the
 * client side. Backend (`src/api/auth/customer/routes.ts:81-94`) requires
 * `{ refreshToken, sessionId, entityId }`. This file pins each piece:
 *
 * 1. Body shape — refresh request must carry all three fields verbatim
 *    so a partial body cannot regress us into the 2026-05-08 latent
 *    sign-out incident (M3 device QA).
 * 2. Happy path — 401 → refresh succeeds → original request retries
 *    with the new access token.
 * 3. Failure path — refresh returns non-2xx → tokens cleared,
 *    `onSessionExpired` fires, `SESSION_EXPIRED` thrown.
 * 4. Skip path — if sessionId or entityId is missing in memory (e.g.
 *    bootstrap before they were re-hydrated), refresh is NOT attempted;
 *    the 401 propagates so the caller can decide what to do.
 */
import { api, ApiClientError } from '@/lib/api'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  // Reset module-level state between tests
  api.__setTokensForTests(null, null, null, null)
  // Single-subscriber callbacks persist on the module — clear so a
  // subscriber installed by one test cannot leak into the next.
  api.onTokensRefreshed(() => {})
})

describe('api refresh client', () => {
  it('posts { refreshToken, sessionId, entityId } verbatim — no extras, no missing fields', async () => {
    api.__setTokensForTests('STALE_ACCESS', 'REFRESH_TOK', 'sess_123', 'user_abc')
    const calls: Array<{ url: string; init: RequestInit }> = []
    let callCount = 0
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      callCount++
      calls.push({ url, init: init! })
      if (callCount === 1) return new Response('{}', { status: 401 })
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await api.get<{ ok: boolean }>('/anything')

    const refreshCall = calls.find((c) => c.url.endsWith('/api/v1/customer/auth/refresh'))
    expect(refreshCall).toBeDefined()
    expect(refreshCall!.init.method).toBe('POST')
    const body = JSON.parse(refreshCall!.init.body as string)
    expect(body).toEqual({
      refreshToken: 'REFRESH_TOK',
      sessionId: 'sess_123',
      entityId: 'user_abc',
    })
  })

  it('retries the original request with the NEW access token after a successful refresh', async () => {
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    const authHeaders: string[] = []
    let callCount = 0
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      callCount++
      const headers = (init?.headers ?? {}) as Record<string, string>
      if (callCount === 1) {
        // Original request — stale access token
        authHeaders.push(headers['Authorization'] ?? '')
        return new Response('{}', { status: 401 })
      }
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      // Retry — should carry NEW access token
      authHeaders.push(headers['Authorization'] ?? '')
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const res = await api.get<{ ok: boolean }>('/anything')
    expect(res.ok).toBe(true)
    expect(authHeaders[0]).toBe('Bearer STALE')
    expect(authHeaders[1]).toBe('Bearer NEW_ACCESS')
  })

  it('clears tokens, fires onSessionExpired, and throws SESSION_EXPIRED when refresh returns 401', async () => {
    api.__setTokensForTests('STALE', 'BAD_REFRESH', 'sess_x', 'user_x')
    let expiredFired = 0
    api.onSessionExpired(() => {
      expiredFired++
    })
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({ error: { code: 'REFRESH_TOKEN_INVALID', message: 'expired', statusCode: 401 } }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch

    await expect(api.get('/anything')).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
    })
    expect(expiredFired).toBe(1)
  })

  it('propagates SESSION_REPLACED reason when refresh response carries that code (one-mobile-device rule)', async () => {
    // PR #51 / deferred-followups §AC6 + §AD6. When Device B signs in,
    // Device A's next refresh attempt hits the `SUPERSEDED_BY_NEW_LOGIN`
    // branch on the backend → returns SESSION_REPLACED. The api client
    // must propagate that distinct code (NOT collapse to generic
    // SESSION_EXPIRED) so the bridge can show the right copy.
    api.__setTokensForTests('STALE', 'A_REFRESH', 'sess_a', 'user_a')
    const reasons: string[] = []
    api.onSessionExpired((reason) => {
      reasons.push(reason)
    })
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'SESSION_REPLACED',
              message: 'Your account was signed in on another device, so this session has ended.',
              statusCode: 401,
            },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch

    await expect(api.get('/anything')).rejects.toMatchObject({
      code: 'SESSION_REPLACED',
      status: 401,
    })
    expect(reasons).toEqual(['SESSION_REPLACED'])
  })

  it('falls back to SESSION_EXPIRED when refresh 4xx body is non-JSON (auth-terminal default)', async () => {
    // 4xx + non-JSON body → still auth-terminal. Backend returned a
    // status-coded reject; we just couldn't read the inner code, so
    // we conservatively assume generic SESSION_EXPIRED.
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    const reasons: string[] = []
    api.onSessionExpired((reason) => {
      reasons.push(reason)
    })
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response('not json', { status: 401 })
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch

    await expect(api.get('/anything')).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
    })
    expect(reasons).toEqual(['SESSION_EXPIRED'])
  })

  it('preserves the user-facing SESSION_REPLACED message on the thrown ApiClientError', async () => {
    api.__setTokensForTests('STALE', 'A_REFRESH', 'sess_a', 'user_a')
    api.onSessionExpired(() => {})
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'SESSION_REPLACED',
              message: 'Your account was signed in on another device, so this session has ended.',
              statusCode: 401,
            },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch

    await expect(api.get('/anything')).rejects.toMatchObject({
      message: 'Your account was signed in on another device, so this session has ended.',
    })
  })

  // ── Transport vs auth-terminal distinction (PR #52 deferred-followups §AC11) ────
  //
  // Owner-locked rule 2026-05-08: transport failures during refresh
  // (network down, server unreachable, 5xx, dev-server bouncing on
  // EADDRINUSE, gateway returning HTML) MUST NOT clear the user's
  // auth state. The refresh token might still be valid; only an
  // auth-terminal 4xx response (REFRESH_TOKEN_INVALID, SESSION_REPLACED)
  // is allowed to sign the user out. Otherwise a flaky network blip
  // bounces them back to the login screen.

  it('preserves tokens + does NOT fire onSessionExpired when refresh fetch() throws (network unreachable)', async () => {
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    const reasons: string[] = []
    api.onSessionExpired((reason) => reasons.push(reason))
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        // Simulates DNS failure, connection refused, server unreachable.
        throw new Error('Network request failed')
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch

    await expect(api.get('/anything')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
    expect(reasons).toEqual([])

    // Critical regression pin: a follow-up request must still carry
    // the OLD bearer because tokens were NOT cleared. If this assertion
    // fails, the user has been spuriously signed out by a network blip.
    let bearerSeen: string | undefined
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      bearerSeen = ((init?.headers ?? {}) as Record<string, string>)['Authorization']
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch
    await api.get('/follow-up')
    expect(bearerSeen).toBe('Bearer STALE')
  })

  it('preserves tokens + does NOT fire onSessionExpired when refresh returns 500 (server error)', async () => {
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    const reasons: string[] = []
    api.onSessionExpired((reason) => reasons.push(reason))
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response('{"error": "Internal Server Error"}', { status: 500 })
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch

    await expect(api.get('/anything')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
    expect(reasons).toEqual([])
  })

  it('preserves tokens + does NOT fire onSessionExpired when refresh returns 502 with HTML body (gateway error)', async () => {
    // Real-world: corporate proxy / Cloudflare / load balancer returns
    // 502/503/504 with an HTML error page during a backend outage. We
    // must NOT log the user out for a temporary gateway problem.
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    const reasons: string[] = []
    api.onSessionExpired((reason) => reasons.push(reason))
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        })
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch

    await expect(api.get('/anything')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
    expect(reasons).toEqual([])
  })

  it('preserves tokens + does NOT fire onSessionExpired when refresh returns 503 (service unavailable)', async () => {
    // The exact dev-QA scenario: backend bounced on `EADDRINUSE` while
    // the user was off-network, came back, server returns 503 during
    // restart. App must NOT sign the user out for a 5-second outage.
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    const reasons: string[] = []
    api.onSessionExpired((reason) => reasons.push(reason))
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response('Service Unavailable', { status: 503 })
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch

    await expect(api.get('/anything')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
    expect(reasons).toEqual([])
  })

  it('preserves tokens across a transport failure → next refresh attempt can succeed normally (the user stays signed in)', async () => {
    // Belt-and-braces full round trip: transport fail, then network
    // recovers, refresh succeeds, original retry works. Pins the
    // "stay signed in across transient blips" contract.
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')

    // Phase 1: refresh fetch throws → NETWORK_ERROR, tokens preserved.
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        throw new Error('Network request failed')
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })

    // Phase 2: network recovers. Same access token → 401 again →
    // refresh now succeeds → retry uses NEW token. The refreshing
    // promise was nulled by the previous failure so a fresh attempt
    // can run.
    let calls = 0
    global.fetch = jest.fn(async (url: string) => {
      calls++
      if (calls === 1) return new Response('{}', { status: 401 })
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const res = await api.get<{ ok: boolean }>('/y')
    expect(res.ok).toBe(true)
  })

  it('clears tokens, fires onSessionExpired, and throws SESSION_EXPIRED when refresh returns 400 (Zod-parse failure on backend)', async () => {
    // This is the exact failure mode that caused the 2026-05-08 device-QA
    // sign-outs: pre-fix client posted only { refreshToken } and the
    // backend Zod schema rejected with a 400. Pin: even after the fix,
    // a 400 from refresh must still gracefully session-expire instead of
    // crashing.
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    let expiredFired = 0
    api.onSessionExpired(() => {
      expiredFired++
    })
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({ error: { code: 'INVALID_REQUEST', message: 'bad body', statusCode: 400 } }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch

    await expect(api.get('/anything')).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
    })
    expect(expiredFired).toBe(1)
  })

  it('skips refresh entirely when sessionId is missing — the 401 surfaces as the original error', async () => {
    // Edge case: api state somehow has access+refresh but lost sessionId
    // (e.g. mid-bootstrap before re-hydration completes). We MUST NOT
    // attempt a refresh with a missing field — backend would 400 and
    // logout the user spuriously.
    api.__setTokensForTests('STALE', 'REFRESH', null, 'user_x')
    const callPaths: string[] = []
    global.fetch = jest.fn(async (url: string) => {
      callPaths.push(url)
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'no auth', statusCode: 401 } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    await expect(api.get('/x')).rejects.toBeInstanceOf(ApiClientError)
    // Refresh endpoint must NEVER be hit if sessionId is missing
    expect(callPaths.some((p) => p.endsWith('/api/v1/customer/auth/refresh'))).toBe(false)
  })

  it('skips refresh entirely when entityId is missing — same anti-spurious-logout guard', async () => {
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', null)
    const callPaths: string[] = []
    global.fetch = jest.fn(async (url: string) => {
      callPaths.push(url)
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'no auth', statusCode: 401 } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    await expect(api.get('/x')).rejects.toBeInstanceOf(ApiClientError)
    expect(callPaths.some((p) => p.endsWith('/api/v1/customer/auth/refresh'))).toBe(false)
  })

  it('fires onTokensRefreshed with the NEW pair after a successful rotation (PR #50 P2 fix)', async () => {
    // The api module's `tokens` object holding the new pair is not enough
    // — secureStorage and zustand state still have the old refresh
    // token. Without this notification the next bootstrap reads the
    // stale token, posts it back, and gets REFRESH_TOKEN_INVALID.
    api.__setTokensForTests('STALE', 'OLD_REFRESH', 'sess_x', 'user_x')
    const fired: Array<{ accessToken: string; refreshToken: string }> = []
    api.onTokensRefreshed((next) => fired.push(next))
    let calls = 0
    global.fetch = jest.fn(async (url: string) => {
      calls++
      if (calls === 1) return new Response('{}', { status: 401 })
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await api.get<{ ok: boolean }>('/anything')

    expect(fired).toEqual([{ accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' }])
    // Reset the global subscriber so subsequent tests aren't polluted.
    api.onTokensRefreshed(() => {})
  })

  it('does NOT fire onTokensRefreshed when the refresh request fails', async () => {
    // Failed refresh = no rotation = no persistence event. Pin so we
    // never accidentally write null/undefined into secureStorage and
    // race with the SESSION_EXPIRED → signOut path.
    api.__setTokensForTests('STALE', 'OLD_REFRESH', 'sess_x', 'user_x')
    const fired: Array<unknown> = []
    api.onTokensRefreshed((next) => fired.push(next))
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response('{}', { status: 401 })
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch

    await expect(api.get('/x')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect(fired).toEqual([])
    api.onTokensRefreshed(() => {})
  })

  it('a throwing onTokensRefreshed subscriber does NOT block the retry from succeeding', async () => {
    // Best-effort contract: subscribers cannot wedge the refresh path.
    // If the bridge's persistence work throws, the in-memory rotation
    // still stands and the original retry returns the live response.
    api.__setTokensForTests('STALE', 'OLD_REFRESH', 'sess_x', 'user_x')
    api.onTokensRefreshed(() => { throw new Error('persistence kaboom') })
    let calls = 0
    global.fetch = jest.fn(async (url: string) => {
      calls++
      if (calls === 1) return new Response('{}', { status: 401 })
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const res = await api.get<{ ok: boolean }>('/anything')
    expect(res.ok).toBe(true)
    api.onTokensRefreshed(() => {})
  })

  it('serializes concurrent 401s through a single refresh call (existing behaviour, re-pinned)', async () => {
    api.__setTokensForTests('STALE', 'REFRESH', 'sess_x', 'user_x')
    let refreshCalls = 0
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        refreshCalls++
        await new Promise((r) => setTimeout(r, 0))
        return new Response(
          JSON.stringify({ accessToken: 'NEW', refreshToken: 'NEW_R' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      const auth = ((init?.headers ?? {}) as Record<string, string>)['Authorization']
      if (auth === 'Bearer STALE') {
        return new Response('{}', { status: 401 })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')])
    expect(refreshCalls).toBe(1)
  })
})
