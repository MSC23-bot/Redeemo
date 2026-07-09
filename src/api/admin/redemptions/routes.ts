import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdminCapability } from '../capability'
import { listAdminRedemptions } from './service'

// D67: read-only admin visibility of voucher redemptions
// (docs/superpowers/plans/2026-07-09-d67-admin-redemption-visibility.md).
// `authenticateAdmin` is applied by the admin-management plugin scope; this
// route additionally gates on `redemption:read`. Cross-merchant, LIST-ONLY:
// no CSV export, no detail route (D67-b); the row carries what acceptance needs.
const filterSchema = z.object({
  merchantId: z.string().optional(),
  branchId: z.string().optional(),
  status: z.enum(['awaiting', 'validated']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  voucherType: z.enum(['BOGO', 'SPEND_AND_SAVE', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'FREEBIE', 'PACKAGE_DEAL', 'TIME_LIMITED', 'REUSABLE']).optional(),
  // Capped: the term feeds an indexed code-prefix match AND an unindexed
  // voucher-title ILIKE, so an unbounded string is pointless cost (mirrors the
  // merchant surface's rationale).
  code: z.string().max(64).optional(),
  sort: z.enum(['recent', 'saving']).optional(),
  // NOT z.coerce.boolean(): query values arrive as strings and Boolean('false')
  // is true, so ?includeTest=false would wrongly coerce to true. Parse the
  // literal token instead. D67-c: default TRUE (include test rows) when the
  // param is absent; the inverse of the merchant surface's hardcoded exclusion.
  includeTest: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? true : v === 'true')),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function adminRedemptionRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/redemptions'

  app.get(prefix, { preHandler: [requireAdminCapability('redemption:read')] }, async (req: any, reply) => {
    const q = filterSchema.parse(req.query)
    const result = await listAdminRedemptions(
      app.prisma,
      {
        merchantId: q.merchantId,
        branchId: q.branchId,
        status: q.status,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
        voucherType: q.voucherType,
        code: q.code,
        sort: q.sort,
        includeTest: q.includeTest,
      },
      { limit: q.limit, offset: q.offset },
    )
    return reply.send(result)
  })
}
