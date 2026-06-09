import { type NextRequest, NextResponse } from 'next/server'

// Auth-gated routes (existing).
const PROTECTED = ['/account']

// SEC-C3 (Gate-PR-4a): marketplace surfaces. Pre-launch these are HIDDEN so
// seeded/demo merchants, branches and vouchers can never be shown as if they
// were real supply. They open when NEXT_PUBLIC_MARKETPLACE_LIVE === 'true'
// (set at launch, AFTER the seed scrub). Marketing/landing/auth pages stay
// visible pre-launch.
const MARKETPLACE = ['/discover', '/map', '/merchants', '/search', '/categories']

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Temporary (pre-marketplace-launch): the bare /merchants route still renders
  // merchant-pitch content that duplicates /for-businesses. Send it to the
  // canonical pitch page until /merchants is rebuilt as the customer directory.
  // Exact match only — /merchants/<id> (the customer merchant profile) must fall
  // through to the marketplace gate below. 307 temporary, not permanent: the path
  // will be reclaimed for the directory, so the redirect must not be cached as final.
  if (pathname === '/merchants') {
    return NextResponse.redirect(new URL('/for-businesses', request.url), 307)
  }

  // Marketplace flag-gate — redirect to the landing page when the marketplace
  // is not yet live. NEXT_PUBLIC_MARKETPLACE_LIVE is inlined at build time, so
  // flipping it requires a rebuild/redeploy (a deliberate launch action).
  if (process.env.NEXT_PUBLIC_MARKETPLACE_LIVE !== 'true' && matchesPrefix(pathname, MARKETPLACE)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (matchesPrefix(pathname, PROTECTED)) {
    const authCookie = request.cookies.get('redeemo_auth')
    if (!authCookie) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/account',
    '/account/:path*',
    '/discover',
    '/discover/:path*',
    '/map',
    '/map/:path*',
    '/merchants',
    '/merchants/:path*',
    '/search',
    '/search/:path*',
    '/categories',
    '/categories/:path*',
  ],
}
