/**
 * @jest-environment node
 */
import { apiFetch, apiFetchRaw, ApiError, refreshSession, resetRefreshInFlight } from '@/lib/api/client'
import { getAccessToken, setAccessToken, setOnSessionLost } from '@/lib/auth/tokenStore'
import { getSessionEpoch, bumpSessionEpoch } from '@/lib/auth/sessionEpoch'

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

// Session cache-isolation CORE (T2 transport epoch guard + T3 single-flight
// self-ownership). See docs/superpowers/specs/2026-07-05-merchant-web-session-cache-isolation-design.md §4.2.
describe('session epoch guard (T2) + single-flight self-ownership (T3/F1)', () => {
  beforeEach(() => {
    setAccessToken(null)
    setOnSessionLost(null)
    resetRefreshInFlight()
    jest.restoreAllMocks()
  })

  it('discards an old-epoch success resolution: apiFetch throws SESSION_SWITCHED, never delivers the data', async () => {
    setAccessToken('tok')
    const staleEpoch = getSessionEpoch()
    bumpSessionEpoch() // a session boundary happens before this request resolves
    global.fetch = jest.fn(async () => jsonRes(200, { ok: 1 })) as unknown as typeof fetch
    await expect(
      apiFetch<{ ok: number }>('/profile', { auth: true, _epoch: staleEpoch }),
    ).rejects.toMatchObject({ status: 0, code: 'SESSION_SWITCHED' })
  })

  it('discards an old-epoch non-401 error resolution the same way (never delivers the real error either)', async () => {
    setAccessToken('tok')
    const staleEpoch = getSessionEpoch()
    bumpSessionEpoch()
    global.fetch = jest.fn(async () => jsonRes(500, { error: { code: 'BOOM' } })) as unknown as typeof fetch
    await expect(
      apiFetch('/profile', { auth: true, _epoch: staleEpoch }),
    ).rejects.toMatchObject({ code: 'SESSION_SWITCHED' })
  })

  it('same-epoch paths are byte-equivalent to today: no SESSION_SWITCHED when no boundary occurs', async () => {
    setAccessToken('tok')
    global.fetch = jest.fn(async () => jsonRes(200, { ok: 1 })) as unknown as typeof fetch
    const r = await apiFetch<{ ok: number }>('/profile', { auth: true })
    expect(r.ok).toBe(1)
  })

  it('doRefresh regression pin (design spec §3, in-memory mint-after-logout arm): an epoch boundary during refresh returns false and does NOT install the token', async () => {
    setAccessToken(null)
    global.fetch = jest.fn(async (url: unknown) => {
      if (String(url).endsWith('/api/merchant-auth/refresh')) {
        bumpSessionEpoch() // the session moves on while the refresh is in flight
        return jsonRes(200, { accessToken: 'stolen-fresh' })
      }
      return jsonRes(200, { ok: 1 })
    }) as unknown as typeof fetch
    const ok = await refreshSession()
    expect(ok).toBe(false)
    expect(getAccessToken()).toBeNull()
  })

  it('a real 401-refresh-retry sequence: a boundary during the retry itself still discards the retried result', async () => {
    setAccessToken('expired')
    let profileCalls = 0
    global.fetch = jest.fn(async (url: unknown) => {
      const u = String(url)
      if (u.endsWith('/api/merchant-auth/refresh')) return jsonRes(200, { accessToken: 'fresh' })
      profileCalls += 1
      if (profileCalls === 1) return jsonRes(401, {})
      bumpSessionEpoch() // boundary lands while the RETRY's own network call is in flight
      return jsonRes(200, { ok: 1 })
    }) as unknown as typeof fetch
    await expect(apiFetch<{ ok: number }>('/profile', { auth: true })).rejects.toMatchObject({
      code: 'SESSION_SWITCHED',
    })
    expect(getAccessToken()).toBe('fresh') // the refresh itself succeeded before the boundary
  })

  it('F2 retry-threading regression pin: a retry carrying an already-stale captured epoch is discarded even on a fresh 200 (proves the epoch used is the THREADED value, not a fresh capture)', async () => {
    setAccessToken('tok')
    const staleEpoch = getSessionEpoch()
    bumpSessionEpoch() // simulates the boundary that would land between refresh-success and the retry's own entry
    global.fetch = jest.fn(async () => jsonRes(200, { ok: 1 })) as unknown as typeof fetch
    // `_epoch` is exactly what apiFetchResponse threads into its own recursive retry
    // call (`{ ...options, _isRetry: true, _epoch: capturedEpoch }`); injecting it
    // directly here reproduces the retry's exact epoch-comparison contract without
    // depending on microtask-ordering to land a bump in that razor-thin window.
    await expect(
      apiFetch('/profile', { auth: true, _isRetry: true, _epoch: staleEpoch }),
    ).rejects.toMatchObject({ code: 'SESSION_SWITCHED' })
  })

  it('session-side-effect epoch gate (Codex #3): an old-epoch request whose refresh fails does NOT null the token or hard-logout', async () => {
    setAccessToken('expired')
    const lost = jest.fn()
    setOnSessionLost(lost)
    global.fetch = jest.fn(async (url: unknown) => {
      if (String(url).endsWith('/api/merchant-auth/refresh')) {
        bumpSessionEpoch() // the session moves on while THIS request's refresh is in flight
        return jsonRes(401, {})
      }
      return jsonRes(401, { error: { code: 'SESSION_REVOKED' } })
    }) as unknown as typeof fetch
    await expect(apiFetch('/profile', { auth: true })).rejects.toMatchObject({ code: 'SESSION_SWITCHED' })
    expect(getAccessToken()).toBe('expired') // NOT nulled - the side-effect gate suppressed it
    expect(lost).not.toHaveBeenCalled()
    // Contrast: the pre-existing 'hard-logout when refresh fails' test above proves a
    // CURRENT-epoch request still hard-logs-out normally (no epoch bump involved).
  })

  it('resetRefreshInFlight forces the next refresh to start fresh instead of adopting a still-pending one', async () => {
    let refreshCalls = 0
    global.fetch = jest.fn(async (url: unknown) => {
      if (String(url).endsWith('/api/merchant-auth/refresh')) {
        refreshCalls += 1
        return new Promise<Response>((resolve) => {
          setTimeout(() => resolve(jsonRes(200, { accessToken: `fresh-${refreshCalls}` })), 5)
        })
      }
      return jsonRes(200, { ok: 1 })
    }) as unknown as typeof fetch
    const p1 = refreshSession()
    resetRefreshInFlight()
    const p2 = refreshSession()
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe(true)
    expect(r2).toBe(true)
    expect(refreshCalls).toBe(2)
  })

  it('F1 self-ownership guard: a stale refresh promise settling late does not clobber a newer single-flight slot', async () => {
    let call = 0
    const resolvers: Array<(res: Response) => void> = []
    global.fetch = jest.fn(async (url: unknown) => {
      if (!String(url).endsWith('/api/merchant-auth/refresh')) return jsonRes(200, { ok: 1 })
      call += 1
      return new Promise<Response>((resolve) => {
        resolvers[call] = resolve
      })
    }) as unknown as typeof fetch

    const p1 = refreshSession() // call 1 - slot now holds p1
    resetRefreshInFlight() // teardown boundary: slot forced back to null while p1 is still pending
    const p3 = refreshSession() // call 2 (fresh, since slot was null) - slot now holds p3

    // Release p1 (the STALE promise) AFTER p3 already owns the slot. Its `.finally`
    // must see it no longer owns the slot and must NOT null it.
    resolvers[1](jsonRes(200, { accessToken: 'stale' }))
    await p1

    // A caller arriving right now must still reuse p3 - the slot was not clobbered.
    const p4 = refreshSession()
    expect(p4).toBe(p3)

    resolvers[2](jsonRes(200, { accessToken: 'current' }))
    await Promise.all([p3, p4])
    expect(call).toBe(2) // only p1 and p3's underlying fetch ever ran; p4 reused p3
  })

  it('F4: after a teardown reset, a new 401 starts its OWN refresh rather than adopting the prior in-flight promise', async () => {
    setAccessToken('expired-old')
    let refreshCalls = 0
    let resolveOldRefresh: ((res: Response) => void) | undefined
    let profileCalls = 0
    global.fetch = jest.fn(async (url: unknown) => {
      const u = String(url)
      if (u.endsWith('/api/merchant-auth/refresh')) {
        refreshCalls += 1
        if (refreshCalls === 1) {
          return new Promise<Response>((resolve) => {
            resolveOldRefresh = resolve
          })
        }
        return jsonRes(200, { accessToken: 'new-session-fresh' })
      }
      profileCalls += 1
      return profileCalls === 1 ? jsonRes(401, {}) : jsonRes(200, { ok: 1 })
    }) as unknown as typeof fetch

    const oldRefreshPromise = refreshSession() // starts an old, never-yet-resolving refresh
    resetRefreshInFlight() // teardown: the new session must not await/adopt this
    setAccessToken('expired-new')

    const result = await apiFetch<{ ok: number }>('/profile', { auth: true })
    expect(result.ok).toBe(1)
    expect(refreshCalls).toBe(2) // the new session's own refresh, not the adopted old one
    expect(getAccessToken()).toBe('new-session-fresh')

    // Cleanup: release the old hung refresh so no promise is left dangling. (In the
    // REAL teardown pipeline the epoch guard - tested above - ALSO discards this old
    // promise's effect; this test isolates the single-flight-adoption behaviour only.)
    resolveOldRefresh?.(jsonRes(200, { accessToken: 'stale-should-not-apply' }))
    await oldRefreshPromise
  })
})
