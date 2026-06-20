import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, backendPost, completeBffLogin } from '@/lib/auth/bff'

// POST /api/merchant-auth/login -> backend /login. Bimodal: an OTP-required login
// returns { status:'OTP_REQUIRED', sessionChallenge } unchanged (no cookie); a
// recognised-device login returns tokens, which we convert into an httpOnly session
// cookie + { accessToken, merchant }.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = assertSameOrigin(req)
  if (blocked) return blocked
  const body = await req.json().catch(() => ({}))
  const { res, data } = await backendPost('/login', body)
  if (!res.ok) {
    return NextResponse.json(data ?? { error: { code: 'UNKNOWN', message: 'Sign in failed.' } }, { status: res.status })
  }
  const d = data as { status?: string; sessionChallenge?: string; accessToken?: string; refreshToken?: string; merchant?: unknown }
  if (d?.status === 'OTP_REQUIRED') {
    if (!d.sessionChallenge) {
      return NextResponse.json({ error: { code: 'UNEXPECTED_RESPONSE', message: 'Unexpected response from the server.' } }, { status: 502 })
    }
    return NextResponse.json({ status: 'OTP_REQUIRED', sessionChallenge: d.sessionChallenge })
  }
  if (d?.accessToken && d?.refreshToken) {
    return completeBffLogin({ accessToken: d.accessToken, refreshToken: d.refreshToken, merchant: d.merchant })
  }
  return NextResponse.json({ error: { code: 'UNEXPECTED_RESPONSE', message: 'Unexpected response from the server.' } }, { status: 502 })
}
