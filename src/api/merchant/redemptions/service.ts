import { PrismaClient, Prisma } from '../../../../generated/prisma/client'
import { ROW_SELECT, ROW_SELECT_WITH_MERCHANT, toMerchantRedemptionRow, normalizeRedemptionCode } from './format'
import { AppError } from '../../shared/errors'

export interface RedemptionFilters {
  branchId?: string
  status?: 'awaiting' | 'validated'
  from?: Date
  to?: Date
  voucherType?: string
  // Day-2 Vouchers A1: per-voucher filter (additive). ANDed with branch.merchantId.
  voucherId?: string
  code?: string
  // Redemptions fidelity: result ordering. 'recent' (default) = redeemedAt desc;
  // 'saving' = estimatedSaving desc. Applied identically to list AND CSV export.
  sort?: 'recent' | 'saving'
  // Staff & Access B5 (§4.3 SCOPED-READ): the caller's allowed-branch set. Owner /
  // allBranches members pass `null`/`undefined` (no restriction = all branches).
  // A scoped member passes their `allowedBranchIds`; the where-builder then
  // intersects: a requested `branchId` outside the set, or an empty set, yields an
  // empty result (`branchId IN []`), never a leak. Never trusts the client branchId
  // on its own.
  allowedBranchIds?: string[] | null
}

// The IDOR boundary: `branch: { merchantId }` scopes every query to the
// session merchant; a client-supplied branchId is ANDed with it, so a
// cross-tenant branchId resolves to an empty result rather than leaking
// another merchant's data. isTestData=true rows (seed/QA noise) are excluded
// by default, matching how Popular/Trending exclude them.
//
// Staff & Access B5 (§4.3 SCOPED-READ): when `f.allowedBranchIds` is provided (a
// scoped non-owner member), the requested `branchId` is INTERSECTED with that set:
//   - owner / allBranches member  -> allowedBranchIds null/undefined -> no extra clause (all branches).
//   - scoped member, no branchId  -> restrict to `branchId IN allowedBranchIds`.
//   - scoped member, branchId in set    -> filter to that single branch.
//   - scoped member, branchId NOT in set -> `branchId IN []` -> empty result (denied, not leaked).
export function buildRedemptionWhere(merchantId: string, f: RedemptionFilters): Prisma.VoucherRedemptionWhereInput {
  const where: Prisma.VoucherRedemptionWhereInput = { branch: { merchantId }, isTestData: false }

  if (f.allowedBranchIds == null) {
    // Owner / allBranches: no branch-scope restriction; honour an optional client branchId.
    if (f.branchId) where.branchId = f.branchId
  } else {
    // Scoped member: intersect the (optional) requested branchId with the allowed set.
    const allowed = f.allowedBranchIds
    if (f.branchId) {
      where.branchId = allowed.includes(f.branchId) ? f.branchId : { in: [] }
    } else {
      where.branchId = { in: allowed }
    }
  }

  // Day-2 Vouchers A1: scope to a single voucher. The branch.merchantId clause
  // already present keeps the IDOR boundary, so a cross-tenant voucherId yields empty.
  if (f.voucherId) where.voucherId = f.voucherId
  if (f.status === 'awaiting') where.isValidated = false
  if (f.status === 'validated') where.isValidated = true
  if (f.from || f.to) where.redeemedAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) }
  if (f.voucherType) where.voucher = { is: { type: f.voucherType as any } }
  // Redemptions fidelity: the search box matches the redemption CODE (normalized
  // prefix, as before) OR the voucher TITLE (case-insensitive substring). The OR
  // sits INSIDE the tenant/branch-scoped where (top-level keys AND together), so
  // the IDOR/scope boundary is untouched. Customer-name search is deliberately
  // NOT offered (names are privacy-formatted server-side at read time).
  if (f.code) {
    where.OR = [
      { redemptionCode: { startsWith: normalizeRedemptionCode(f.code) } },
      { voucher: { is: { title: { contains: f.code, mode: 'insensitive' } } } },
    ]
  }
  return where
}

