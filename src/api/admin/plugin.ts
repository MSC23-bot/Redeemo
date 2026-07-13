import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { adminMerchantRoutes } from './merchants/routes'
import { adminApprovalRoutes } from './approvals/routes'
import { adminBranchRoutes } from './branches/routes'
import { adminNotificationRoutes } from './notifications/routes'
import { adminTimelineRoutes } from './timeline/routes'
import { adminRedemptionRoutes } from './redemptions/routes'
import { adminTeamRoutes } from './team/routes'
import { adminLeadRoutes } from './leads/routes'
import { adminMerchantNoteRoutes } from './merchants/notes/routes'
import { adminEmailOpsRoutes } from './email-ops/routes'

// Phase 2 Slice 1 M2 — admin-management surface. Mirrors merchant/plugin.ts:
// a scoped sub-plugin applies the `authenticateAdmin` preHandler to all
// admin-management routes (not globally). Each route additionally gates on its
// own `requireAdminCapability(...)`.
async function adminManagementPlugin(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateAdmin)

    await scoped.register(adminMerchantRoutes)
    await scoped.register(adminApprovalRoutes)
    await scoped.register(adminBranchRoutes)
    // M7 — read-only merchant communication + activity timeline.
    await scoped.register(adminTimelineRoutes)
    // M2 — admin personal bell (no capability gate; scoped to the signed-in admin).
    await scoped.register(adminNotificationRoutes)
    // D67: read-only cross-merchant admin redemptions list.
    await scoped.register(adminRedemptionRoutes)
    // Team & Roles S1: SUPER_ADMIN-only account + capability-grant management.
    await scoped.register(adminTeamRoutes)
    // MerchantLead recruitment pipeline (packet 2026-07-12): gated on lead:manage.
    await scoped.register(adminLeadRoutes)
    // MerchantNote internal notes (packet 2026-07-13): gated on merchant:notes.
    await scoped.register(adminMerchantNoteRoutes)
    // §SEC.1 GAP-7: SUPER_ADMIN-only transactional-email ops view + resume
    // (gated on email:ops, held only by SUPER_ADMIN).
    await scoped.register(adminEmailOpsRoutes)
  })
}

export default fp(adminManagementPlugin, {
  name: 'admin-management',
  dependencies: ['admin-auth'],
})
