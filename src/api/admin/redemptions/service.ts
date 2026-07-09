import { PrismaClient, Prisma } from '../../../../generated/prisma/client'
import { ADMIN_ROW_SELECT, toAdminRedemptionRow, normalizeRedemptionCode } from './format'
import { buildRedemptionOrderBy } from '../../merchant/redemptions/service'

// D67: read-only admin visibility of voucher redemptions
// (docs/superpowers/plans/2026-07-09-d67-admin-redemption-visibility.md).

export interface AdminRedemptionFilters {
  merchantId?: string
  branchId?: string
  status?: 'awaiting' | 'validated'
  from?: Date
  to?: Date
  voucherType?: string
  code?: string
  // Ordering: identical semantics to the merchant surface (recency / saving).
  sort?: 'recent' | 'saving'
  // D67-c: default TRUE (include test rows); the INVERSE of the merchant
  // surface, which hardcodes isTestData:false. This ops view exists to verify
  // redemptions during the staging-acceptance walk, where the redemptions being
  // verified ARE test rows; hiding them by default would defeat the feature.
  // The analytics-cleanliness rule (always exclude isTestData; backend-api.md)
  // is untouched: this view feeds no analytics. `includeTest: false` opts OUT.
  includeTest?: boolean
}

// D67-b: cross-merchant list; deliberately NO tenancy scope (that IS the
// point of admin visibility, unlike src/api/merchant/redemptions/service.ts's
// `buildRedemptionWhere`, which pins every query to `branch: { merchantId }`).
// `merchantId` / `branchId` here are optional NARROWING filters, not a security
// boundary; the boundary is the route's `requireAdminCapability('redemption:read')`.
export function buildAdminRedemptionWhere(f: AdminRedemptionFilters): Prisma.VoucherRedemptionWhereInput {
  const where: Prisma.VoucherRedemptionWhereInput = {}

  if (f.merchantId) where.branch = { merchantId: f.merchantId }
  if (f.branchId) where.branchId = f.branchId
  if (f.status === 'awaiting') where.isValidated = false
  if (f.status === 'validated') where.isValidated = true
  if (f.from || f.to) where.redeemedAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) }
  if (f.voucherType) where.voucher = { is: { type: f.voucherType as any } }
  // Same OR-shape as the merchant surface: the code search matches the
  // normalized redemption-code prefix OR the voucher title (case-insensitive).
  if (f.code) {
    where.OR = [
      { redemptionCode: { startsWith: normalizeRedemptionCode(f.code) } },
      { voucher: { is: { title: { contains: f.code, mode: 'insensitive' } } } },
    ]
  }
  // D67-c: includeTest defaults true; only exclude test rows when the caller
  // explicitly opts out (includeTest === false).
  if (f.includeTest === false) where.isTestData = false

  return where
}

// D67: identical ordering semantics to the merchant surface (recency /
// saving, with the `id` tie-breaker for a deterministic total order across
// offset pages); re-used rather than duplicated. See
// src/api/merchant/redemptions/service.ts for the full ordering rationale.
export const buildAdminRedemptionOrderBy = buildRedemptionOrderBy

export async function listAdminRedemptions(
  prisma: PrismaClient,
  filters: AdminRedemptionFilters,
  { limit, offset }: { limit: number; offset: number },
) {
  const where = buildAdminRedemptionWhere(filters)
  const [total, rows] = await Promise.all([
    prisma.voucherRedemption.count({ where }),
    prisma.voucherRedemption.findMany({
      where,
      orderBy: buildAdminRedemptionOrderBy(filters.sort),
      take: limit,
      skip: offset,
      select: ADMIN_ROW_SELECT,
    }),
  ])
  return { items: rows.map(toAdminRedemptionRow), total, limit, offset }
}
