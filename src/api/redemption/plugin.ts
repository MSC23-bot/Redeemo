import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { customerRedemptionRoutes, staffRedemptionRoutes } from './routes'

async function redemptionPlugin(app: FastifyInstance) {
  // Customer routes — require customer JWT
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    await scoped.register(customerRedemptionRoutes)
  })

  // Staff routes (branch staff or merchant admin) — auth is handled per-route
  // because the endpoints accept EITHER a branch OR merchant JWT
  await app.register(staffRedemptionRoutes)
}

export default fp(redemptionPlugin, {
  name: 'redemption',
  dependencies: ['customer-auth', 'branch-auth', 'merchant-auth'],
})
