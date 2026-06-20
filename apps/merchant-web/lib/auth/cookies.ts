// NOTE: this module is server-only by virtue of importing next/headers (cookies()
// is unavailable in a client bundle). The BFF route handlers + the refresh-on-mount
// flow are the only callers.
import { cookies } from 'next/headers'

// M1 Slice 1: the httpOnly session cookie. It holds the refresh material the BFF
// route handlers need to mint fresh access tokens; the browser JS can NEVER read
// it (httpOnly). httpOnly + Secure(prod) + SameSite=Lax (the spec-locked attrs):
//   - httpOnly  -> not readable by page scripts (XSS cannot exfiltrate the refresh token)
//   - Secure    -> only sent over HTTPS in production (dev over http stays usable)
//   - SameSite=Lax -> not sent on cross-site subrequests (CSRF posture); the BFF
//     route handlers are same-origin POSTs from our own app so Lax is sufficient.
// The value is the opaque refresh token + the JWT-derived sessionId/entityId; it is
// NOT signed (the refresh token is backend-validated on use, so tampering only
// breaks the session, never forges one). Path '/' so the middleware + all BFF
// handlers see it.
const SESSION_COOKIE = 'redeemo_merchant_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days (refresh-token outer lifetime)

export interface MerchantSession {
  refreshToken: string
  sessionId: string
  entityId: string
}

export async function setSessionCookie(session: MerchantSession): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
}

export async function readSessionCookie(): Promise<MerchantSession | null> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<MerchantSession>
    if (
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.sessionId === 'string' &&
      typeof parsed.entityId === 'string'
    ) {
      return { refreshToken: parsed.refreshToken, sessionId: parsed.sessionId, entityId: parsed.entityId }
    }
    return null
  } catch {
    return null
  }
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
