import { NextRequest, NextResponse } from 'next/server'

// M1 Slice 1: route protection. Redirect-before-paint for any (app) page when the
// httpOnly session cookie is absent. Because (auth) and (app) are URL-transparent
// route groups (no path prefix), the matcher EXCLUDES the public (auth) paths, the
// BFF API, and static assets; everything else (the (app) pages: '/', '/foundations',
// future ones) is gated. The cookie is httpOnly so middleware can only check
// PRESENCE; the client SessionProvider does the real validation (refresh-on-mount).
const SESSION_COOKIE = 'redeemo_merchant_session'

export function middleware(req: NextRequest): NextResponse {
  if (req.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next()
  }
  const url = new URL('/sign-in', req.url)
  const next = req.nextUrl.pathname + req.nextUrl.search
  // Avoid round-tripping an auth page into `next` (defence-in-depth; the matcher
  // already excludes them).
  if (next && !next.startsWith('/sign-in')) {
    url.searchParams.set('next', next)
  }
  return NextResponse.redirect(url)
}

export const config = {
  // Gate everything EXCEPT the (auth) pages, the BFF + Next API, and static assets.
  matcher: [
    '/((?!sign-in|otp|forgot-password|reset-password|claim|register|api|_next/static|_next/image|favicon.ico|fonts|robots.txt|sitemap.xml).*)',
  ],
}
