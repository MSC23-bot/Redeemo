import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, backendPost } from '@/lib/auth/bff'
import { readSessionCookie, clearSessionCookie } from '@/lib/auth/cookies'

// Bounded timeout for the backend revoke (design §3.4 point 1: this budget
// MUST sit inside the client's own bounded await, so the client's await still
// returns in time to confirm cookie clearance — see lib/auth/session.tsx
// signOut). 3s comfortably covers a normal backend round-trip while staying
// well under any reasonable client-side timeout.
const BACKEND_REVOKE_TIMEOUT_MS = 3000

type RemoteRevoke = 'confirmed' | 'pending' | 'unavailable'

// POST /api/merchant-auth/logout (backend logout-durability design 2026-07-06,
// §3.4 point 2 + §4.5). Same-origin only (so a cross-site page cannot force-
// clear the cookie). Forwards BOTH proof sources to the backend:
//   - the captured ACCESS TOKEN (primary, authoritative — the client captures
//     it BEFORE resetting its own state and sends it as Bearer here);
//   - the httpOnly cookie's { refreshToken, sessionId, entityId } (fallback,
//     for the rare case the client held no access token at all).
// The backend revoke is awaited under a STRICT bounded timeout so this route
// never hangs. This route ALWAYS attempts `clearSessionCookie` on its
// response regardless of the backend outcome — a `Set-Cookie` clear header is
// the ONLY way JavaScript's confirmed cookie clearance can be observed (the
// httpOnly cookie itself is unreachable from the page), so a backend failure
// or timeout must never block that clear.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = assertSameOrigin(req)
  if (blocked) return blocked

  const authorization = req.headers.get('authorization') ?? undefined
  const session = await readSessionCookie()

  let remoteRevoke: RemoteRevoke = 'unavailable'

  if (authorization || session) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), BACKEND_REVOKE_TIMEOUT_MS)
    try {
      const body = session
        ? { refreshToken: session.refreshToken, sessionId: session.sessionId, entityId: session.entityId }
        : undefined
      const { data } = await backendPost(
        '/logout',
        body,
        authorization ? { authorization } : {},
        controller.signal,
      )
      const revoke = (data as { revoke?: string } | null)?.revoke
      remoteRevoke = revoke === 'confirmed' || revoke === 'pending' ? revoke : 'unavailable'
    } catch {
      // Timed out, aborted, or the backend was unreachable — the honest
      // degraded outcome. Cookie clearance below still proceeds.
      remoteRevoke = 'unavailable'
    } finally {
      clearTimeout(timer)
    }
  } else {
    // No token AND no cookie — nothing to revoke server-side. Cookie
    // clearance below is a no-op too (there was nothing to clear), but the
    // outcome is trivially "confirmed" (there is no live session material
    // anywhere for this browser to have re-armed).
    remoteRevoke = 'confirmed'
  }

  await clearSessionCookie()
  return NextResponse.json({ ok: true, remoteRevoke })
}
