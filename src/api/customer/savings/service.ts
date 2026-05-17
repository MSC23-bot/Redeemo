import { PrismaClient } from '../../../../generated/prisma/client'

/** Returns a UTC Date at the first millisecond of the given calendar month offset from now. */
function monthWindow(now: Date, monthOffset: number): { label: string; start: Date; end: Date } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1))
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const end   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return { label, start, end }
}

export async function getSavingsSummary(prisma: PrismaClient, userId: string) {
  const now = new Date()
  const thisMonth = monthWindow(now, 0)

  // ── All-time aggregate ────────────────────────────────────────────────────
  const allTime = await prisma.voucherRedemption.aggregate({
    where: { userId },
    _sum: { estimatedSaving: true },
  })
  const lifetimeSaving = Number(allTime._sum.estimatedSaving ?? 0)

  // ── This month aggregate ──────────────────────────────────────────────────
  const thisMonthAgg = await prisma.voucherRedemption.aggregate({
    where: { userId, redeemedAt: { gte: thisMonth.start, lt: thisMonth.end } },
    _sum: { estimatedSaving: true },
    _count: { id: true },
  })
  const thisMonthSaving = Number(thisMonthAgg._sum.estimatedSaving ?? 0)
  const thisMonthRedemptionCount = thisMonthAgg._count.id

  // ── Monthly breakdown — last 12 calendar months, zero-filled ─────────────
  // months[0] = current month, months[11] = 11 months ago (descending)
  const windows = Array.from({ length: 12 }, (_, i) => monthWindow(now, -i))

  const monthlyAggs = await Promise.all(
    windows.map(w =>
      prisma.voucherRedemption.aggregate({
        where: { userId, redeemedAt: { gte: w.start, lt: w.end } },
        _sum: { estimatedSaving: true },
        _count: { id: true },
      }),
    ),
  )

  const monthlyBreakdown = windows.map((w, i) => ({
    month:  w.label,
    saving: Number(monthlyAggs[i]._sum.estimatedSaving ?? 0),
    count:  monthlyAggs[i]._count.id,
  }))

  // ── By branch — this month ────────────────────────────────────────────────
  // §Savings Rebaseline (Revision 2, 2026-05-17): aggregation switched from
  // merchant-level to branch-level per the branch-as-PRIMARY-unit locked
  // product rule (memory `project_branch_first_class_platform_rules.md`,
  // 2026-05-03). Per-entry shape: branchId / branchName / merchantId /
  // merchantName / merchantLogoUrl / saving / count.  Merchant context
  // (name + logo) is preserved so the customer-app TopBranches row can
  // render "Brightlingsea (Covelum)" without an extra fetch.
  const thisMonthRows = await prisma.voucherRedemption.findMany({
    where: { userId, redeemedAt: { gte: thisMonth.start, lt: thisMonth.end } },
    select: {
      estimatedSaving: true,
      branch:  { select: { id: true, name: true } },
      voucher: {
        select: {
          merchant: { select: { id: true, businessName: true, logoUrl: true } },
        },
      },
    },
  })

  const byBranchMap: Record<string, {
    branchId: string; branchName: string;
    merchantId: string; merchantName: string; merchantLogoUrl: string | null;
    saving: number; count: number
  }> = {}
  for (const r of thisMonthRows) {
    const b = r.branch
    const m = r.voucher.merchant
    if (!byBranchMap[b.id]) {
      byBranchMap[b.id] = {
        branchId:        b.id,
        branchName:      b.name,
        merchantId:      m.id,
        merchantName:    m.businessName,
        merchantLogoUrl: m.logoUrl,
        saving:          0,
        count:           0,
      }
    }
    byBranchMap[b.id].saving += Number(r.estimatedSaving ?? 0)
    byBranchMap[b.id].count  += 1
  }
  const byBranch = Object.values(byBranchMap).sort((a, b) => b.saving - a.saving)

  // ── By category — this month ──────────────────────────────────────────────
  const thisMonthCatRows = await prisma.voucherRedemption.findMany({
    where: { userId, redeemedAt: { gte: thisMonth.start, lt: thisMonth.end } },
    select: {
      estimatedSaving: true,
      voucher: {
        select: {
          merchant: {
            select: { primaryCategory: { select: { id: true, name: true } } },
          },
        },
      },
    },
  })

  const byCategoryMap: Record<string, { categoryId: string; name: string; saving: number }> = {}
  for (const r of thisMonthCatRows) {
    const cat = r.voucher.merchant.primaryCategory
    if (!cat) continue
    if (!byCategoryMap[cat.id]) {
      byCategoryMap[cat.id] = { categoryId: cat.id, name: cat.name, saving: 0 }
    }
    byCategoryMap[cat.id].saving += Number(r.estimatedSaving ?? 0)
  }
  const byCategory = Object.values(byCategoryMap).sort((a, b) => b.saving - a.saving)

  return {
    lifetimeSaving,
    thisMonthSaving,
    thisMonthRedemptionCount,
    monthlyBreakdown,
    byBranch,
    byCategory,
  }
}

