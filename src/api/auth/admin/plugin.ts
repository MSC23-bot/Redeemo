import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { requireSecret } from '../../shared/env'

async function adminAuthPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: requireSecret('JWT_SECRET_ADMIN'),
    namespace: 'admin',
    jwtVerify: 'adminVerify',
    jwtSign: 'adminSign',
  })

  app.decorate('authenticateAdmin', async function (request: any, reply: any) {
    try {
      await request.adminVerify()
    } catch {
      return reply.status(401).send({
        error: { code: 'REFRESH_TOKEN_INVALID', message: 'Unauthorized.', statusCode: 401 },
      })
    }
  })
}

export default fp(adminAuthPlugin, { name: 'admin-auth' })

declare module 'fastify' {
  interface FastifyInstance {
    authenticateAdmin: (request: any, reply: any) => Promise<void>
  }
}
