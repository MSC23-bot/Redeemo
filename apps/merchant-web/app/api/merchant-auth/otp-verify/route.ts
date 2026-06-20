import { NextRequest, NextResponse } from 'next/server'
import { backendPost, completeBffLogin } from '@/lib/auth/bff'

// POST /api/merchant-auth/otp-verify -> backend /otp/verify. On success the backend
// returns tokens; we park the refresh token in the httpOnly cookie and return
// { accessToken, merchant }.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}))
  const { res, data } = await backendPost('/otp/verify', body)
  if (!res.ok) {
    return NextResponse.json(data ?? { error: { code: 'UNKNOWN', message: 'Verification failed.' } }, { status: res.status })
  }
  const d = data as { accessToken?: string; refreshToken?: string; merchant?: unknown }
  if (d?.accessToken && d?.refreshToken) {
    return completeBffLogin({ accessToken: d.accessToken, refreshToken: d.refreshToken, merchant: d.merchant })
  }
  return NextResponse.json({ error: { code: 'UNEXPECTED_RESPONSE', message: 'Unexpected response from the server.' } }, { status: 502 })
}
