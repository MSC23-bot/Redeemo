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

import { POST as loginPOST } from '@/app/api/merchant-auth/login/route'
import { POST as otpVerifyPOST } from '@/app/api/merchant-auth/otp-verify/route'
import { POST as registerPOST } from '@/app/api/merchant-auth/register/route'
import { POST as registerVerifyPOST } from '@/app/api/merchant-auth/register-verify/route'
import { POST as refreshPOST } from '@/app/api/merchant-auth/refresh/route'
import { POST as logoutPOST } from '@/app/api/merchant-auth/logout/route'
import type { NextRequest } from 'next/server'

function jwt(payload: object): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256' })}.${b(payload)}.sig`
}
function jsonRes(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response
}
function mockReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as NextRequest
}

describe('BFF merchant-auth route handlers (M1 Slice 1)', () => {
  beforeEach(() => {
    store.clear()
    jest.clearAllMocks()
  })

  it('login OTP_REQUIRED: passes the challenge through and sets NO cookie', async () => {
    global.fetch = jest.fn(async () => jsonRes(200, { status: 'OTP_REQUIRED', sessionChallenge: 'ch' })) as unknown as typeof fetch
    const res = await loginPOST(mockReq({ email: 'a', password: 'b' }))
    expect(await res.json()).toEqual({ status: 'OTP_REQUIRED', sessionChallenge: 'ch' })
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('login success: sets the httpOnly cookie + returns access+merchant but the refresh token NEVER reaches the browser', async () => {
    const access = jwt({ sub: 'ma1', sessionId: 's1', role: 'merchant', deviceId: 'd' })
    global.fetch = jest.fn(async () =>
      jsonRes(200, {
        accessToken: access,
        refreshToken: 'SECRET_RT',
        merchant: { id: 'm1', businessName: 'Co', approvalStatus: 'REGISTERED' },
      }),
    ) as unknown as typeof fetch
    const res = await loginPOST(mockReq({ email: 'a', password: 'b' }))
    const body = await res.json()
    expect(body.accessToken).toBe(access)
    expect(body.merchant).toEqual({ id: 'm1', businessName: 'Co', approvalStatus: 'REGISTERED' })
    expect(JSON.stringify(body)).not.toContain('SECRET_RT')
    expect(cookieStore.set).toHaveBeenCalledTimes(1)
    expect(JSON.parse(cookieStore.set.mock.calls[0][1])).toEqual({ refreshToken: 'SECRET_RT', sessionId: 's1', entityId: 'ma1' })
    expect(cookieStore.set.mock.calls[0][2]).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
  })

  it('login forwards a backend error status + envelope unchanged, no cookie', async () => {
    global.fetch = jest.fn(async () => jsonRes(403, { error: { code: 'EMAIL_NOT_VERIFIED', message: 'verify' } })) as unknown as typeof fetch
    const res = await loginPOST(mockReq({ email: 'a', password: 'b' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('EMAIL_NOT_VERIFIED')
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('otp-verify success sets the cookie + returns access+merchant', async () => {
    const access = jwt({ sub: 'ma1', sessionId: 's1' })
    global.fetch = jest.fn(async () => jsonRes(200, { accessToken: access, refreshToken: 'RT', merchant: { id: 'm1', businessName: 'Co', approvalStatus: 'ACTIVE' } })) as unknown as typeof fetch
    const res = await otpVerifyPOST(mockReq({ sessionChallenge: 'ch', code: '123456' }))
    expect((await res.json()).accessToken).toBe(access)
    expect(cookieStore.set).toHaveBeenCalledTimes(1)
  })

  it('register passes VERIFY_EMAIL_SENT through and sets no cookie', async () => {
    global.fetch = jest.fn(async () => jsonRes(200, { status: 'VERIFY_EMAIL_SENT', sessionChallenge: 'ch' })) as unknown as typeof fetch
    const res = await registerPOST(mockReq({ email: 'a' }))
    expect((await res.json()).status).toBe('VERIFY_EMAIL_SENT')
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('register-verify auto-login: sets the cookie + returns tokens', async () => {
    const access = jwt({ sub: 'ma2', sessionId: 's2' })
    global.fetch = jest.fn(async () => jsonRes(200, { accessToken: access, refreshToken: 'RT', merchant: { id: 'm2', businessName: 'New', approvalStatus: 'REGISTERED' } })) as unknown as typeof fetch
    const res = await registerVerifyPOST(mockReq({ sessionChallenge: 'ch', code: '123456' }))
    expect((await res.json()).accessToken).toBe(access)
    expect(JSON.parse(cookieStore.set.mock.calls[0][1]).entityId).toBe('ma2')
  })

  it('refresh: 401 REFRESH_TOKEN_INVALID when there is no cookie', async () => {
    const res = await refreshPOST()
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('REFRESH_TOKEN_INVALID')
  })

  it('refresh: sends {refreshToken,sessionId,entityId}, rotates the cookie, returns ONLY the new access token', async () => {
    store.set('redeemo_merchant_session', { value: JSON.stringify({ refreshToken: 'OLD', sessionId: 's1', entityId: 'ma1' }) })
    const access = jwt({ sub: 'ma1', sessionId: 's1' })
    let sentBody: unknown
    global.fetch = jest.fn(async (_url: unknown, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string)
      return jsonRes(200, { accessToken: access, refreshToken: 'NEW' })
    }) as unknown as typeof fetch
    const res = await refreshPOST()
    expect(sentBody).toEqual({ refreshToken: 'OLD', sessionId: 's1', entityId: 'ma1' })
    expect(await res.json()).toEqual({ accessToken: access }) // no refresh token leaks
    expect(JSON.parse(cookieStore.set.mock.calls.at(-1)![1]).refreshToken).toBe('NEW')
  })

  it('refresh: clears the cookie + forwards the status on a backend failure', async () => {
    store.set('redeemo_merchant_session', { value: JSON.stringify({ refreshToken: 'OLD', sessionId: 's1', entityId: 'ma1' }) })
    global.fetch = jest.fn(async () => jsonRes(401, { error: { code: 'REFRESH_TOKEN_INVALID' } })) as unknown as typeof fetch
    const res = await refreshPOST()
    expect(res.status).toBe(401)
    expect(cookieStore.delete).toHaveBeenCalledWith('redeemo_merchant_session')
  })

  it('logout: forwards the Bearer best-effort and ALWAYS clears the cookie', async () => {
    const fetchMock = jest.fn(async () => jsonRes(200, { message: 'Logged out.' }))
    global.fetch = fetchMock as unknown as typeof fetch
    const res = await logoutPOST(mockReq(undefined, { authorization: 'Bearer tok' }))
    expect((await res.json()).ok).toBe(true)
    expect(((fetchMock.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> }).headers.authorization).toBe('Bearer tok')
    expect(cookieStore.delete).toHaveBeenCalledWith('redeemo_merchant_session')
  })

  it('logout: clears the cookie even with no Bearer (skips the backend call)', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    const res = await logoutPOST(mockReq(undefined, {}))
    expect((await res.json()).ok).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cookieStore.delete).toHaveBeenCalled()
  })
})
