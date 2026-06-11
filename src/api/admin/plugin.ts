import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { adminMerchantRoutes } from './merchants/routes'
import { adminApprovalRoutes } from './approvals/routes'
import { adminBranchRoutes } from './branches/routes'

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
  })
}

export default fp(adminManagementPlugin, {
  name: 'admin-management',
  dependencies: ['admin-auth'],
})
