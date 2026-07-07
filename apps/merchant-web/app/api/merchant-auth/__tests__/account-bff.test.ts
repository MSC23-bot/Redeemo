/**
 * @jest-environment node
 */
// My Account (§BP-ACC): the two new authenticated BFF passthroughs
// (change-password, logout-all). Unlike login/otp/register/refresh/logout, these
// carry NO cookie state - they forward the caller's Authorization header + JSON
// body to the backend verbatim, behind the same same-origin CSRF guard.
import { POST as changePasswordPOST } from '@/app/api/merchant-auth/change-password/route'
import { POST as logoutAllPOST } from '@/app/api/merchant-auth/logout-all/route'
import type { NextRequest } from 'next/server'

function jsonRes(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response
}
function mockReq(
  body: unknown,
  headers: Record<string, string> = {},
  nextOrigin = 'http://localhost:3003',
): NextRequest {
  return {
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    nextUrl: { origin: nextOrigin },
  } as unknown as NextRequest
}

describe('POST /api/merchant-auth/change-password', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('401s with no Authorization header (never reaches the backend)', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch
    const res = await changePasswordPOST(mockReq({ currentPassword: 'a', newPassword: 'b' }))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('400s on a malformed body (never reaches the backend)', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch
    const res = await changePasswordPOST(mockReq({ currentPassword: 'a' }, { authorization: 'Bearer t' }))
    expect(res.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('403s cross-origin (assertSameOrigin) before any fetch', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch
    const res = await changePasswordPOST(
      mockReq(
        { currentPassword: 'a', newPassword: 'b' },
        { authorization: 'Bearer t', origin: 'https://evil.example' },
      ),
    )
    expect(res.status).toBe(403)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('forwards the Authorization header + body, and relays a 200 verbatim', async () => {
    let sentHeaders: Record<string, string> = {}
    let sentBody: unknown
    global.fetch = jest.fn(async (_url: unknown, init: RequestInit) => {
      sentHeaders = init.headers as Record<string, string>
      sentBody = JSON.parse(init.body as string)
      return jsonRes(200, { message: 'Password updated.' })
    }) as unknown as typeof fetch

    const res = await changePasswordPOST(
      mockReq({ currentPassword: 'oldpw', newPassword: 'NewPw1!aaaa' }, { authorization: 'Bearer abc123' }),
    )
    expect(sentHeaders.authorization).toBe('Bearer abc123')
    expect(sentBody).toEqual({ currentPassword: 'oldpw', newPassword: 'NewPw1!aaaa' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'Password updated.' })
  })

  it('relays a backend error status + code unchanged (e.g. CURRENT_PASSWORD_INCORRECT)', async () => {
    global.fetch = jest.fn(async () =>
      jsonRes(400, { error: { code: 'CURRENT_PASSWORD_INCORRECT', message: 'wrong' } }),
    ) as unknown as typeof fetch
    const res = await changePasswordPOST(
      mockReq({ currentPassword: 'wrong', newPassword: 'NewPw1!aaaa' }, { authorization: 'Bearer t' }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('CURRENT_PASSWORD_INCORRECT')
  })
})

describe('POST /api/merchant-auth/logout-all', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('401s with no Authorization header (never reaches the backend)', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch
    const res = await logoutAllPOST(mockReq(undefined))
    expect(res.status).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('403s cross-origin before any fetch', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch
    const res = await logoutAllPOST(mockReq(undefined, { authorization: 'Bearer t', origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('forwards the Authorization header with NO body, and relays { message, revokedCount }', async () => {
    let sentInit: RequestInit | undefined
    global.fetch = jest.fn(async (_url: unknown, init: RequestInit) => {
      sentInit = init
      return jsonRes(200, { message: 'Signed out of all other sessions.', revokedCount: 2 })
    }) as unknown as typeof fetch

    const res = await logoutAllPOST(mockReq(undefined, { authorization: 'Bearer abc123' }))
    expect((sentInit?.headers as Record<string, string>).authorization).toBe('Bearer abc123')
    expect(sentInit?.body).toBeUndefined()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'Signed out of all other sessions.', revokedCount: 2 })
  })
})
