import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'

async function customerAuthPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET_CUSTOMER ?? 'dev-customer-secret',
    namespace: 'customer',
    jwtVerify: 'customerVerify',
    jwtSign: 'customerSign',
  })

  app.decorate('authenticateCustomer', async function (request: any, reply: any) {
    try {
      await request.customerVerify()
    } catch {
      return reply.status(401).send({
        error: { code: 'REFRESH_TOKEN_INVALID', message: 'Unauthorized.', statusCode: 401 },
      })
    }
  })
}

export default fp(customerAuthPlugin, { name: 'customer-auth' })

declare module 'fastify' {
  interface FastifyInstance {
    authenticateCustomer: (request: any, reply: any) => Promise<void>
  }
}
