import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdminCapability } from '../capability'
import { getMerchantTimeline } from './service'

// Phase 2 Slice 1 M7 — the merchant communication + activity timeline route
// (READ ONLY). `authenticateAdmin` is applied by the admin-management plugin
// scope; this read gates on `approval:read` (same as the review-context read).
// The path lives under /admin/merchants/:id/... but does not collide with the
// existing merchant routes (suspend/reactivate are POST; create-draft is
// POST /admin/merchants) — this is GET .../:id/timeline.
export async function adminTimelineRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/admin/merchants/:id/timeline',
    { preHandler: [requireAdminCapability('approval:read')] },
    async (req: any) => getMerchantTimeline(app.prisma, z.object({ id: z.string().min(1) }).parse(req.params).id),
  )
}
