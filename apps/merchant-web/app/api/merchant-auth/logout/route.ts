import { NextRequest, NextResponse } from 'next/server'
import { backendPost } from '@/lib/auth/bff'
import { clearSessionCookie } from '@/lib/auth/cookies'

// POST /api/merchant-auth/logout. Best-effort revoke server-side (forward the
// browser's in-memory access token as Bearer so the backend can delete the refresh
// token for this session), then ALWAYS clear the httpOnly cookie. Clearing the
// cookie is what truly ends the browser session (no refresh material remains), so a
// backend failure or an already-expired token never blocks logout.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const authorization = req.headers.get('authorization')
  if (authorization) {
    try {
      await backendPost('/logout', undefined, { authorization })
    } catch {
      // best-effort: cookie clearing below is the real logout
    }
  }
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
