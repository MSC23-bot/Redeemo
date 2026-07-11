import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, backendPost, completeBffLogin } from '@/lib/auth/bff'
import type { AdminRole } from '@/lib/auth/session'

// POST /api/admin-auth/login -> backend /login. Admin login is OTP-first, so the
// response is (today) always { status:'OTP_REQUIRED', sessionChallenge } (pass
// through unchanged, no cookie). The tokens branch is kept defensively in case
// the backend ever short-circuits straight to tokens for a recognised device.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = assertSameOrigin(req)
  if (blocked) return blocked
  const body = await req.json().catch(() => ({}))
  const { res, data } = await backendPost('/login', body)
  if (!res.ok) {
    return NextResponse.json(data ?? { error: { code: 'UNKNOWN', message: 'Sign in failed.' } }, { status: res.status })
  }
  const d = data as {
    status?: string
    sessionChallenge?: string
    accessToken?: string
    refreshToken?: string
    admin?: { id: string; email: string; adminRole: string }
  }
  if (d?.status === 'OTP_REQUIRED') {
    if (!d.sessionChallenge) {
      return NextResponse.json({ error: { code: 'UNEXPECTED_RESPONSE', message: 'Unexpected response from the server.' } }, { status: 502 })
    }
    return NextResponse.json({ status: 'OTP_REQUIRED', sessionChallenge: d.sessionChallenge })
  }
  if (d?.accessToken && d?.refreshToken) {
    return completeBffLogin({
      accessToken: d.accessToken,
      refreshToken: d.refreshToken,
      admin: d.admin as { id: string; email: string; adminRole: AdminRole },
    })
  }
  return NextResponse.json({ error: { code: 'UNEXPECTED_RESPONSE', message: 'Unexpected response from the server.' } }, { status: 502 })
}
