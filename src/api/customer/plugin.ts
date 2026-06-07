import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { discoveryRoutes } from './discovery/routes'
import { profileRoutes } from './profile/routes'
import { favouritesRoutes } from './favourites/routes'
import { reviewOpenRoutes, reviewAuthRoutes } from './reviews/routes'
import { savingsRoutes } from './savings/routes'
import { postcodeRoutes } from './postcode/routes'

/**
 * Extracts the customer `sub` (userId) from an Authorization: Bearer <token>
 * header IF the token's signature verifies — using the same @fastify/jwt
 * 'customer' verifier (secret JWT_SECRET_CUSTOMER) the authenticated scope's
 * preHandler uses. Open-scope routes call this for per-user personalisation
 * (isFavourited, the owner's own lastRedemption, etc.).
 *
 * SEC-C1 (Gate-PR-5): a missing, malformed, expired, or FORGED token returns
 * null (guest). It NEVER trusts an unverified payload, so a caller cannot
 * impersonate another user by crafting a token with someone else's `sub`. This
 * replaced an earlier helper that base64-decoded the payload WITHOUT verifying
 * the signature — which let a forged token leak the victim's redemption code
 * and other per-user state on open reads.
 */
export async function optionalUserId(req: FastifyRequest): Promise<string | null> {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  try {
    // Signature check against JWT_SECRET_CUSTOMER (throws on missing/invalid/
    // forged/expired); populates req.user from the verified claims.
    await (req as unknown as { customerVerify: () => Promise<unknown> }).customerVerify()
    const sub = (req.user as { sub?: string } | undefined)?.sub
    return typeof sub === 'string' ? sub : null
  } catch {
    return null
  }
}

async function customerPlugin(app: FastifyInstance) {
  // ------------------------------------------------------------------
  // Open scope — no authentication required
  // A bearer token may be present; optionalUserId() VERIFIES its signature
  // (SEC-C1) and yields a userId only for a valid customer token, else guest.
  // ------------------------------------------------------------------
  app.register(async (open) => {
    // Health check — useful for tests and monitoring
    open.get('/api/v1/customer/health', async () => ({ ok: true }))

    // Discovery routes (no auth required)
    open.register(discoveryRoutes)

    // Review list routes (no auth required, optional userId for isOwnReview)
    open.register(reviewOpenRoutes)

    // Postcode preview (no auth required — PC2 onboarding happens pre-auth).
    // Read-only by design: M1.19 service uses findExistingLocality, NOT
    // findOrCreateLocality, so PC2 debounced typing cannot auto-create rows.
    open.register(postcodeRoutes)
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
