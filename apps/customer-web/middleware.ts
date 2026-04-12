import { type NextRequest, NextResponse } from 'next/server'

const PROTECTED = ['/account']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(`${p}/`))

  if (isProtected) {
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
  matcher: ['/account/:path*'],
}
