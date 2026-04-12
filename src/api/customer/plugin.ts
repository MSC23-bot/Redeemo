import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { discoveryRoutes } from './discovery/routes'
import { profileRoutes } from './profile/routes'
import { favouritesRoutes } from './favourites/routes'
import { reviewOpenRoutes, reviewAuthRoutes } from './reviews/routes'
import { savingsRoutes } from './savings/routes'

/**
 * Attempts to extract the `sub` (userId) from an Authorization: Bearer <token>
 * header without verifying the signature. This is intentionally insecure and is
 * used only for personalisation (e.g. isFavourited) in open-scope routes — it
 * is NOT a security boundary.
 */
export function optionalUserId(req: FastifyRequest): string | null {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const parts = authHeader.split('.')
  if (parts.length !== 3) return null
  try {
    // Decode the payload section (index 1) without verifying the signature
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8')
    const payload = JSON.parse(payloadJson)
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

async function customerPlugin(app: FastifyInstance) {
  // ------------------------------------------------------------------
  // Open scope — no authentication required
  // A bearer token may be present and is decoded (without verification)
  // for personalisation purposes only via optionalUserId().
  // ------------------------------------------------------------------
  app.register(async (open) => {
    // Health check — useful for tests and monitoring
    open.get('/api/v1/customer/health', async () => ({ ok: true }))

    // Discovery routes (no auth required)
    open.register(discoveryRoutes)

    // Review list routes (no auth required, optional userId for isOwnReview)
    open.register(reviewOpenRoutes)
  })

  // ------------------------------------------------------------------
  // Authenticated scope — valid customer JWT required
  // ------------------------------------------------------------------
  app.register(async (authed) => {
    authed.addHook('preHandler', app.authenticateCustomer)

    // Stub: return authenticated user identity
    authed.get('/api/v1/customer/me', async (req: any) => ({
      ok: true,
      userId: req.user?.sub ?? null,
    }))

    // Profile routes — GET/PATCH profile, PUT interests, POST change-password
    authed.register(profileRoutes)

    // Favourites routes — merchant + voucher add/remove/list
    authed.register(favouritesRoutes)

    // Review write routes — upsert, delete, report (auth required)
    authed.register(reviewAuthRoutes)

    // Savings routes — summary + redemptions history
    authed.register(savingsRoutes)
  })
}

export default fp(customerPlugin, {
  name: 'customer',
  dependencies: ['customer-auth'],
})