// The single orderBy source for list + export (identical semantics, B4 parity).
// DETERMINISTIC (Codex round 2): equal values are common (same saving across a
// campaign, same-second redemptions), and a non-total order shuffles /
// duplicates / omits rows across offset pages. Every branch therefore ends in
// the unique primary key as a stable total-order tie-breaker; 'saving' also
// tie-breaks on recency first so equal savings read newest-first. The Prisma
// FindMany orderBy accepts VoucherRedemptionOrderByWithRelationInput[] (verified
// against the generated types).
// Honesty note (review F2): 'recent' rides the indexed redeemedAt column;
// 'saving' sorts the UNINDEXED estimatedSaving Decimal - acceptable because
// every query is tenant-bounded (branch.merchantId) and capped (limit<=100 /
// EXPORT_CAP), but do not widen without revisiting indexing.
export function buildRedemptionOrderBy(sort: RedemptionFilters['sort']): Prisma.VoucherRedemptionOrderByWithRelationInput[] {
  return sort === 'saving'
    ? [{ estimatedSaving: 'desc' }, { redeemedAt: 'desc' }, { id: 'desc' }]
    : [{ redeemedAt: 'desc' }, { id: 'desc' }]
}

export async function listMerchantRedemptions(
  prisma: PrismaClient, merchantId: string, f: RedemptionFilters & { limit: number; offset: number }
) {
  const where = buildRedemptionWhere(merchantId, f)
  const [total, rows] = await Promise.all([
    prisma.voucherRedemption.count({ where }),
    prisma.voucherRedemption.findMany({ where, orderBy: buildRedemptionOrderBy(f.sort), take: f.limit, skip: f.offset, select: ROW_SELECT }),
  ])
  return { items: rows.map(toMerchantRedemptionRow), total, limit: f.limit, offset: f.offset }
}

// B2: read-only lookup-by-code preview. Normalises the code, finds the
// redemption, and scopes to the session merchant: a cross-tenant code is
// masked as REDEMPTION_NOT_FOUND so existence is never leaked. Never writes.
//
// Staff & Access B5 (§4.3 SCOPED-READ): when `allowedBranchIds` is provided (a
// scoped non-owner member), a code whose branch is outside the allowed set is
// masked as REDEMPTION_NOT_FOUND too (existence never leaked). Owner / allBranches
// members pass `null`/`undefined` -> no branch restriction.
export async function lookupMerchantRedemptionByCode(
  prisma: PrismaClient,
  merchantId: string,
  rawCode: string,
  allowedBranchIds?: string[] | null,
) {
  const code = normalizeRedemptionCode(rawCode)
  const r = await prisma.voucherRedemption.findUnique({ where: { redemptionCode: code }, select: ROW_SELECT_WITH_MERCHANT })
  if (!r || (r as any).voucher.merchantId !== merchantId) throw new AppError('REDEMPTION_NOT_FOUND')
  // Branch-scope intersect: a scoped member can only preview codes from their own
  // branches; an out-of-scope branch is masked identically to a cross-tenant code.
  if (allowedBranchIds != null && !allowedBranchIds.includes((r as any).branch.id)) {
    throw new AppError('REDEMPTION_NOT_FOUND')
  }
  // toMerchantRedemptionRow maps voucher to {id,title,type} only, so merchantId never leaks out.
  return toMerchantRedemptionRow(r)
}

// B4: CSV export. Same where/filters as B1 but no pagination: a documented hard
// cap (no silent truncation). The +1 fetch detects truncation.
const EXPORT_CAP = 50000

export async function getMerchantRedemptionsForExport(prisma: PrismaClient, merchantId: string, f: RedemptionFilters) {
  const where = buildRedemptionWhere(merchantId, f)
  const rows = await prisma.voucherRedemption.findMany({ where, orderBy: buildRedemptionOrderBy(f.sort), take: EXPORT_CAP + 1, select: ROW_SELECT })
  const truncated = rows.length > EXPORT_CAP
  return { rows: rows.slice(0, EXPORT_CAP).map(toMerchantRedemptionRow), truncated }
}

// OWASP CSV-injection mitigation: a cell value that begins with = + - @ tab or
// CR can execute as a spreadsheet formula in Excel/Sheets. Prepend a single
// apostrophe to neutralise it BEFORE the quote-escaping so the value renders as
// literal text (e.g. `=SUM(A1:A2)` -> cell `"'=SUM(A1:A2)"`).
function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = "'" + s
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