export async function getSavingsRedemptions(
  prisma: PrismaClient,
  userId: string,
  params: { limit: number; offset: number },
) {
  const { limit, offset } = params

  const [rows, total] = await Promise.all([
    prisma.voucherRedemption.findMany({
      where: { userId },
      orderBy: { redeemedAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        redeemedAt: true,
        estimatedSaving: true,
        isValidated: true,
        validatedAt: true,
        voucher: {
          select: {
            id: true,
            title: true,
            voucherType: true,
            merchant: { select: { id: true, businessName: true, logoUrl: true } },
          },
        },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.voucherRedemption.count({ where: { userId } }),
  ])

  const redemptions = rows.map(r => ({
    id:              r.id,
    redeemedAt:      r.redeemedAt,
    estimatedSaving: Number(r.estimatedSaving ?? 0),
    isValidated:     r.isValidated,
    validatedAt:     r.validatedAt,
    merchant: {
      id:           r.voucher.merchant.id,
      businessName: r.voucher.merchant.businessName,
      logoUrl:      r.voucher.merchant.logoUrl,
    },
    voucher: {
      id:          r.voucher.id,
      title:       r.voucher.title,
      voucherType: r.voucher.voucherType,
    },
    branch: { id: r.branch.id, name: r.branch.name },
  }))

  return { redemptions, total }
}

export async function getMonthlyDetail(
  prisma: PrismaClient,
  userId: string,
  month: string,
) {
  // month is "YYYY-MM" — already validated by the route
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const mon = parseInt(monthStr, 10)
  const start = new Date(Date.UTC(year, mon - 1, 1))
  const end = new Date(Date.UTC(year, mon, 1))

  // Aggregate total + count
  const agg = await prisma.voucherRedemption.aggregate({
    where: { userId, redeemedAt: { gte: start, lt: end } },
    _sum: { estimatedSaving: true },
    _count: { id: true },
  })

  const totalSaving = Number(agg._sum.estimatedSaving ?? 0)
  const redemptionCount = agg._count.id

  // By branch — Revision 2 (2026-05-17): see getSavingsSummary above
  // for the architectural rationale.  Same per-entry shape.
  const rows = await prisma.voucherRedemption.findMany({
    where: { userId, redeemedAt: { gte: start, lt: end } },
    select: {
      estimatedSaving: true,
      branch:  { select: { id: true, name: true } },
      voucher: {
        select: {
          merchant: { select: { id: true, businessName: true, logoUrl: true } },
        },
      },
    },
  })

  const byBranchMap: Record<string, {
    branchId: string; branchName: string;
    merchantId: string; merchantName: string; merchantLogoUrl: string | null;
    saving: number; count: number
  }> = {}
  for (const r of rows) {
    const b = r.branch
    const m = r.voucher.merchant
    if (!byBranchMap[b.id]) {
      byBranchMap[b.id] = {
        branchId:        b.id,
        branchName:      b.name,
        merchantId:      m.id,
        merchantName:    m.businessName,
        merchantLogoUrl: m.logoUrl,
        saving:          0,
        count:           0,
      }
    }
    byBranchMap[b.id].saving += Number(r.estimatedSaving ?? 0)
    byBranchMap[b.id].count  += 1
  }
  const byBranch = Object.values(byBranchMap).sort((a, b) => b.saving - a.saving)

  // By category
  const catRows = await prisma.voucherRedemption.findMany({
    where: { userId, redeemedAt: { gte: start, lt: end } },
    select: {
      estimatedSaving: true,
      voucher: {
        select: {
          merchant: {
            select: { primaryCategory: { select: { id: true, name: true } } },
          },
        },
      },
    },
  })

  const byCategoryMap: Record<string, { categoryId: string; name: string; saving: number }> = {}
  for (const r of catRows) {
    const cat = r.voucher.merchant.primaryCategory
    if (!cat) continue
    if (!byCategoryMap[cat.id]) {
      byCategoryMap[cat.id] = { categoryId: cat.id, name: cat.name, saving: 0 }
    }
    byCategoryMap[cat.id].saving += Number(r.estimatedSaving ?? 0)
  }
  const byCategory = Object.values(byCategoryMap).sort((a, b) => b.saving - a.saving)

  return { totalSaving, redemptionCount, byBranch, byCategory }
}
