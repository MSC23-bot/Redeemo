import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, backendPost, completeBffLogin } from '@/lib/auth/bff'

// POST /api/admin-auth/otp-verify -> backend /otp/verify. On success the
// backend returns { accessToken, refreshToken, admin }; we park the refresh
// token in the httpOnly cookie and return ONLY { accessToken, meta }.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = assertSameOrigin(req)
  if (blocked) return blocked
  const body = await req.json().catch(() => ({}))
  const { res, data } = await backendPost('/otp/verify', body)
  if (!res.ok) {
    return NextResponse.json(data ?? { error: { code: 'UNKNOWN', message: 'Verification failed.' } }, { status: res.status })
  }
  const d = data as {
    accessToken?: string
    refreshToken?: string
    admin?: { id: string; email: string; adminRole: string }
  }
  if (d?.accessToken && d?.refreshToken) {
    return completeBffLogin({
      accessToken: d.accessToken,
      refreshToken: d.refreshToken,
      admin: d.admin as { id: string; email: string; adminRole: 'SUPER_ADMIN' | 'OPERATIONS' | 'FINANCE' | 'CONTENT' | 'SUPPORT' },
    })
  }
  return NextResponse.json({ error: { code: 'UNEXPECTED_RESPONSE', message: 'Unexpected response from the server.' } }, { status: 502 })
}
