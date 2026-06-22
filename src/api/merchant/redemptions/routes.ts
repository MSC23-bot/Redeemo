import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { resolveAdminMerchant } from '../shared'
import { listMerchantRedemptions, lookupMerchantRedemptionByCode, getMerchantRedemptionsForExport, redemptionsToCsv } from './service'

const filterSchema = z.object({
  branchId: z.string().optional(),
  status: z.enum(['awaiting', 'validated']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  voucherType: z.enum(['BOGO', 'SPEND_AND_SAVE', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'FREEBIE', 'PACKAGE_DEAL', 'TIME_LIMITED', 'REUSABLE']).optional(),
  // Day-2 Vouchers A1: per-voucher filter (the "View redemptions" deep-link from
  // the Vouchers detail page). ANDed with branch.merchantId so a cross-tenant
  // voucherId yields an empty result rather than leaking another merchant's data.
  voucherId: z.string().optional(),
  code: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function merchantRedemptionRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/redemptions'

  // resolveAdminMerchant both resolves merchantId from the session AND enforces
  // the live SEC-M2 suspended-merchant block; never trust a client merchantId.
  app.get(prefix, async (req: FastifyRequest, reply) => {
    const { merchantId } = await resolveAdminMerchant(app.prisma, req.user.sub)
    const q = filterSchema.parse(req.query)
    const result = await listMerchantRedemptions(app.prisma, merchantId, {
      ...q, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined,
    })
    return reply.send(result)
  })

  app.get(`${prefix}/lookup`, async (req: FastifyRequest, reply) => {
    const { merchantId } = await resolveAdminMerchant(app.prisma, req.user.sub)
    const { code } = z.object({ code: z.string().min(1) }).parse(req.query)
    const result = await lookupMerchantRedemptionByCode(app.prisma, merchantId, code)
    return reply.send(result)
  })

  app.get(`${prefix}/export.csv`, async (req: FastifyRequest, reply) => {
    const { merchantId } = await resolveAdminMerchant(app.prisma, req.user.sub)
    const q = filterSchema.omit({ limit: true, offset: true }).parse(req.query)
    const { rows, truncated } = await getMerchantRedemptionsForExport(app.prisma, merchantId, {
      ...q, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined,
    })
    const csv = redemptionsToCsv(rows, truncated)
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="redemptions.csv"')
    return reply.send(csv)
  })
}
