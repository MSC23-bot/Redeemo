import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { subscriptionRoutes } from './routes'

async function subscriptionPlugin(app: FastifyInstance) {
  // Register all subscription routes inside a scoped sub-plugin so that
  // the preHandler hook is applied only to these routes and not globally.
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)

    await scoped.register(subscriptionRoutes)
  })
}

export default fp(subscriptionPlugin, {
  name: 'subscription',
  dependencies: ['customer-auth'],
})
