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
  // The (auth)/api tokens are anchored to a FULL path segment ((?:/|$)) so a future
  // authed path that merely STARTS WITH one (e.g. /otp-settings, /claims, /registration)
  // is still gated, not silently treated as public.
  // Static image/font files are excluded by EXTENSION: they are public brand
  // assets, and gating them breaks (a) the /icon.png favicon for logged-out
  // visitors on /sign-in and (b) the next/image optimizer, whose internal
  // upstream fetch of /redeemo-r-mark.png carries no session cookie and would
  // receive the /sign-in HTML instead of the image (shell-wave fidelity finding).
  matcher: [
    '/((?!(?:sign-in|otp|forgot-password|reset-password|claim|register|api)(?:/|$)|_next/|favicon\\.ico|fonts/|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?)$).*)',
  ],
}
