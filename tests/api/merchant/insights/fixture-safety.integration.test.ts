import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { makeTestPrisma } from './_helpers/testDb'
import { buildRouteApp, INSIGHTS_PREFIX, type RouteApp } from './_helpers/routeApp'
import type { PrismaClient } from '../../../../generated/prisma/client'
import type { MerchantContext } from '../../../../src/api/merchant/shared'
import { resolveMerchantContext } from '../../../../src/api/merchant/shared'
import { getOverview, type InsightsFilters } from '../../../../src/api/merchant/insights/service'
import {
  seedInsightsDemoFixture,
  INSIGHTS_DEMO_MERCHANT_NAME,
  INSIGHTS_DEMO_LOGIN_EMAIL,
} from '../../../../prisma/insights-demo-fixture'

// Insights PR-A Task A10 - DEMO-FIXTURE SAFETY + DEMO INCLUDE-PATH (real local DB).
//
// Seeds the demo fixture for real against the isolated loopback Postgres, then
// PROVES the locked isolation invariants AND the server-owned demo include-path at
// the data + route level:
//   1. EVERY seeded row (merchant + branches + vouchers + redemptions) carries
//      isTestData=true; every redemption belongs to the demo merchant only.
//   2. PRODUCTION CLEANLINESS at the DATA layer: with the demo include-path OFF
//      (the default), the canonical eligible rule returns ZERO for the demo
//      merchant - hundreds of demo rows are invisible (case b).
//   3. DEMO INCLUDE-PATH ON (non-prod + flag + id match): the demo merchant's
//      isTestData=true rows SURFACE through getOverview AND a real route (case a).
//   4. NODE_ENV=production hard gate: even with the flag + id, the resolver returns
//      undefined so the rows stay hidden (case c).
//   5. A NORMAL merchant (flag set + a DIFFERENT allowlisted demo id) NEVER sees
//      its (or anyone's) test rows (case d).
//   6. RESEED IS DETERMINISTIC: running the fixture twice yields the SAME
//      redemption count, not double (case e).
//   7. The demo MerchantAdmin/membership resolves via resolveMerchantContext to the
//      demo merchant (case f).
//
// SAFETY: this suite runs ONLY against the loopback TEST_DATABASE_URL (the
// makeTestPrisma guard throws before any connection otherwise). NODE_ENV + the
// INSIGHTS_DEMO_* env are saved/restored in afterEach so no other suite is affected.

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

// Save/restore the demo env around every case so no leak crosses tests.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_DEMO_FIXTURE = process.env.INSIGHTS_DEMO_FIXTURE
const ORIGINAL_DEMO_INCLUDE = process.env.INSIGHTS_DEMO_INCLUDE
const ORIGINAL_DEMO_MERCHANT_ID = process.env.INSIGHTS_DEMO_MERCHANT_ID

function restoreDemoEnv(): void {
  const set = (k: string, v: string | undefined) => {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
    else process.env[k] = v
  }
  set('NODE_ENV', ORIGINAL_NODE_ENV)
  set('INSIGHTS_DEMO_FIXTURE', ORIGINAL_DEMO_FIXTURE)
  set('INSIGHTS_DEMO_INCLUDE', ORIGINAL_DEMO_INCLUDE)
  set('INSIGHTS_DEMO_MERCHANT_ID', ORIGINAL_DEMO_MERCHANT_ID)
}

