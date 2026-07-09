/**
 * @jest-environment node
 */
import { middleware, config } from '@/middleware'
import type { NextRequest } from 'next/server'

function req(path: string, hasCookie: boolean, search = ''): NextRequest {
  return {
    cookies: { has: () => hasCookie },
    nextUrl: { pathname: path, search },
    url: `http://localhost:3002${path}${search}`,
  } as unknown as NextRequest
}

describe('admin-web middleware (H5 migration route protection, closes L7)', () => {
  it('redirects an (app) page to /login?next= when the session cookie is absent', () => {
    const res = middleware(req('/queue', false))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fqueue')
  })

  it('passes through (no redirect) when the session cookie is present', () => {
    const res = middleware(req('/', true))
    expect(res.headers.get('location')).toBeNull()
  })

  it('preserves the search string in ?next=', () => {
    const res = middleware(req('/merchants', false, '?focus=m-1'))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain(encodeURIComponent('/merchants?focus=m-1'))
  })

  it('does not put a /login path into next (no auth-page round-trip)', () => {
    const res = middleware(req('/login', false))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).not.toContain('next=')
  })

  describe('config.matcher exclusions / gating', () => {
    const pattern = config.matcher[0]
    // '/((?!X).*)' -> ^/(?!X).*$ (the parenthesised part is a plain regex group).
    const inner = pattern.slice('/('.length, -')'.length)
    const re = new RegExp(`^/${inner}$`)

    it.each(['/login', '/login/', '/api/admin-auth/refresh', '/api/anything'])(
      'does NOT gate the excluded path %s',
      (path) => {
        expect(re.test(path)).toBe(false)
      },
    )

    it.each(['/favicon.ico', '/some/dir/asset.webp', '/logo.png'])('does NOT gate the static asset %s', (path) => {
      expect(re.test(path)).toBe(false)
    })

    it.each(['/', '/queue', '/queue/abc-123', '/merchants', '/merchants/new', '/merchants/m-1'])(
      'still gates the app page %s',
      (path) => {
        expect(re.test(path)).toBe(true)
      },
    )

    it('still treats prefix-collision paths as gated (segment anchoring intact)', () => {
      expect(re.test('/logindecoy')).toBe(true)
      expect(re.test('/apiary')).toBe(true)
    })
  })
})
