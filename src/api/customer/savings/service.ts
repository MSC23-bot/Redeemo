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

  // ── By merchant — this month ──────────────────────────────────────────────
  const thisMonthRows = await prisma.voucherRedemption.findMany({
    where: { userId, redeemedAt: { gte: thisMonth.start, lt: thisMonth.end } },
    select: {
      estimatedSaving: true,
      voucher: {
        select: {
          merchant: { select: { id: true, businessName: true, logoUrl: true } },
        },
      },
    },
  })

  const byMerchantMap: Record<string, {
    merchantId: string; businessName: string; logoUrl: string | null; saving: number; count: number
  }> = {}
  for (const r of thisMonthRows) {
    const m = r.voucher.merchant
    if (!byMerchantMap[m.id]) {
      byMerchantMap[m.id] = { merchantId: m.id, businessName: m.businessName, logoUrl: m.logoUrl, saving: 0, count: 0 }
    }
    byMerchantMap[m.id].saving += Number(r.estimatedSaving ?? 0)
    byMerchantMap[m.id].count  += 1
  }
  const byMerchant = Object.values(byMerchantMap).sort((a, b) => b.saving - a.saving)

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
    byMerchant,
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
