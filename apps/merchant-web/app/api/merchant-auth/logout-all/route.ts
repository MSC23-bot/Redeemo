import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, backendPost } from '@/lib/auth/bff'

// My Account (§BP-ACC): "Sign out of all other devices" - same-origin BFF
// passthrough mirroring /api/merchant-auth/logout (see that route + change-password
// for the full rationale). The backend keeps the CALLER's current session alive and
// revokes every other one, so this route never touches the httpOnly session cookie
// itself - it forwards the bearer token and relays the backend's
// { message, revokedCount } body unchanged.
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

  const { res, data } = await backendPost('/logout-all', undefined, { authorization })
  return NextResponse.json(data, { status: res.status })
}
