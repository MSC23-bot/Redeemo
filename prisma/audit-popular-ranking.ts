/**
 * Popular-ranking audit tool (reusable).
 *
 * Run: npx tsx prisma/audit-popular-ranking.ts
 *
 * Originally written for the §DG (Popular location-aware ranking) brainstorm
 * probe on 2026-05-23 — owner-approved as a permanent audit tool because the
 * same data shape supports future ranking work (§DF postcode fallback,
 * §DD category strategy refinements, ranking iterations).
 *
 * Produces 4 sections:
 *   1. Top-30 merchants by current-month redemption count (Popular's inclusion pool)
 *   2. London-area merchants (lat/lng bbox) + locationConfidence + month redemptions
 *      (parameterise the bbox at call-time if auditing a different market)
 *   3. Top-N users by current-month redemption count (QA account audit)
 *   4. Root-cause analysis — derived from the previous sections
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

function startOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
}

async function section1_top30Merchants() {
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('SECTION 1 — Top 30 merchants by current-month redemption count')
  console.log('   (the actual inclusion pool used by buildPopularRail/Trending)')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const monthStart = startOfMonthUTC(new Date())
  const recent = await prisma.voucherRedemption.findMany({
    where:  { redeemedAt: { gte: monthStart } },
    select: { branch: { select: { merchantId: true } } },
  })
  const counts = new Map<string, number>()
  for (const r of recent) {
    const id = (r as any).branch.merchantId as string
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const top30 = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)

  if (top30.length === 0) {
    console.log('  (no current-month redemptions found)')
    return { top30Ids: [] as string[], counts }
  }

  const merchantRows = await prisma.merchant.findMany({
    where:  { id: { in: top30.map(([id]) => id) } },
    select: {
      id: true,
      businessName: true,
      status: true,
      createdAt: true,
      branches: {
        where:  { isActive: true },
        select: {
          id:             true,
          name:           true,
          localityName:   true,
          city:           true,
          postTown:       true,
          latitude:       true,
          longitude:      true,
          locationConfidence: true,
        },
      },
    },
  })
  const byId = new Map(merchantRows.map((m) => [m.id, m]))

  console.log('rank | redemptions | merchant                          | branches (loc | confidence)')
  console.log('---- | ----------- | --------------------------------- | -----------------------------')
  let rank = 0
  for (const [mid, count] of top30) {
    rank++
    const m = byId.get(mid)
    if (!m) {
      console.log(`${String(rank).padStart(4)} | ${String(count).padStart(11)} | <MERCHANT NOT FOUND ${mid}>`)
      continue
    }
    const branchSummary = m.branches.slice(0, 3).map((b) =>
      `${b.name} (${b.localityName ?? b.city ?? b.postTown ?? '?'} | ${b.locationConfidence})`
    ).join(', ')
    const more = m.branches.length > 3 ? ` +${m.branches.length - 3} more` : ''
    console.log(`${String(rank).padStart(4)} | ${String(count).padStart(11)} | ${m.businessName.padEnd(33).slice(0, 33)} | ${branchSummary}${more}`)
  }
  return { top30Ids: top30.map(([id]) => id), counts }
}

async function section2_londonMerchants() {
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('SECTION 2 — London-area merchants (lat 51.4-51.6, lng -0.3-0.0)')
  console.log('   + locationConfidence distribution + current-month redemptions')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const monthStart = startOfMonthUTC(new Date())

  const londonBranches = await prisma.branch.findMany({
    where: {
      isActive: true,
      merchant: { status: 'ACTIVE' },
      latitude:  { gte: 51.4, lte: 51.6 },
      longitude: { gte: -0.3, lte: 0.0 },
    },
    select: {
      id:                 true,
      name:               true,
      localityName:       true,
      city:               true,
      postTown:           true,
      latitude:           true,
      longitude:          true,
      locationConfidence: true,
      merchantId:         true,
      merchant: { select: { id: true, businessName: true } },
    },
    take: 200,
  })

  if (londonBranches.length === 0) {
    console.log('  (no London-area branches found — likely the root cause)')
    return { londonMerchantIds: new Set<string>() }
  }

  const merchantIds = new Set(londonBranches.map((b) => b.merchantId))

  // Per-merchant current-month redemption count.
  const merchantRedemptionCounts = new Map<string, number>()
  for (const mid of merchantIds) {
    const c = await prisma.voucherRedemption.count({
      where: {
        redeemedAt: { gte: monthStart },
        branch: { merchantId: mid },
      },
    })
    merchantRedemptionCounts.set(mid, c)
  }

  // Confidence bucket counts.
  const confidenceCounts: Record<string, number> = {}
  for (const b of londonBranches) {
    const k = b.locationConfidence ?? 'NULL'
    confidenceCounts[k] = (confidenceCounts[k] ?? 0) + 1
  }

  console.log('locationConfidence distribution across London branches:')
  for (const [k, v] of Object.entries(confidenceCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} : ${v}`)
  }
  console.log('')

  console.log('Per-merchant detail (cap 30):')
  console.log('merchant                            | locality              | confidence            | month_redemptions | rankable_by_v3')
  console.log('----------------------------------- | --------------------- | --------------------- | ----------------- | ---------------')
  const byMerchant = new Map<string, typeof londonBranches[number][]>()
  for (const b of londonBranches) {
    const arr = byMerchant.get(b.merchantId) ?? []
    arr.push(b)
    byMerchant.set(b.merchantId, arr)
  }
  let shown = 0
  for (const [mid, branches] of byMerchant) {
    if (shown++ >= 30) break
    const first = branches[0]
    const rankable = first.locationConfidence === 'MANUALLY_CONFIRMED'
      || first.locationConfidence === 'ADDRESS_GEOCODED'
    const count = merchantRedemptionCounts.get(mid) ?? 0
    console.log(
      `${first.merchant.businessName.padEnd(35).slice(0, 35)} | ` +
      `${(first.localityName ?? first.city ?? first.postTown ?? '?').padEnd(21).slice(0, 21)} | ` +
      `${first.locationConfidence.padEnd(21)} | ` +
      `${String(count).padStart(17)} | ` +
      `${rankable ? 'YES' : 'NO'}`
    )
  }

  return { londonMerchantIds: merchantIds }
}

async function section3_topUsers() {
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('SECTION 3 — Top 20 users by current-month redemption count')
  console.log('   (QA account audit — who is generating the noise?)')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const monthStart = startOfMonthUTC(new Date())
  const recent = await prisma.voucherRedemption.findMany({
    where:  { redeemedAt: { gte: monthStart } },
    select: { userId: true },
  })

  const counts = new Map<string, number>()
  for (const r of recent) {
    counts.set(r.userId, (counts.get(r.userId) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)

  if (top.length === 0) {
    console.log('  (no redemptions found)')
    return
  }

  const userRows = await prisma.user.findMany({
    where:  { id: { in: top.map(([id]) => id) } },
    select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
  })
  const byId = new Map(userRows.map((u) => [u.id, u]))

  console.log('rank | redemptions | email                              | name')
  console.log('---- | ----------- | ---------------------------------- | -------------------')
  let rank = 0
  for (const [uid, count] of top) {
    rank++
    const u = byId.get(uid)
    const email = u?.email ?? '<USER NOT FOUND>'
    const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : ''
    console.log(`${String(rank).padStart(4)} | ${String(count).padStart(11)} | ${email.padEnd(34).slice(0, 34)} | ${name}`)
  }

  // Total redemption count for context.
  console.log(`\nTotal current-month redemptions across all users: ${recent.length}`)
  const topPct = top.length > 0 ? ((top[0][1] / recent.length) * 100).toFixed(1) : '0'
  console.log(`Top user accounts for ${topPct}% of all current-month redemptions.`)
}

async function section4_rootCauseAnalysis(
  top30Counts: Map<string, number>,
  londonMerchantIds: Set<string>,
) {
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('SECTION 4 — Root cause analysis')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const top30IdSet = new Set([...top30Counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([id]) => id))

  const londonInTop30 = [...londonMerchantIds].filter((id) => top30IdSet.has(id))
  const nonLondonInTop30 = [...top30IdSet].filter((id) => !londonMerchantIds.has(id))

  console.log(`London merchants found in top-30 redemption pool: ${londonInTop30.length}`)
  console.log(`Non-London merchants in top-30: ${nonLondonInTop30.length}`)

  if (londonInTop30.length === 0 && londonMerchantIds.size > 0) {
    console.log('\n→ DOMINANT ROOT CAUSE: (A) top-30 inclusion is dominated by non-London merchants.')
    console.log('  London merchants EXIST in the database but have ZERO presence in the')
    console.log('  current-month top-30 redemption pool.  V3 for a London user has no')
    console.log('  London branches to rank.  V3 head is empty → rail fills entirely from')
    console.log('  permissive tail (or non-rankable London-area branches if any exist).')
  } else if (londonInTop30.length > 0 && londonInTop30.length < 5) {
    console.log('\n→ MIXED ROOT CAUSE: (A) + possibly (B).  Only a handful of London merchants')
    console.log('  are in the top-30, and they may or may not be rankable.  Combined with')
    console.log('  cross-region QA merchants flooding the pool, V3 head is thin.')
  } else if (londonInTop30.length >= 5) {
    console.log('\n→ POSSIBLY (B) or (C): the top-30 has reasonable London representation,')
    console.log('  so the bug is likely in the V3 → permissive tail interleaving.  Check')
    console.log('  if London merchants are POSTCODE_CENTROID (non-rankable) and Karaara/')
    console.log('  Pino\'s are also POSTCODE_CENTROID (bypassing V3 maxRung gate).')
  }
}

async function main() {
  try {
    const { counts } = await section1_top30Merchants()
    const { londonMerchantIds } = await section2_londonMerchants()
    await section3_topUsers()
    await section4_rootCauseAnalysis(counts, londonMerchantIds)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
