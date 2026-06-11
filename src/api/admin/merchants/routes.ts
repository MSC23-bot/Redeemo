import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema } from '../../shared/schemas'
import { requireAdminCapability } from '../capability'
import { createMerchantDraft, suspendMerchant, reactivateMerchant } from './service'

export async function adminMerchantRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/merchants'

  // Create a merchant draft on the owner's behalf (M2, D-3). authenticateAdmin
  // is applied by the admin-management plugin scope; this route additionally
  // requires the `merchant:create-draft` capability.
  app.post(prefix, { preHandler: [requireAdminCapability('merchant:create-draft')] }, async (req: any, reply) => {
    const body = z
      .object({
        businessName: z.string().min(1),
        tradingName: z.string().optional(),
        ownerEmail: emailSchema,
        ownerFirstName: z.string().min(1),
        ownerLastName: z.string().min(1),
        jobTitle: z.string().optional(),
      })
      .parse(req.body)

    const result = await createMerchantDraft(app.prisma, req.user.sub, body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(result)
  })

  const idParam = (req: any) => z.object({ id: z.string().min(1) }).parse(req.params).id
  const auditCtx = (req: any) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' })

  // M6a — admin suspend (safe takedown). Cap `merchant:suspend`.
  app.post(`${prefix}/:id/suspend`, { preHandler: [requireAdminCapability('merchant:suspend')] }, async (req: any) => {
    const { reason } = z.object({ reason: z.string().min(1).max(2000) }).parse(req.body)
    return suspendMerchant(app.prisma, app.redis, req.user.sub, idParam(req), reason, auditCtx(req))
  })

  // M6a — admin reactivate (reverse of suspend). Same capability.
  app.post(`${prefix}/:id/reactivate`, { preHandler: [requireAdminCapability('merchant:suspend')] }, async (req: any) => {
    return reactivateMerchant(app.prisma, req.user.sub, idParam(req), auditCtx(req))
  })
}
