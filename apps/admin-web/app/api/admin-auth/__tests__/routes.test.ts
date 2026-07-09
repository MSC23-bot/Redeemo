/**
 * @jest-environment node
 */
const store = new Map<string, { value: string; options?: Record<string, unknown> }>()
const cookieStore = {
  set: jest.fn((name: string, value: string, options?: Record<string, unknown>) => {
    store.set(name, { value, options })
  }),
  get: jest.fn((name: string) => {
    const e = store.get(name)
    return e ? { name, value: e.value } : undefined
  }),
  delete: jest.fn((name: string) => {
    store.delete(name)
  }),
}
jest.mock('next/headers', () => ({ cookies: jest.fn(async () => cookieStore) }))

import { POST as loginPOST } from '@/app/api/admin-auth/login/route'
import { POST as otpVerifyPOST } from '@/app/api/admin-auth/otp-verify/route'
import { POST as refreshPOST } from '@/app/api/admin-auth/refresh/route'
import { POST as logoutPOST } from '@/app/api/admin-auth/logout/route'
import type { NextRequest } from 'next/server'

function jwt(payload: object): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256' })}.${b(payload)}.sig`
}
function jsonRes(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response
}
function mockReq(body: unknown, headers: Record<string, string> = {}, nextOrigin = 'http://localhost:3002'): NextRequest {
  return {
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    nextUrl: { origin: nextOrigin },
  } as unknown as NextRequest
}

