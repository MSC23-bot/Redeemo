import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin, backendPost } from '@/lib/auth/bff'
import { clearSessionCookie } from '@/lib/auth/cookies'

// G2 (migration plan §5b): unlike merchant's /logout, the backend
// POST /api/v1/admin/auth/logout is BEARER-authed (authenticateAdmin) - NOT
// cookie/body-only. It reads entityId/sessionId off the verified JWT itself, so
// there is no body to forward and no cookie-derived fallback proof to send (a
// bodyless POST with no Authorization would just 401 at the backend, so we
// don't bother making the call at all in that case).
const BACKEND_REVOKE_TIMEOUT_MS = 3000

type RemoteRevoke = 'confirmed' | 'unavailable'

// POST /api/admin-auth/logout. Same-origin only (so a cross-site page cannot
// force-clear the cookie). Forwards the captured ACCESS TOKEN (the client
// captures it BEFORE resetting its own state and sends it as Bearer here) to
// the backend revoke, awaited under a STRICT bounded timeout so this route
// never hangs. This route ALWAYS attempts `clearSessionCookie` on its response
// regardless of the backend outcome - a `Set-Cookie` clear header is the ONLY
// way JavaScript's confirmed cookie clearance can be observed (the httpOnly
// cookie itself is unreachable from the page), so a backend failure or timeout
// must never block that clear.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = assertSameOrigin(req)
  if (blocked) return blocked

  const authorization = req.headers.get('authorization') ?? undefined

  let remoteRevoke: RemoteRevoke = 'unavailable'

  if (authorization) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), BACKEND_REVOKE_TIMEOUT_MS)
    try {
      const { res } = await backendPost('/logout', undefined, { authorization }, controller.signal)
      remoteRevoke = res.ok ? 'confirmed' : 'unavailable'
    } catch {
      // Timed out, aborted, or the backend was unreachable - the honest
      // degraded outcome. Cookie clearance below still proceeds.
      remoteRevoke = 'unavailable'
    } finally {
      clearTimeout(timer)
    }
  }
  // No captured access token: the backend logout is bearer-only, so there is
  // nothing we can authenticate a revoke call with. `remoteRevoke` stays
  // 'unavailable' - honest, not a false 'confirmed'. Cookie clearance below
  // still proceeds regardless.

  await clearSessionCookie()
  return NextResponse.json({ ok: true, remoteRevoke })
}
