import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeTestPrisma } from './_helpers/testDb'
import type { PrismaClient } from '../../../../generated/prisma/client'
import type { MerchantContext } from '../../../../src/api/merchant/shared'
import { getOverview, type InsightsFilters } from '../../../../src/api/merchant/insights/service'
import {
  seedInsightsDemoFixture,
  INSIGHTS_DEMO_MERCHANT_NAME,
} from '../../../../prisma/insights-demo-fixture'

// Insights PR-A Task A10 - DEMO-FIXTURE SAFETY (real local DB).
//
// Seeds the demo fixture for real against the isolated loopback Postgres, then
// PROVES the locked isolation invariants at the data level:
//   1. EVERY seeded row (merchant + branches + vouchers + redemptions) carries
//      isTestData=true.
//   2. Every seeded redemption belongs to the dedicated demo merchant only
//      (allowlist) - no row escapes onto another merchant.
//   3. The CANONICAL ELIGIBLE rule excludes the demo merchant's rows: running
//      the real getOverview (which composes buildEligibilityWhereSql) against
//      the demo merchant returns ZERO logged activity. Production cleanliness
//      holds at the DATA layer regardless of any guard state.
//
// SAFETY: this suite runs ONLY against the loopback TEST_DATABASE_URL (the
// makeTestPrisma guard throws before any connection otherwise). NODE_ENV is
// forced to a non-production value and the staging flag set ONLY for the seed
// call, then restored.

const ownerCtx = (merchantId: string): MerchantContext => ({
  adminId: 'test-admin',
  merchantId,
  role: 'OWNER',
  allBranches: true,
  allowedBranchIds: [],
  canManageVouchers: true,
})

const NOW = new Date('2026-03-15T12:00:00Z')
const allTime = (merchantId: string): { ctx: MerchantContext; filters: InsightsFilters } => ({
  ctx: ownerCtx(merchantId),
  filters: { period: 'all', now: NOW },
})

describe('Insights demo fixture isolation (real local DB)', () => {
  let prisma: PrismaClient
  let merchantId: string
  let branchIds: string[]
  let voucherIds: string[]
  let redemptionsCreated: number

  const ORIGINAL_NODE_ENV = process.env.NODE_ENV
  const ORIGINAL_DEMO_FLAG = process.env.INSIGHTS_DEMO_FIXTURE

  beforeAll(async () => {
    prisma = makeTestPrisma()

    // Open the guard for the seed call ONLY (restored immediately after).
    process.env.NODE_ENV = 'test'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    try {
      const result = await seedInsightsDemoFixture(prisma)
      merchantId = result.merchantId
      branchIds = result.branchIds
      voucherIds = result.voucherIds
      redemptionsCreated = result.redemptionsCreated
    } finally {
      if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = ORIGINAL_NODE_ENV
      if (ORIGINAL_DEMO_FLAG === undefined) delete process.env.INSIGHTS_DEMO_FIXTURE
      else process.env.INSIGHTS_DEMO_FIXTURE = ORIGINAL_DEMO_FLAG
    }
  })

  afterAll(async () => {
    // FK-safe teardown of exactly what we seeded (the dedicated demo merchant
    // and its dependents). Demo customers use the sentinel .invalid email space.
    if (prisma && merchantId) {
      await prisma.voucherRedemption.deleteMany({ where: { branchId: { in: branchIds } } })
      await prisma.voucher.deleteMany({ where: { merchantId } })
      await prisma.branch.deleteMany({ where: { merchantId } })
      await prisma.merchant.deleteMany({ where: { id: merchantId } })
      await prisma.user.deleteMany({
        where: { email: { endsWith: '@redeemo-insights-demo.invalid' } },
      })
    }
    await prisma?.$disconnect()
  })

  it('seeds a non-empty dataset across branches / voucher types / redemptions', () => {
    expect(branchIds.length).toBeGreaterThanOrEqual(3)
    expect(voucherIds.length).toBeGreaterThanOrEqual(7)
    expect(redemptionsCreated).toBeGreaterThan(0)
  })

  it('marks the demo merchant isTestData=true', async () => {
    const m = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { isTestData: true, businessName: true },
    })
    expect(m?.isTestData).toBe(true)
    expect(m?.businessName).toBe(INSIGHTS_DEMO_MERCHANT_NAME)
  })

  it('marks every demo branch isTestData=true and on the demo merchant only', async () => {
    const branches = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { isTestData: true, merchantId: true },
    })
    expect(branches.length).toBe(branchIds.length)
    for (const b of branches) {
      expect(b.isTestData).toBe(true)
      expect(b.merchantId).toBe(merchantId)
    }
  })

  it('marks every demo voucher isTestData=true and on the demo merchant only', async () => {
    const vouchers = await prisma.voucher.findMany({
      where: { id: { in: voucherIds } },
      select: { isTestData: true, merchantId: true },
    })
    expect(vouchers.length).toBe(voucherIds.length)
    for (const v of vouchers) {
      expect(v.isTestData).toBe(true)
      expect(v.merchantId).toBe(merchantId)
    }
  })

  it('marks EVERY demo redemption isTestData=true on the demo branches only', async () => {
    const rows = await prisma.voucherRedemption.findMany({
      where: { branchId: { in: branchIds } },
      select: { isTestData: true },
    })
    expect(rows.length).toBe(redemptionsCreated)
    expect(rows.every((r) => r.isTestData === true)).toBe(true)
    // Negative pin: NOT ONE demo redemption is isTestData=false.
    const leaked = await prisma.voucherRedemption.count({
      where: { branchId: { in: branchIds }, isTestData: false },
    })
    expect(leaked).toBe(0)
  })

  it('the canonical eligible rule EXCLUDES the demo merchant (production cleanliness holds at the data layer)', async () => {
    // getOverview composes buildEligibilityWhereSql, which AND-joins
    // merchant.isTestData=false / branch.isTestData=false / redemption.isTestData=false.
    // Because every demo row is isTestData=true, the eligible logged activity for
    // the demo merchant is ZERO - even though hundreds of demo redemptions exist.
    const { ctx, filters } = allTime(merchantId)
    const overview = await getOverview(prisma, ctx, filters)
    expect(overview.redemptionActivity.logged).toBe(0)
    expect(overview.redemptionActivity.confirmed).toBe(0)
    expect(overview.redemptionActivity.awaiting).toBe(0)
    expect(overview.distinctCustomers.logged).toBe(0)
    expect(Number(overview.savings.estimatedLogged)).toBe(0)
  })
})
