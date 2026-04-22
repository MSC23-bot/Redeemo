import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { createMerchantRequest } from './service'

const createSchema = z.object({
  businessName: z.string().trim().min(1).max(100),
  location:     z.string().trim().min(1).max(100),
  note:         z.string().trim().max(500).optional(),
})

export async function merchantRequestRoutes(app: FastifyInstance) {
  const base = '/api/v1/customer/merchant-requests'

  app.post(base, async (req: FastifyRequest, reply) => {
    const data = createSchema.parse(req.body)
    const request = await createMerchantRequest(app.prisma, req.user.sub, data)
    return reply.status(201).send({ success: true, id: request.id })
  })
}
