import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { profileRoutes } from './profile/routes'
import { merchantAccountRoutes } from './account/routes'
import { onboardingRoutes } from './onboarding/routes'
import { branchRoutes } from './branch/routes'
import { locationRoutes } from './location/routes'
import { voucherRoutes } from './voucher/routes'
import { uploadRoutes } from './upload/routes'
import { merchantRedemptionRoutes } from './redemptions/routes'
import { merchantNotificationRoutes } from './notifications/routes'
import { staffRoutes } from './staff/routes'
import { merchantInsightsRoutes } from './insights/routes'

async function merchantManagementPlugin(app: FastifyInstance) {
  // Register all merchant management routes inside a scoped sub-plugin so that
  // the preHandler hook is applied only to these routes and not globally.
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateMerchant)

    await scoped.register(profileRoutes)
    await scoped.register(merchantAccountRoutes)
    await scoped.register(onboardingRoutes)
    await scoped.register(branchRoutes)
    await scoped.register(locationRoutes)
    await scoped.register(voucherRoutes)
    await scoped.register(uploadRoutes)
    await scoped.register(merchantRedemptionRoutes)
    await scoped.register(merchantNotificationRoutes)
    await scoped.register(staffRoutes)
    await scoped.register(merchantInsightsRoutes)
  })
}

export default fp(merchantManagementPlugin, {
  name: 'merchant-management',
  dependencies: ['merchant-auth'],
})
