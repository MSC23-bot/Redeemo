import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { requireSecret } from '../../shared/env'
import { RedisKey } from '../../shared/redis-keys'

async function merchantAuthPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: requireSecret('JWT_SECRET_MERCHANT'),
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

    // Session-revocation awareness. A merchant access token stays valid for its
    // 15-minute TTL, but admin suspension / logout / password-reset revoke the
    // session's refresh token immediately (session.ts revokeAllSessionsForEntity).
    // Reject a token whose session has been revoked so the revocation takes effect
    // now, not at token expiry. Mirrors the customer flow's per-request session
    // check (customer/plugin.ts). A token with no sessionId claim is malformed /
    // legacy and ages out at the TTL — treated as REFRESH_TOKEN_INVALID.
    const claims = request.user as { sub?: string; sessionId?: string }
    if (!claims?.sub || !claims?.sessionId) {
      return reply.status(401).send({
        error: { code: 'REFRESH_TOKEN_INVALID', message: 'Unauthorized.', statusCode: 401 },
      })
    }
    const sessionLive = await app.redis.exists(RedisKey.refreshToken('merchant', claims.sub, claims.sessionId))
    if (!sessionLive) {
      return reply.status(401).send({
        error: { code: 'SESSION_REVOKED', message: 'Your session has ended. Please log in again.', statusCode: 401 },
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
