import { PrismaClient, Prisma } from '../../../../generated/prisma/client'
import { ROW_SELECT, ROW_SELECT_WITH_MERCHANT, toMerchantRedemptionRow, normalizeRedemptionCode } from './format'
import { AppError } from '../../shared/errors'

export interface RedemptionFilters {
  branchId?: string
  status?: 'awaiting' | 'validated'
  from?: Date
  to?: Date
  voucherType?: string
  code?: string
}

// The IDOR boundary: `branch: { merchantId }` scopes every query to the
// session merchant; a client-supplied branchId is ANDed with it, so a
// cross-tenant branchId resolves to an empty result rather than leaking
// another merchant's data. isTestData=true rows (seed/QA noise) are excluded
// by default, matching how Popular/Trending exclude them.
export function buildRedemptionWhere(merchantId: string, f: RedemptionFilters): Prisma.VoucherRedemptionWhereInput {
  const where: Prisma.VoucherRedemptionWhereInput = { branch: { merchantId }, isTestData: false }
  if (f.branchId) where.branchId = f.branchId
  if (f.status === 'awaiting') where.isValidated = false
  if (f.status === 'validated') where.isValidated = true
  if (f.from || f.to) where.redeemedAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) }
  if (f.voucherType) where.voucher = { is: { type: f.voucherType as any } }
  if (f.code) where.redemptionCode = { startsWith: normalizeRedemptionCode(f.code) }
  return where
}

export async function listMerchantRedemptions(
  prisma: PrismaClient, merchantId: string, f: RedemptionFilters & { limit: number; offset: number }
) {
  const where = buildRedemptionWhere(merchantId, f)
  const [total, rows] = await Promise.all([
    prisma.voucherRedemption.count({ where }),
    prisma.voucherRedemption.findMany({ where, orderBy: { redeemedAt: 'desc' }, take: f.limit, skip: f.offset, select: ROW_SELECT }),
  ])
  return { items: rows.map(toMerchantRedemptionRow), total, limit: f.limit, offset: f.offset }
}

// B2: read-only lookup-by-code preview. Normalises the code, finds the
// redemption, and scopes to the session merchant: a cross-tenant code is
// masked as REDEMPTION_NOT_FOUND so existence is never leaked. Never writes.
export async function lookupMerchantRedemptionByCode(prisma: PrismaClient, merchantId: string, rawCode: string) {
  const code = normalizeRedemptionCode(rawCode)
  const r = await prisma.voucherRedemption.findUnique({ where: { redemptionCode: code }, select: ROW_SELECT_WITH_MERCHANT })
  if (!r || (r as any).voucher.merchantId !== merchantId) throw new AppError('REDEMPTION_NOT_FOUND')
  // toMerchantRedemptionRow maps voucher to {id,title,type} only, so merchantId never leaks out.
  return toMerchantRedemptionRow(r)
}

// B4: CSV export. Same where/filters as B1 but no pagination: a documented hard
// cap (no silent truncation). The +1 fetch detects truncation.
const EXPORT_CAP = 50000

export async function getMerchantRedemptionsForExport(prisma: PrismaClient, merchantId: string, f: RedemptionFilters) {
  const where = buildRedemptionWhere(merchantId, f)
  const rows = await prisma.voucherRedemption.findMany({ where, orderBy: { redeemedAt: 'desc' }, take: EXPORT_CAP + 1, select: ROW_SELECT })
  const truncated = rows.length > EXPORT_CAP
  return { rows: rows.slice(0, EXPORT_CAP).map(toMerchantRedemptionRow), truncated }
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return '"' + s.replace(/"/g, '""') + '"'
}

export function redemptionsToCsv(rows: ReturnType<typeof toMerchantRedemptionRow>[], truncated: boolean): string {
  const header = ['Redemption code', 'Voucher', 'Type', 'Branch', 'Customer', 'Redeemed at', 'Status', 'Validated at', 'Method', 'Saving (GBP)']
  const lines = [header.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push([
      r.redemptionCode, r.voucher.title, r.voucher.type, r.branch.name, r.customerName,
      r.redeemedAt, r.status, r.validatedAt ?? '', r.validationMethod ?? '', r.estimatedSaving.toFixed(2),
    ].map(csvCell).join(','))
  }
  if (truncated) lines.push(csvCell('Export truncated at ' + EXPORT_CAP + ' rows. Narrow the filters for a complete export.'))
  return lines.join('\r\n')
}
