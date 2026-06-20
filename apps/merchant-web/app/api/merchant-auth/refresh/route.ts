import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, backendPost } from '@/lib/auth/bff'
import { readSessionCookie, setSessionCookie, clearSessionCookie } from '@/lib/auth/cookies'
import { decodeMerchantJwt } from '@/lib/auth/jwt'

// POST /api/merchant-auth/refresh -> backend /refresh. Reads the httpOnly cookie,
// calls the backend with { refreshToken, sessionId, entityId }, ROTATES the cookie
// with the new (single-use) refresh token, and returns ONLY { accessToken } to the
// browser. On any failure the cookie is cleared (the session is dead) and the
// backend status is forwarded so the client can hard-logout.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = assertSameOrigin(req)
  if (blocked) return blocked
  const session = await readSessionCookie()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'REFRESH_TOKEN_INVALID', message: 'Your session has expired. Please log in again.' } },
      { status: 401 },
    )
  }

  const { res, data } = await backendPost('/refresh', {
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    entityId: session.entityId,
  })

  if (!res.ok) {
    await clearSessionCookie()
    return NextResponse.json(
      data ?? { error: { code: 'REFRESH_TOKEN_INVALID', message: 'Your session has expired. Please log in again.' } },
      { status: res.status },
    )
  }

  const d = data as { accessToken?: string; refreshToken?: string }
  if (!d?.accessToken || !d?.refreshToken) {
    await clearSessionCookie()
    return NextResponse.json(
      { error: { code: 'REFRESH_TOKEN_INVALID', message: 'Your session has expired. Please log in again.' } },
      { status: 401 },
    )
  }

  // Rotate the cookie. sessionId/entityId are stable across rotation, but re-derive
  // from the fresh token defensively (fall back to the existing values).
  const claims = decodeMerchantJwt(d.accessToken)
  await setSessionCookie({
    refreshToken: d.refreshToken,
    sessionId: claims?.sessionId ?? session.sessionId,
    entityId: claims?.sub ?? session.entityId,
  })

  return NextResponse.json({ accessToken: d.accessToken })
}
