import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { getMerchantAccount, updateMerchantAccount, listMerchantSessions } from './service'

// My Account (Stage 1 backend prerequisites, no schema): three read/update
// routes over the caller's OWN MerchantAdmin + UserSession rows. Registered
// inside merchantManagementPlugin (src/api/merchant/plugin.ts), which already
// applies `app.authenticateMerchant` as a SCOPED preHandler over every module
// registered there (profileRoutes, merchantNotificationRoutes, etc.) — this
// mirrors that convention rather than duplicating an inline
// `preHandler: [app.authenticateMerchant]` array per route, which is the
// pattern used by src/api/auth/merchant/routes.ts (a module that is mostly
// UNauthenticated by default and opts individual routes IN). Net effect is
// identical: every route below 401s with no bearer token.
export async function merchantAccountRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/account'

  app.get(prefix, async (req: FastifyRequest, reply) => {
    const account = await getMerchantAccount(app.prisma, req.user.sub)
    return reply.send(account)
  })

  app.patch(prefix, async (req: FastifyRequest, reply) => {
    // `.strict()` rejects any key outside the 3-field allow-list (e.g. email,
    // role, passwordHash) with a 400 VALIDATION_ERROR at the wire boundary —
    // the service additionally allow-lists the same 3 fields on write
    // (defence in depth, not reliance on this schema alone).
    const body = z.object({
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      jobTitle: z.string().trim().max(150).nullable().optional(),
    }).strict().parse(req.body)

    const account = await updateMerchantAccount(app.prisma, req.user.sub, body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(account)
  })

  app.get(`${prefix}/sessions`, async (req: FastifyRequest, reply) => {
    const sessions = await listMerchantSessions(app.prisma, req.user.sub, req.user.sessionId)
    return reply.send({ sessions })
  })
}
