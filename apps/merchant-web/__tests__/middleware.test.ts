/**
 * @jest-environment node
 */
import { middleware, config } from '@/middleware'
import type { NextRequest } from 'next/server'

function req(path: string, hasCookie: boolean): NextRequest {
  return {
    cookies: { has: () => hasCookie },
    nextUrl: { pathname: path, search: '' },
    url: `http://localhost:3003${path}`,
  } as unknown as NextRequest
}

describe('merchant-web middleware (M1 Slice 1 route protection)', () => {
  it('redirects an (app) page to /sign-in?next= when the session cookie is absent', () => {
    const res = middleware(req('/foundations', false))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/sign-in')
    expect(loc).toContain('next=%2Ffoundations')
  })

  it('passes through (no redirect) when the session cookie is present', () => {
    const res = middleware(req('/', true))
    expect(res.headers.get('location')).toBeNull()
  })

  it('does not put a /sign-in path into next (no auth-page round-trip)', () => {
    const res = middleware(req('/sign-in', false))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/sign-in')
    expect(loc).not.toContain('next=')
  })

  // Shell wave (fidelity finding): the matcher must EXCLUDE static asset files -
  // gating them breaks the /icon.png favicon for logged-out visitors and the
  // next/image optimizer's cookie-less upstream fetch of /redeemo-r-mark.png.
  // Simulate Next's path-to-regexp compilation of the '/((?!...).*)' matcher shape.
  describe('config.matcher static-asset exclusions', () => {
    const pattern = config.matcher[0]
    // '/((?!X).*)' -> ^/(?!X).*$ (the parenthesised part is a plain regex group).
    const inner = pattern.slice('/('.length, -')'.length)
    const re = new RegExp(`^/${inner}$`)

    it.each(['/icon.png', '/redeemo-r-mark.png', '/some/dir/asset.webp', '/fonts/Lato.woff2', '/favicon.ico'])(
      'does NOT gate the static asset %s',
      (path) => {
        expect(re.test(path)).toBe(false)
      },
    )

    it.each(['/', '/profile', '/account', '/promote', '/vouchers/v1', '/branches/b1'])(
      'still gates the app page %s',
      (path) => {
        expect(re.test(path)).toBe(true)
      },
    )

    it('still treats prefix-collision paths as gated (segment anchoring intact)', () => {
      expect(re.test('/registration')).toBe(true)
      expect(re.test('/claims')).toBe(true)
    })
  })
})
