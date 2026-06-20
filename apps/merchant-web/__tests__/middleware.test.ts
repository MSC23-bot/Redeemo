/**
 * @jest-environment node
 */
import { middleware } from '@/middleware'
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
})
