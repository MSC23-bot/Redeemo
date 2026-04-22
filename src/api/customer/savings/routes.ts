import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSavingsSummary, getSavingsRedemptions } from './service'

const redemptionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function savingsRoutes(app: FastifyInstance) {
  const base = '/api/v1/customer/savings'

  app.get(`${base}/summary`, async (req: FastifyRequest, reply) => {
    const result = await getSavingsSummary(app.prisma, req.user.sub)
    return reply.send(result)
  })

  app.get(`${base}/redemptions`, async (req: FastifyRequest, reply) => {
    const { limit, offset } = redemptionsQuerySchema.parse(req.query)
    const result = await getSavingsRedemptions(app.prisma, req.user.sub, { limit, offset })
    return reply.send(result)
  })
}
