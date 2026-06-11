import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema } from '../../shared/schemas'
import { requireAdminCapability } from '../capability'
import { createMerchantDraft } from './service'

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
}
