import { NextResponse } from 'next/server'
import { setSessionCookie } from './cookies'
import { decodeMerchantJwt } from './jwt'

// M1 Slice 1: shared BFF-lite helpers. The token-issuing merchant-auth flows go
// THROUGH these same-origin route handlers (NOT direct browser->backend) so the
// long-lived refresh token can be parked in an httpOnly cookie the browser JS
// never sees; only the short-lived access token + the non-sensitive merchant
// object are returned to the page.
export const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

interface BackendResult {
  res: Response
  data: unknown
}

/** POST to the backend merchant-auth API. `body === undefined` sends no body. */
export async function backendPost(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<BackendResult> {
  const res = await fetch(`${BACKEND}/api/v1/merchant/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
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
 */
export async function completeBffLogin(data: TokenResult): Promise<NextResponse> {
  const claims = decodeMerchantJwt(data.accessToken)
  if (!claims) {
    return NextResponse.json(
      { error: { code: 'SESSION_INIT_FAILED', message: 'Could not start your session. Please try again.' } },
      { status: 500 },
    )
  }
  await setSessionCookie({ refreshToken: data.refreshToken, sessionId: claims.sessionId, entityId: claims.sub })
  return NextResponse.json({ accessToken: data.accessToken, merchant: data.merchant })
}
