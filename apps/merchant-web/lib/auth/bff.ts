import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from './cookies'
import { decodeMerchantJwt } from './jwt'

// M1 Slice 1: shared BFF-lite helpers. The token-issuing merchant-auth flows go
// THROUGH these same-origin route handlers (NOT direct browser->backend) so the
// long-lived refresh token can be parked in an httpOnly cookie the browser JS
// never sees; only the short-lived access token + the non-sensitive merchant
// object are returned to the page.
export const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

// CSRF defence for the state-changing BFF POST routes. SameSite=Lax already stops
// the session cookie from being sent on a cross-site POST, but /logout clears the
// cookie unconditionally, so a cross-site POST could still force a logout. Reject any
// request whose Origin header is present and cross-origin. (Same-origin fetch from
// our own pages always sends a matching Origin; a missing Origin is allowed since the
// only callers are our own same-origin handlers.)
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin')
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: { code: 'CROSS_ORIGIN_BLOCKED', message: 'Request blocked.' } }, { status: 403 })
  }
  return null
}

interface BackendResult {
  res: Response
  data: unknown
}

/** POST to the backend merchant-auth API. `body === undefined` sends NO body. */
export async function backendPost(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<BackendResult> {
  const hasBody = body !== undefined
  const res = await fetch(`${BACKEND}/api/v1/merchant/auth${path}`, {
    method: 'POST',
    // Only set content-type when there IS a body: a JSON content-type + empty body
    // makes Fastify reject the request (FST_ERR_CTP_EMPTY_JSON_BODY), which would
    // silently fail the bodyless /logout server-side revoke.
    headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...headers },
    body: hasBody ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { res, data }
}

interface TokenResult {
  accessToken: string
  refreshToken: string
  merchant: unknown
}

/**
 * For the token-issuing flows (login success, otp/verify, register/verify): decode
 * the access JWT for { sub, sessionId }, park { refreshToken, sessionId, entityId }
 * in the httpOnly cookie, and return ONLY { accessToken, merchant } to the browser.
 * A malformed token (undecodable) or a missing merchant object fails closed with a
 * typed error rather than emitting a body the client's Zod parse would reject.
 */
export async function completeBffLogin(data: TokenResult): Promise<NextResponse> {
  const claims = decodeMerchantJwt(data.accessToken)
  if (!claims || data.merchant == null) {
    return NextResponse.json(
      { error: { code: 'SESSION_INIT_FAILED', message: 'Could not start your session. Please try again.' } },
      { status: 500 },
    )
  }
  await setSessionCookie({ refreshToken: data.refreshToken, sessionId: claims.sessionId, entityId: claims.sub })
  return NextResponse.json({ accessToken: data.accessToken, merchant: data.merchant })
}
