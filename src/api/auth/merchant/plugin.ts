import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'

async function merchantAuthPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET_MERCHANT ?? 'dev-merchant-secret',
    namespace: 'merchant',
    jwtVerify: 'merchantVerify',
    jwtSign: 'merchantSign',
  })

  app.decorate('authenticateMerchant', async function (request: any, reply: any) {
    try {
      await request.merchantVerify()
    } catch {
      return reply.status(401).send({
        error: { code: 'REFRESH_TOKEN_INVALID', message: 'Unauthorized.', statusCode: 401 },
      })
    }
  })
}

export default fp(merchantAuthPlugin, { name: 'merchant-auth' })

declare module 'fastify' {
  interface FastifyInstance {
    authenticateMerchant: (request: any, reply: any) => Promise<void>
  }
}