describe('Insights demo fixture isolation + include-path (real local DB)', () => {
  let prisma: PrismaClient
  let routeApp: RouteApp
  let merchantId: string
  let merchantAdminId: string
  let branchIds: string[]
  let voucherIds: string[]
  let redemptionsCreated: number

  beforeAll(async () => {
    prisma = makeTestPrisma()
    routeApp = await buildRouteApp()

    // Open the SEED guard for the seed call ONLY (restored immediately after).
    process.env.NODE_ENV = 'test'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    try {
      const result = await seedInsightsDemoFixture(prisma)
      merchantId = result.merchantId
      merchantAdminId = result.merchantAdminId
      branchIds = result.branchIds
      voucherIds = result.voucherIds
      redemptionsCreated = result.redemptionsCreated
    } finally {
      restoreDemoEnv()
    }
  })

  afterEach(() => {
    // Each case mutates the demo env (NODE_ENV / INSIGHTS_DEMO_INCLUDE /
    // INSIGHTS_DEMO_MERCHANT_ID); restore so the next case starts clean.
    restoreDemoEnv()
  })

  afterAll(async () => {
    // FK-safe teardown of exactly what we seeded. Memberships + the merchant-admin
    // must go before the merchant (FK), redemptions before vouchers/branches.
    if (prisma && merchantId) {
      await prisma.voucherRedemption.deleteMany({ where: { branchId: { in: branchIds } } })
      await prisma.voucher.deleteMany({ where: { merchantId } })
      await prisma.merchantMembership.deleteMany({ where: { merchantId } })
      await prisma.branch.deleteMany({ where: { merchantId } })
      await prisma.merchant.deleteMany({ where: { id: merchantId } })
      await prisma.merchantAdmin.deleteMany({ where: { email: INSIGHTS_DEMO_LOGIN_EMAIL } })
      await prisma.user.deleteMany({
        where: { email: { endsWith: '@redeemo-insights-demo.invalid' } },
      })
    }
    await routeApp?.app.close()
    await prisma?.$disconnect()
  })

  // --- Existing isolation proofs (data-layer cleanliness) -------------------

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
    const leaked = await prisma.voucherRedemption.count({
      where: { branchId: { in: branchIds }, isTestData: false },
    })
    expect(leaked).toBe(0)
  })

  // --- (b) DEFAULT (include-path OFF): production cleanliness at the data layer

  it('(b) demo merchant + include-path FLAG UNSET -> ZERO eligible activity (production cleanliness)', async () => {
    // No INSIGHTS_DEMO_INCLUDE set => demoIncludeMerchantId returns undefined =>
    // the canonical eligible rule excludes every isTestData=true demo row.
    delete process.env.INSIGHTS_DEMO_INCLUDE
    process.env.INSIGHTS_DEMO_MERCHANT_ID = merchantId
    process.env.NODE_ENV = 'test'

    const { ctx, filters } = allTime(merchantId)
    const overview = await getOverview(prisma, ctx, filters)
    expect(overview.redemptionActivity.logged).toBe(0)
    expect(overview.redemptionActivity.confirmed).toBe(0)
    expect(overview.redemptionActivity.awaiting).toBe(0)
    expect(overview.distinctCustomers.logged).toBe(0)
    expect(Number(overview.savings.estimatedLogged)).toBe(0)
  })

  // --- (a) DEMO INCLUDE-PATH ON: the demo dataset SURFACES (service + route) --

  it('(a) demo merchant + resolver ACTIVE (non-prod + flag + id match) -> isTestData rows SURFACE in getOverview', async () => {
    process.env.NODE_ENV = 'test'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = merchantId

    const { ctx, filters } = allTime(merchantId)
    const overview = await getOverview(prisma, ctx, filters)
    // The full demo dataset now reconciles to the seeded count.
    expect(overview.redemptionActivity.logged).toBe(redemptionsCreated)
    // Half validated, half awaiting (seq % 2 alternation) -> confirmed > 0, awaiting > 0.
    expect(overview.redemptionActivity.confirmed).toBeGreaterThan(0)
    expect(overview.redemptionActivity.awaiting).toBeGreaterThan(0)
    expect(
      overview.redemptionActivity.confirmed + overview.redemptionActivity.awaiting,
    ).toBe(overview.redemptionActivity.logged)
    expect(overview.distinctCustomers.logged).toBeGreaterThan(0)
    expect(Number(overview.savings.estimatedLogged)).toBeGreaterThan(0)
  })

  it('(a-route) demo merchant + resolver ACTIVE -> /overview route surfaces the demo dataset for the demo OWNER login', async () => {
    process.env.NODE_ENV = 'test'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = merchantId

    const res = await routeApp.app.inject({
      method: 'GET',
      url: `${INSIGHTS_PREFIX}/overview?period=all`,
      headers: routeApp.authHeader(merchantAdminId),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // The demo dataset surfaces through the FULL authz'd route (resolveMerchantContext
    // -> assertMerchantActive -> assertInsightsAccess), keyed to the demo owner.
    expect(body.redemptionActivity.logged).toBe(redemptionsCreated)
  })

  // --- (c) NODE_ENV=production hard gate: rows stay hidden ------------------

  it('(c) NODE_ENV=production (even with flag + id) -> resolver undefined -> ZERO eligible activity', async () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = merchantId

    const { ctx, filters } = allTime(merchantId)
    const overview = await getOverview(prisma, ctx, filters)
    // The production hard gate in demoIncludeMerchantId returns undefined, so the
    // canonical eligible rule excludes every demo row even though the flag + id match.
    expect(overview.redemptionActivity.logged).toBe(0)
    expect(overview.distinctCustomers.logged).toBe(0)
    expect(Number(overview.savings.estimatedLogged)).toBe(0)
  })

  // --- (d) NORMAL merchant never sees test rows ----------------------------

  it('(d) a NORMAL merchant with the flag set + a DIFFERENT INSIGHTS_DEMO_MERCHANT_ID NEVER includes test rows', async () => {
    // Flag ON, but the allowlisted demo id is the DEMO merchant, while we query a
    // DIFFERENT (normal) merchant. demoIncludeMerchantId(normal) -> undefined.
    process.env.NODE_ENV = 'test'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = merchantId // the DEMO merchant is allowlisted

    // Query a normal merchant whose tenant id is NOT the allowlisted demo id.
    const normalMerchantId = 'a-normal-merchant-not-allowlisted'
    const { ctx, filters } = allTime(normalMerchantId)
    const overview = await getOverview(prisma, ctx, filters)
    // The normal merchant sees nothing (no rows at all, and certainly not the demo's).
    expect(overview.redemptionActivity.logged).toBe(0)
    expect(overview.distinctCustomers.logged).toBe(0)

    // Defence in depth: even with the NORMAL merchant itself allowlisted, the
    // same-merchant carve-out only relaxes ITS OWN (non-existent) test rows - it can
    // never reach the demo merchant's rows (tenant boundary is unchanged).
    process.env.INSIGHTS_DEMO_MERCHANT_ID = normalMerchantId
    const overview2 = await getOverview(prisma, ctx, filters)
    expect(overview2.redemptionActivity.logged).toBe(0)
    // And the demo merchant's seeded rows are still ONLY visible to the demo merchant.
    const demoCount = await prisma.voucherRedemption.count({ where: { branchId: { in: branchIds } } })
    expect(demoCount).toBe(redemptionsCreated)
  })

  // --- (e) deterministic reseed --------------------------------------------

  it('(e) reseeding twice yields the SAME redemption count (deterministic, not double)', async () => {
    const before = await prisma.voucherRedemption.count({ where: { branchId: { in: branchIds } } })
    expect(before).toBe(redemptionsCreated)

    process.env.NODE_ENV = 'test'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    let second: Awaited<ReturnType<typeof seedInsightsDemoFixture>>
    try {
      second = await seedInsightsDemoFixture(prisma)
    } finally {
      restoreDemoEnv()
    }

    // Same merchant, same redemption count (reconcile, not append).
    expect(second.merchantId).toBe(merchantId)
    expect(second.redemptionsCreated).toBe(redemptionsCreated)
    const after = await prisma.voucherRedemption.count({ where: { branchId: { in: branchIds } } })
    expect(after).toBe(before)
  })

  // --- (f) demo login resolves via resolveMerchantContext -------------------

  it('(f) the demo MerchantAdmin/membership resolves via resolveMerchantContext to the demo merchant', async () => {
    const ctx = await resolveMerchantContext(prisma, merchantAdminId)
    expect(ctx.merchantId).toBe(merchantId)
    expect(ctx.role).toBe('OWNER')
    expect(ctx.allBranches).toBe(true)
  })
})