describe('BFF admin-auth route handlers (H5 migration)', () => {
  beforeEach(() => {
    store.clear()
    jest.clearAllMocks()
  })

  // ── assertSameOrigin on every route ──────────────────────────────────────

  describe('CSRF (assertSameOrigin) on every route', () => {
    it('login: 403s cross-origin before any fetch', async () => {
      const fetchMock = jest.fn()
      global.fetch = fetchMock as unknown as typeof fetch
      const res = await loginPOST(mockReq({ email: 'a', password: 'b' }, { origin: 'https://evil.example' }))
      expect(res.status).toBe(403)
      expect((await res.json()).error.code).toBe('CROSS_ORIGIN_BLOCKED')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('otp-verify: 403s cross-origin before any fetch', async () => {
      const fetchMock = jest.fn()
      global.fetch = fetchMock as unknown as typeof fetch
      const res = await otpVerifyPOST(mockReq({ sessionChallenge: 'c', code: '123456' }, { origin: 'https://evil.example' }))
      expect(res.status).toBe(403)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refresh: 403s cross-origin before any fetch (and before reading the cookie)', async () => {
      const fetchMock = jest.fn()
      global.fetch = fetchMock as unknown as typeof fetch
      const res = await refreshPOST(mockReq(undefined, { origin: 'https://evil.example' }))
      expect(res.status).toBe(403)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('logout: 403s cross-origin and does NOT clear the cookie', async () => {
      const fetchMock = jest.fn()
      global.fetch = fetchMock as unknown as typeof fetch
      const res = await logoutPOST(mockReq(undefined, { authorization: 'Bearer t', origin: 'https://evil.example' }))
      expect(res.status).toBe(403)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(cookieStore.delete).not.toHaveBeenCalled()
    })

    it('same-origin requests (matching Origin header) are allowed through', async () => {
      global.fetch = jest.fn(async () => jsonRes(200, { message: 'Logged out.' })) as unknown as typeof fetch
      const res = await logoutPOST(mockReq(undefined, { origin: 'http://localhost:3002' }))
      expect((await res.json()).ok).toBe(true)
    })
  })

  // ── login ─────────────────────────────────────────────────────────────────

  describe('POST /api/admin-auth/login', () => {
    it('OTP_REQUIRED: passes the challenge through and sets NO cookie', async () => {
      global.fetch = jest.fn(async () => jsonRes(200, { status: 'OTP_REQUIRED', sessionChallenge: 'ch' })) as unknown as typeof fetch
      const res = await loginPOST(mockReq({ email: 'a', password: 'b' }))
      expect(await res.json()).toEqual({ status: 'OTP_REQUIRED', sessionChallenge: 'ch' })
      expect(cookieStore.set).not.toHaveBeenCalled()
    })

    it('forwards a backend error status + envelope unchanged, no cookie', async () => {
      global.fetch = jest.fn(async () => jsonRes(401, { error: { code: 'INVALID_CREDENTIALS', message: 'nope' } })) as unknown as typeof fetch
      const res = await loginPOST(mockReq({ email: 'a', password: 'b' }))
      expect(res.status).toBe(401)
      expect((await res.json()).error.code).toBe('INVALID_CREDENTIALS')
      expect(cookieStore.set).not.toHaveBeenCalled()
    })

    it('defensive tokens branch: sets the cookie + returns { accessToken, meta } but never the refresh token', async () => {
      const access = jwt({ sub: 'admin-1', sessionId: 's1', adminRole: 'OPERATIONS' })
      global.fetch = jest.fn(async () =>
        jsonRes(200, {
          accessToken: access,
          refreshToken: 'SECRET_RT',
          admin: { id: 'admin-1', email: 'ops@redeemo.co.uk', adminRole: 'OPERATIONS' },
        }),
      ) as unknown as typeof fetch
      const res = await loginPOST(mockReq({ email: 'a', password: 'b' }))
      const body = await res.json()
      expect(body.accessToken).toBe(access)
      expect(body.meta).toEqual({ entityId: 'admin-1', sessionId: 's1', adminRole: 'OPERATIONS', email: 'ops@redeemo.co.uk' })
      expect(JSON.stringify(body)).not.toContain('SECRET_RT')
      expect(cookieStore.set).toHaveBeenCalledTimes(1)
    })
  })

  // ── otp-verify ────────────────────────────────────────────────────────────

  describe('POST /api/admin-auth/otp-verify', () => {
    it('success sets the httpOnly cookie and returns ONLY { accessToken, meta } — the refresh token never reaches the browser', async () => {
      const access = jwt({ sub: 'admin-1', sessionId: 's1', adminRole: 'OPERATIONS' })
      global.fetch = jest.fn(async () =>
        jsonRes(200, {
          accessToken: access,
          refreshToken: 'SECRET_RT',
          admin: { id: 'admin-1', email: 'ops@redeemo.co.uk', adminRole: 'OPERATIONS' },
        }),
      ) as unknown as typeof fetch
      const res = await otpVerifyPOST(mockReq({ sessionChallenge: 'ch', code: '123456' }))
      const body = await res.json()
      expect(Object.keys(body).sort()).toEqual(['accessToken', 'meta'])
      expect(body.accessToken).toBe(access)
      expect(body.meta).toEqual({ entityId: 'admin-1', sessionId: 's1', adminRole: 'OPERATIONS', email: 'ops@redeemo.co.uk' })
      // Explicit no-refresh-token-leak assertion (test plan §9 invariant).
      expect(JSON.stringify(body)).not.toContain('SECRET_RT')
      expect(JSON.stringify(body)).not.toMatch(/refreshToken/i)

      expect(cookieStore.set).toHaveBeenCalledTimes(1)
      const [name, value, options] = cookieStore.set.mock.calls[0]
      expect(name).toBe('redeemo_admin_session')
      expect(JSON.parse(value)).toEqual({ refreshToken: 'SECRET_RT', sessionId: 's1', entityId: 'admin-1' })
      expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    })

    it('forwards a backend error (e.g. OTP_INVALID) unchanged, no cookie', async () => {
      global.fetch = jest.fn(async () => jsonRes(400, { error: { code: 'OTP_INVALID', message: 'bad code' } })) as unknown as typeof fetch
      const res = await otpVerifyPOST(mockReq({ sessionChallenge: 'ch', code: '000000' }))
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('OTP_INVALID')
      expect(cookieStore.set).not.toHaveBeenCalled()
    })
  })

  // ── refresh ───────────────────────────────────────────────────────────────

  describe('POST /api/admin-auth/refresh', () => {
    it('401s REFRESH_TOKEN_INVALID when there is no cookie', async () => {
      const res = await refreshPOST(mockReq(undefined))
      expect(res.status).toBe(401)
      expect((await res.json()).error.code).toBe('REFRESH_TOKEN_INVALID')
    })

    it('sends {refreshToken,sessionId,entityId} from the cookie, rotates the cookie, and returns ONLY the new access token', async () => {
      store.set('redeemo_admin_session', { value: JSON.stringify({ refreshToken: 'OLD', sessionId: 's1', entityId: 'admin-1' }) })
      const access = jwt({ sub: 'admin-1', sessionId: 's1', adminRole: 'OPERATIONS' })
      let sentBody: unknown
      global.fetch = jest.fn(async (_url: unknown, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string)
        return jsonRes(200, { accessToken: access, refreshToken: 'NEW' })
      }) as unknown as typeof fetch
      const res = await refreshPOST(mockReq(undefined))
      expect(sentBody).toEqual({ refreshToken: 'OLD', sessionId: 's1', entityId: 'admin-1' })
      const body = await res.json()
      expect(body).toEqual({ accessToken: access })
      expect(Object.keys(body)).toEqual(['accessToken']) // no refresh token leaks
      expect(JSON.stringify(body)).not.toMatch(/refreshToken|NEW/i)
      expect(JSON.parse(cookieStore.set.mock.calls.at(-1)![1]).refreshToken).toBe('NEW')
    })

    it('clears the cookie + forwards the status on a backend failure', async () => {
      store.set('redeemo_admin_session', { value: JSON.stringify({ refreshToken: 'OLD', sessionId: 's1', entityId: 'admin-1' }) })
      global.fetch = jest.fn(async () => jsonRes(401, { error: { code: 'REFRESH_TOKEN_INVALID' } })) as unknown as typeof fetch
      const res = await refreshPOST(mockReq(undefined))
      expect(res.status).toBe(401)
      expect(cookieStore.delete).toHaveBeenCalledWith('redeemo_admin_session')
    })

    it('clears the cookie when the backend response is malformed (missing accessToken/refreshToken)', async () => {
      store.set('redeemo_admin_session', { value: JSON.stringify({ refreshToken: 'OLD', sessionId: 's1', entityId: 'admin-1' }) })
      global.fetch = jest.fn(async () => jsonRes(200, {})) as unknown as typeof fetch
      const res = await refreshPOST(mockReq(undefined))
      expect(res.status).toBe(401)
      expect(cookieStore.delete).toHaveBeenCalledWith('redeemo_admin_session')
    })
  })

  // ── logout (G2: bearer-forwarded, bounded best-effort, always clears) ──────

  describe('POST /api/admin-auth/logout (G2)', () => {
    it('forwards the captured Bearer token to the backend (bodyless) and clears the cookie', async () => {
      const fetchMock = jest.fn(async () => jsonRes(200, { message: 'Logged out.' }))
      global.fetch = fetchMock as unknown as typeof fetch
      const res = await logoutPOST(mockReq(undefined, { authorization: 'Bearer tok' }))
      expect((await res.json()).ok).toBe(true)
      const init = (fetchMock.mock.calls[0] as unknown[])[1] as { headers: Record<string, string>; body?: unknown }
      expect(init.headers.authorization).toBe('Bearer tok')
      expect(init.body).toBeUndefined() // bodyless — the backend derives entityId/sessionId from the JWT
      expect((init.headers as Record<string, string>)['content-type']).toBeUndefined()
      expect(cookieStore.delete).toHaveBeenCalledWith('redeemo_admin_session')
    })

    it('reports remoteRevoke:"confirmed" on a successful backend revoke', async () => {
      global.fetch = jest.fn(async () => jsonRes(200, { message: 'Logged out.' })) as unknown as typeof fetch
      const res = await logoutPOST(mockReq(undefined, { authorization: 'Bearer tok' }))
      expect(await res.json()).toEqual({ ok: true, remoteRevoke: 'confirmed' })
    })

    it('reports remoteRevoke:"unavailable" on a backend failure, but ALWAYS clears the cookie', async () => {
      global.fetch = jest.fn(async () => jsonRes(401, { error: { code: 'UNAUTHENTICATED' } })) as unknown as typeof fetch
      const res = await logoutPOST(mockReq(undefined, { authorization: 'Bearer stale' }))
      expect(res.status).toBe(200) // logout never fails the caller's request
      expect(await res.json()).toEqual({ ok: true, remoteRevoke: 'unavailable' })
      expect(cookieStore.delete).toHaveBeenCalled()
    })

    it('reports remoteRevoke:"unavailable" when the backend call throws/times out, but ALWAYS clears the cookie', async () => {
      global.fetch = jest.fn(async () => {
        throw new Error('fetch failed')
      }) as unknown as typeof fetch
      const res = await logoutPOST(mockReq(undefined, { authorization: 'Bearer tok' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, remoteRevoke: 'unavailable' })
      expect(cookieStore.delete).toHaveBeenCalled()
    })

    it('with no Authorization header: skips the backend call entirely, reports "unavailable", and still clears the cookie', async () => {
      const fetchMock = jest.fn()
      global.fetch = fetchMock as unknown as typeof fetch
      const res = await logoutPOST(mockReq(undefined, {}))
      expect(fetchMock).not.toHaveBeenCalled()
      expect(await res.json()).toEqual({ ok: true, remoteRevoke: 'unavailable' })
      expect(cookieStore.delete).toHaveBeenCalledWith('redeemo_admin_session')
    })
  })

  // ── cross-cutting: refresh token never leaks in ANY BFF response ───────────

  describe('invariant: no BFF JSON response ever contains a refresh token', () => {
    it('otp-verify, login (tokens branch), and refresh responses are all refresh-token-free', async () => {
      const access1 = jwt({ sub: 'a1', sessionId: 's1', adminRole: 'OPERATIONS' })
      global.fetch = jest.fn(async () =>
        jsonRes(200, { accessToken: access1, refreshToken: 'RT-1', admin: { id: 'a1', email: 'x@y.com', adminRole: 'OPERATIONS' } }),
      ) as unknown as typeof fetch
      const otpBody = await (await otpVerifyPOST(mockReq({ sessionChallenge: 'c', code: '1' }))).json()
      expect(JSON.stringify(otpBody)).not.toContain('RT-1')

      const access2 = jwt({ sub: 'a2', sessionId: 's2', adminRole: 'SUPER_ADMIN' })
      global.fetch = jest.fn(async () =>
        jsonRes(200, { accessToken: access2, refreshToken: 'RT-2', admin: { id: 'a2', email: 'z@y.com', adminRole: 'SUPER_ADMIN' } }),
      ) as unknown as typeof fetch
      const loginBody = await (await loginPOST(mockReq({ email: 'a', password: 'b' }))).json()
      expect(JSON.stringify(loginBody)).not.toContain('RT-2')

      store.set('redeemo_admin_session', { value: JSON.stringify({ refreshToken: 'OLD-3', sessionId: 's3', entityId: 'a3' }) })
      const access3 = jwt({ sub: 'a3', sessionId: 's3', adminRole: 'OPERATIONS' })
      global.fetch = jest.fn(async () => jsonRes(200, { accessToken: access3, refreshToken: 'RT-3' })) as unknown as typeof fetch
      const refreshBody = await (await refreshPOST(mockReq(undefined))).json()
      expect(JSON.stringify(refreshBody)).not.toContain('RT-3')
    })
  })
})
