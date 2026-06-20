import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { profileRoutes } from './profile/routes'
import { onboardingRoutes } from './onboarding/routes'
import { branchRoutes } from './branch/routes'
import { voucherRoutes } from './voucher/routes'
import { uploadRoutes } from './upload/routes'

async function merchantManagementPlugin(app: FastifyInstance) {
  // Register all merchant management routes inside a scoped sub-plugin so that
  // the preHandler hook is applied only to these routes and not globally.
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateMerchant)

    await scoped.register(profileRoutes)
    await scoped.register(onboardingRoutes)
    await scoped.register(branchRoutes)
    await scoped.register(voucherRoutes)
    await scoped.register(uploadRoutes)
  })
}

export default fp(merchantManagementPlugin, {
  name: 'merchant-management',
  dependencies: ['merchant-auth'],
})
