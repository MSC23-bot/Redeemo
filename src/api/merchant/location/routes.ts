import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { AppError } from '../../shared/errors'
import { resolveMerchantContext } from '../shared'
import { searchMerchantLocations } from './service'

// §4a: a min-length-3 trimmed query. The client-side debounce + min-query-length
// is the cheap first line of abuse protection (Layer 3); this is the server guard.
const searchBody = z.object({
  query: z.string().trim().min(3),
})

export async function locationRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/location'

  // POST /api/v1/merchant/location/search — merchant-level Google location search
  // (Branches PR-6 §4a). NO branch id: the create / add-branch / onboarding flows
  // have no branch id yet, and the search itself is branch-agnostic (query ->
  // candidates). Gated OWNER-or-BRANCH_MANAGER (STAFF denied); the per-branch teeth
  // are enforced at the APPLY step (Layer 2), not here. The limiter (the LOCKED
  // pre-live multi-instance-safe cap) fires BEFORE Google inside the service.
  //
  // SECURITY: the wire DTO STRIPS latitude / longitude / googleMapsUrl / placeId —
  // each candidate carries only an opaque candidateToken; the coords stay
  // server-side (the candidate-token stash). Coords NEVER cross the wire in either
  // direction.
  app.post(`${prefix}/search`, async (req: FastifyRequest, reply) => {
    const { query } = searchBody.parse(req.body)

    // Auth: resolve the role-aware merchant context (keeps the SEC-M2 suspended
    // guard) and admit OWNER or BRANCH_MANAGER only. STAFF is denied — they are
    // view/validate-only and cannot create or edit a branch.
    const ctx = await resolveMerchantContext(app.prisma, req.user.sub)
    if (ctx.role === 'STAFF') throw new AppError('INSUFFICIENT_PERMISSIONS')

    const candidates = await searchMerchantLocations(
      app.redis,
      { userId: ctx.adminId, merchantId: ctx.merchantId, ip: req.ip },
      query,
    )
    return reply.send({ candidates })
  })
}
