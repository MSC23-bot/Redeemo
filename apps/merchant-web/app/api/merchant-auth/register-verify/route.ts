import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, backendPost, completeBffLogin } from '@/lib/auth/bff'

// POST /api/merchant-auth/register-verify -> backend /register/verify (note the path
// asymmetry: hyphen here, nested there). Verifying the emailed code AUTO-LOGS-IN the
// new owner: the backend returns tokens, which we convert into an httpOnly session
// cookie + { accessToken, merchant } so they land straight in the portal.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = assertSameOrigin(req)
  if (blocked) return blocked
  const body = await req.json().catch(() => ({}))
  const { res, data } = await backendPost('/register/verify', body)
  if (!res.ok) {
    return NextResponse.json(data ?? { error: { code: 'UNKNOWN', message: 'Verification failed.' } }, { status: res.status })
  }
  const d = data as { accessToken?: string; refreshToken?: string; merchant?: unknown }
  if (d?.accessToken && d?.refreshToken) {
    return completeBffLogin({ accessToken: d.accessToken, refreshToken: d.refreshToken, merchant: d.merchant })
  }
  return NextResponse.json({ error: { code: 'UNEXPECTED_RESPONSE', message: 'Unexpected response from the server.' } }, { status: 502 })
}
