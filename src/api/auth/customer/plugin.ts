import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { getActiveMobileSessionId } from '../../shared/session'

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

    // One-mobile-device-per-account enforcement. After Device B signs in,
    // Device A's row in the active-mobile-session Redis key is replaced.
    // Without this check Device A's still-valid access token would
    // continue working until the 15-minute JWT expiry. With this check
    // Device A is rejected immediately on its next API call with the
    // distinct `SESSION_REPLACED` code, which the customer app maps to
    // specific copy. Locked 2026-05-08, deferred-followups §AC6 / §AD3.
    //
    // Skipped when the JWT lacks a `deviceType` claim — those are
    // legacy tokens minted before 2026-05-08 and naturally age out at
    // the 15-minute access-token TTL. Skipped for non-mobile sessions
    // (web): only ios/android writes to `activeMobileSession`, so the
    // check would falsely reject web sessions when a mobile login
    // exists for the same user.
    const claims = request.user as { sub?: string; deviceType?: string; sessionId?: string }
    if (claims?.deviceType === 'ios' || claims?.deviceType === 'android') {
      if (!claims.sub || !claims.sessionId) {
        return reply.status(401).send({
          error: { code: 'REFRESH_TOKEN_INVALID', message: 'Unauthorized.', statusCode: 401 },
        })
      }
      const activeSessionId = await getActiveMobileSessionId((app as any).redis, 'customer', claims.sub)
      if (activeSessionId && activeSessionId !== claims.sessionId) {
        return reply.status(401).send({
          error: {
            code:       'SESSION_REPLACED',
            message:    'Your account was signed in on another device, so this session has ended.',
            statusCode: 401,
          },
        })
      }
    }
  })
}

export default fp(customerAuthPlugin, { name: 'customer-auth' })

declare module 'fastify' {
  interface FastifyInstance {
    authenticateCustomer: (request: any, reply: any) => Promise<void>
  }
}
