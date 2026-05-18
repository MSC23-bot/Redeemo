import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSavingsSummary, getSavingsRedemptions, getMonthlyDetail } from './service'

// §BN Revision-3 (2026-05-18) — `month` is optional on /redemptions
// (scopes the result set + total to that calendar month when supplied)
// but required on /monthly-detail (aggregate-only endpoint with no
// all-time mode).  Both schemas share the same canonical YYYY-MM regex
// for consistent error messages.
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

const redemptionsQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  month:  z.string().regex(MONTH_REGEX, 'month must be YYYY-MM format').optional(),
})

const monthQuerySchema = z.object({
  month: z.string().regex(MONTH_REGEX, 'month must be YYYY-MM format'),
})

export async function savingsRoutes(app: FastifyInstance) {
  const base = '/api/v1/customer/savings'

  app.get(`${base}/summary`, async (req: FastifyRequest, reply) => {
    const result = await getSavingsSummary(app.prisma, req.user.sub)
    return reply.send(result)
  })

  app.get(`${base}/redemptions`, async (req: FastifyRequest, reply) => {
    const { limit, offset, month } = redemptionsQuerySchema.parse(req.query)
    const result = await getSavingsRedemptions(app.prisma, req.user.sub, { limit, offset, month })
    return reply.send(result)
  })

  app.get(`${base}/monthly-detail`, async (req: FastifyRequest, reply) => {
    const { month } = monthQuerySchema.parse(req.query)
    const result = await getMonthlyDetail(app.prisma, req.user.sub, month)
    return reply.send(result)
  })
}
