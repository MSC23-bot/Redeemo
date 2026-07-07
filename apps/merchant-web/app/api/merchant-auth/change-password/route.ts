import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, backendPost } from '@/lib/auth/bff'

// My Account (§BP-ACC): authenticated change-password. Same-origin BFF passthrough
// mirroring the existing /api/merchant-auth/logout route - every route under
// /api/v1/merchant/auth is BFF-fronted (login/otp/register/refresh/logout), so this
// authenticated action follows the same convention for namespace consistency, even
// though it issues no new session material and sets no cookie. It purely forwards
// the caller's Authorization header + JSON body to the backend and relays the
// response verbatim, behind the same same-origin CSRF guard every state-changing
// merchant-auth route uses.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = assertSameOrigin(req)
  if (blocked) return blocked

  const authorization = req.headers.get('authorization')
  if (!authorization) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Please sign in again.' } },
      { status: 401 },
    )
  }

  const body = (await req.json().catch(() => null)) as { currentPassword?: unknown; newPassword?: unknown } | null
  if (!body || typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Enter your current and new password.' } },
      { status: 400 },
    )
  }

  const { res, data } = await backendPost(
    '/change-password',
    { currentPassword: body.currentPassword, newPassword: body.newPassword },
    { authorization },
  )
  return NextResponse.json(data, { status: res.status })
}
