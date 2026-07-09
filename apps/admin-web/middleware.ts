import { NextRequest, NextResponse } from 'next/server'

// H5 migration: route protection (also closes audit L7 — admin-web previously
// had no middleware at all). Redirect-before-paint for any (app) page when the
// httpOnly session cookie is absent. Because (auth) and (app) are URL-transparent
// route groups (no path prefix), the matcher EXCLUDES the public (auth) page
// (/login), the BFF + Next API, and static assets; everything else (the (app)
// pages: '/', '/queue', '/merchants', ...) is gated. The cookie is httpOnly so
// middleware can only check PRESENCE; the client SessionProvider does the real
// validation (refresh-on-mount, G1).
const SESSION_COOKIE = 'redeemo_admin_session'

export function middleware(req: NextRequest): NextResponse {
  if (req.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next()
  }
  const url = new URL('/login', req.url)
  const next = req.nextUrl.pathname + req.nextUrl.search
  // Avoid round-tripping the login page itself into `next` (defence-in-depth;
  // the matcher already excludes it).
  if (next && !next.startsWith('/login')) {
    url.searchParams.set('next', next)
  }
  return NextResponse.redirect(url)
}

export const config = {
  // Gate everything EXCEPT the (auth) login page, the BFF + Next API, and
  // static assets. The login/api tokens are anchored to a FULL path segment
  // ((?:/|$)) so a future authed path that merely STARTS WITH one is still
  // gated, not silently treated as public.
  matcher: [
    '/((?!(?:login|api)(?:/|$)|_next/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?)$).*)',
  ],
}
