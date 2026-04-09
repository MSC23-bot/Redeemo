import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'

async function branchAuthPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET_BRANCH ?? 'dev-branch-secret',
    namespace: 'branch',
    jwtVerify: 'branchVerify',
    jwtSign: 'branchSign',
  })

  app.decorate('authenticateBranch', async function (request: any, reply: any) {
    try {
      await request.branchVerify()
    } catch {
      return reply.status(401).send({
        error: { code: 'REFRESH_TOKEN_INVALID', message: 'Unauthorized.', statusCode: 401 },
      })
    }
  })
}

export default fp(branchAuthPlugin, { name: 'branch-auth' })

declare module 'fastify' {
  interface FastifyInstance {
    authenticateBranch: (request: any, reply: any) => Promise<void>
  }
}
