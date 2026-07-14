// §SEC.1 GAP-7 (plan 2026-07-10-transactional-email-enablement §1.7): the
// SUPER_ADMIN transactional-email OPS routes. Both are gated on the `email:ops`
// capability, which is held ONLY by SUPER_ADMIN (not in any role baseline, not
// grantable), so the capability gate IS the SUPER_ADMIN gate (admin:manage-team
// precedent). `authenticateAdmin` is applied by the admin-management plugin scope;
// a request lacking the capability is refused 403 (fail-closed) by requireAdminCapability.
//
//   GET  /api/v1/admin/email-ops         : read-only 24h send/failed/bounced
//                                           aggregates + Redis counters + pause state.
//   POST /api/v1/admin/email-ops/resume  : clear the GAP-6 auto send-pause.

import { FastifyInstance } from 'fastify'
import { requireAdminCapability } from '../capability'
import { readEmailOps, resumeEmailSending } from './service'

export async function adminEmailOpsRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/email-ops'
  const gate = { preHandler: [requireAdminCapability('email:ops')] }

  app.get(prefix, gate, async () => {
    return readEmailOps(app.prisma, app.redis)
  })

  app.post(`${prefix}/resume`, gate, async (req: any) => {
    return resumeEmailSending(app.prisma, app.redis, {
      adminId: req.user.sub,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
  })
}
