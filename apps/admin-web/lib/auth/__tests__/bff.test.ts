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

import { assertSameOrigin, backendPost, completeBffLogin } from '@/lib/auth/bff'
import type { NextRequest } from 'next/server'

function jwt(payload: object): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256' })}.${b(payload)}.sig`
}

function mockReq(headers: Record<string, string> = {}, nextOrigin = 'http://localhost:3002'): NextRequest {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    nextUrl: { origin: nextOrigin },
  } as unknown as NextRequest
}

describe('assertSameOrigin', () => {
  it('allows a request with no Origin header', () => {
    expect(assertSameOrigin(mockReq({}))).toBeNull()
  })

  it('allows a same-origin request', () => {
    expect(assertSameOrigin(mockReq({ origin: 'http://localhost:3002' }))).toBeNull()
  })

  it('blocks a cross-origin request with 403 CROSS_ORIGIN_BLOCKED', async () => {
    const res = assertSameOrigin(mockReq({ origin: 'https://evil.example' }))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    expect((await res!.json()).error.code).toBe('CROSS_ORIGIN_BLOCKED')
  })
})

describe('backendPost', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('omits content-type and body when body is undefined (bodyless POST)', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch
    await backendPost('/logout', undefined, { authorization: 'Bearer t' })
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit
    expect(init.body).toBeUndefined()
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined()
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t')
  })

  it('sets JSON content-type and stringifies the body when present', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch
    await backendPost('/login', { email: 'a@b.com' })
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.com' }))
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('targets the admin auth prefix', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch
    await backendPost('/refresh', { a: 1 })
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://localhost:3000/api/v1/admin/auth/refresh')
  })
})

describe('completeBffLogin', () => {
  beforeEach(() => {
    store.clear()
    jest.clearAllMocks()
  })

  it('sets the httpOnly cookie and returns ONLY { accessToken, meta } — never the refresh token', async () => {
    const access = jwt({ sub: 'admin-1', sessionId: 'sess-1', adminRole: 'OPERATIONS', role: 'admin' })
    const res = await completeBffLogin({
      accessToken: access,
      refreshToken: 'SECRET_REFRESH_TOKEN',
      admin: { id: 'admin-1', email: 'ops@redeemo.co.uk', adminRole: 'OPERATIONS' },
    })
    const body = await res.json()
    expect(body).toEqual({
      accessToken: access,
      meta: { entityId: 'admin-1', sessionId: 'sess-1', adminRole: 'OPERATIONS', email: 'ops@redeemo.co.uk' },
    })
    expect(JSON.stringify(body)).not.toContain('SECRET_REFRESH_TOKEN')

    expect(cookieStore.set).toHaveBeenCalledTimes(1)
    const [name, value, options] = cookieStore.set.mock.calls[0]
    expect(name).toBe('redeemo_admin_session')
    expect(JSON.parse(value)).toEqual({ refreshToken: 'SECRET_REFRESH_TOKEN', sessionId: 'sess-1', entityId: 'admin-1' })
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
  })

  it('fails closed with 500 SESSION_INIT_FAILED on an undecodable token, and sets NO cookie', async () => {
    const res = await completeBffLogin({
      accessToken: 'not-a-jwt',
      refreshToken: 'RT',
      admin: { id: 'a', email: 'a@b.com', adminRole: 'OPERATIONS' },
    })
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe('SESSION_INIT_FAILED')
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('fails closed with 500 SESSION_INIT_FAILED when admin is missing, and sets NO cookie', async () => {
    const access = jwt({ sub: 'admin-1', sessionId: 'sess-1', adminRole: 'OPERATIONS' })
    const res = await completeBffLogin({ accessToken: access, refreshToken: 'RT', admin: null })
    expect(res.status).toBe(500)
    expect(cookieStore.set).not.toHaveBeenCalled()
  })
})
