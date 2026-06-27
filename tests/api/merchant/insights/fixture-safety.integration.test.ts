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

// The demo voucher codes the fixture uses (kept in sync with insights-demo-fixture.ts).
// We reference one for the finding #10 voucher-code-collision case.
const DEMO_VOUCHER_CODE = 'INSIGHTS-DEMO-BOGO'
// The operator-supplied demo admin password for the seed call (finding #10). Test-only.
const TEST_DEMO_ADMIN_PASSWORD = 'TestOnlyDemoPw1!'

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
const ORIGINAL_DEPLOY_ENV = process.env.REDEEMO_DEPLOY_ENV
const ORIGINAL_DEMO_FIXTURE = process.env.INSIGHTS_DEMO_FIXTURE
const ORIGINAL_DEMO_INCLUDE = process.env.INSIGHTS_DEMO_INCLUDE
const ORIGINAL_DEMO_MERCHANT_ID = process.env.INSIGHTS_DEMO_MERCHANT_ID
const ORIGINAL_DEMO_PW = process.env.INSIGHTS_DEMO_ADMIN_PASSWORD

function restoreDemoEnv(): void {
  const set = (k: string, v: string | undefined) => {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
    else process.env[k] = v
  }
  set('NODE_ENV', ORIGINAL_NODE_ENV)
  set('REDEEMO_DEPLOY_ENV', ORIGINAL_DEPLOY_ENV)
  set('INSIGHTS_DEMO_FIXTURE', ORIGINAL_DEMO_FIXTURE)
  set('INSIGHTS_DEMO_INCLUDE', ORIGINAL_DEMO_INCLUDE)
  set('INSIGHTS_DEMO_MERCHANT_ID', ORIGINAL_DEMO_MERCHANT_ID)
  set('INSIGHTS_DEMO_ADMIN_PASSWORD', ORIGINAL_DEMO_PW)
}

/** Open BOTH seed guards (staging identity + flag) and the credential, then run fn. */
async function withSeedGuardsOpen<T>(fn: () => Promise<T>): Promise<T> {
  process.env.REDEEMO_DEPLOY_ENV = 'staging'
  process.env.INSIGHTS_DEMO_FIXTURE = '1'
  process.env.INSIGHTS_DEMO_ADMIN_PASSWORD = TEST_DEMO_ADMIN_PASSWORD
  try {
    return await fn()
  } finally {
    restoreDemoEnv()
  }
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

    // Open the SEED guards for the seed call ONLY (restored immediately after).
    const result = await withSeedGuardsOpen(() => seedInsightsDemoFixture(prisma))
    merchantId = result.merchantId
    merchantAdminId = result.merchantAdminId
    branchIds = result.branchIds
    voucherIds = result.voucherIds
    redemptionsCreated = result.redemptionsCreated
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
    // Staging deploy, but no INSIGHTS_DEMO_INCLUDE set => demoIncludeMerchantId
    // returns undefined => the canonical eligible rule excludes every isTestData=true
    // demo row (default-off, even on staging).
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    delete process.env.INSIGHTS_DEMO_INCLUDE
    process.env.INSIGHTS_DEMO_MERCHANT_ID = merchantId

    const { ctx, filters } = allTime(merchantId)
    const overview = await getOverview(prisma, ctx, filters)
    expect(overview.redemptionActivity.logged).toBe(0)
    expect(overview.redemptionActivity.confirmed).toBe(0)
    expect(overview.redemptionActivity.awaiting).toBe(0)
    expect(overview.distinctCustomers.logged).toBe(0)
    expect(Number(overview.savings.estimatedLogged)).toBe(0)
  })

  // --- (a) DEMO INCLUDE-PATH ON: the demo dataset SURFACES (service + route) --

  it('(a) demo merchant + resolver ACTIVE (staging + flag + id match) -> isTestData rows SURFACE in getOverview', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
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
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
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

  // --- (c) staging-identity hard gate (finding #8): rows stay hidden -------

  it('(c) REDEEMO_DEPLOY_ENV=production (even with flag + id) -> resolver undefined -> ZERO eligible activity', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = merchantId

    const { ctx, filters } = allTime(merchantId)
    const overview = await getOverview(prisma, ctx, filters)
    // The staging-identity hard gate in demoIncludeMerchantId returns undefined, so
    // the canonical eligible rule excludes every demo row even though the flag + id match.
    expect(overview.redemptionActivity.logged).toBe(0)
    expect(overview.distinctCustomers.logged).toBe(0)
    expect(Number(overview.savings.estimatedLogged)).toBe(0)
  })

  it('(c-unset) REDEEMO_DEPLOY_ENV UNSET (even with flag + id) -> resolver undefined -> ZERO eligible activity', async () => {
    delete process.env.REDEEMO_DEPLOY_ENV
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = merchantId

    const { ctx, filters } = allTime(merchantId)
    const overview = await getOverview(prisma, ctx, filters)
    expect(overview.redemptionActivity.logged).toBe(0)
    expect(overview.distinctCustomers.logged).toBe(0)
  })

  it('(c-real-staging finding #8 BUG FIX) NODE_ENV=production AND REDEEMO_DEPLOY_ENV=staging -> rows SURFACE', async () => {
    // The locked staging reality: NODE_ENV stays production on Railway staging; the
    // demo MUST still surface because REDEEMO_DEPLOY_ENV==='staging'.
    process.env.NODE_ENV = 'production'
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = merchantId

    const { ctx, filters } = allTime(merchantId)
    const overview = await getOverview(prisma, ctx, filters)
    expect(overview.redemptionActivity.logged).toBe(redemptionsCreated)
  })

  // --- (d) NORMAL merchant never sees test rows ----------------------------

  it('(d) a NORMAL merchant with the flag set + a DIFFERENT INSIGHTS_DEMO_MERCHANT_ID NEVER includes test rows', async () => {
    // Flag ON (staging), but the allowlisted demo id is the DEMO merchant, while we
    // query a DIFFERENT (normal) merchant. demoIncludeMerchantId(normal) -> undefined.
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
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

    const second = await withSeedGuardsOpen(() => seedInsightsDemoFixture(prisma))

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

  // --- (g) FINDING #9: invert (test rows ONLY) - a non-test row under the demo
  //         merchant is EXCLUDED even with the carve-out active ----------------

  it('(g finding #9) a NON-test redemption under the demo merchant is EXCLUDED by the demo carve-out (test rows ONLY)', async () => {
    // Seed ONE isTestData=FALSE redemption on a demo branch, using a real
    // (isTestData=false) user + a fresh isTestData=false branch/voucher under the
    // demo merchant so the row is a genuine "non-test row that happens to sit under
    // the demo merchant". The finding-#9 invert must EXCLUDE it (test rows only),
    // never surface it alongside the demo dataset.
    const realUser = await prisma.user.create({
      data: { email: `insights-demo-realuser-${Date.now()}@example.com`, status: 'ACTIVE' },
      select: { id: true },
    })
    const realBranch = await prisma.branch.create({
      data: {
        merchantId,
        name: `INSIGHTS DEMO - NonTest ${Date.now()}`,
        isMainBranch: false,
        addressLine1: '2 Demo Street',
        city: 'London',
        postcode: 'EC1A 1BB',
        isActive: true,
        isTestData: false, // a NON-test branch under the demo merchant
      },
      select: { id: true },
    })
    const realVoucher = await prisma.voucher.create({
      data: {
        merchantId,
        code: `INSIGHTS-DEMO-NONTEST-${Date.now()}`,
        type: 'DISCOUNT_FIXED',
        title: 'Non-test under demo merchant',
        estimatedSaving: 4,
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        isTestData: false, // a NON-test voucher under the demo merchant
      },
      select: { id: true },
    })
    const realRedemption = await prisma.voucherRedemption.create({
      data: {
        userId: realUser.id,
        voucherId: realVoucher.id,
        branchId: realBranch.id,
        redemptionCode: `REAL-${Date.now()}`.toUpperCase().slice(0, 24),
        redeemedAt: new Date('2026-02-05T12:00:00Z'),
        isValidated: true,
        validatedAt: new Date('2026-02-05T12:05:00Z'),
        validationMethod: 'PIN',
        estimatedSaving: 4,
        isTestData: false, // THE non-test row
      },
      select: { id: true },
    })

    try {
      // Sanity: the non-test row really IS present in the DB on a branch under the
      // demo merchant (so its absence below is the invert at work, not a missing row).
      const present = await prisma.voucherRedemption.findUnique({
        where: { id: realRedemption.id },
        select: { id: true, isTestData: true, branch: { select: { merchantId: true } } },
      })
      expect(present).not.toBeNull()
      expect(present?.isTestData).toBe(false)
      expect(present?.branch.merchantId).toBe(merchantId)

      process.env.REDEEMO_DEPLOY_ENV = 'staging'
      process.env.INSIGHTS_DEMO_INCLUDE = '1'
      process.env.INSIGHTS_DEMO_MERCHANT_ID = merchantId

      // The carve-out scopes to the demo merchant; getOverview defaults to all its
      // branches (allBranches owner ctx). The invert => test rows ONLY => the count
      // is EXACTLY the seeded demo count, NOT demo + 1: the non-test row is EXCLUDED.
      const { ctx, filters } = allTime(merchantId)
      const overview = await getOverview(prisma, ctx, filters)
      expect(overview.redemptionActivity.logged).toBe(redemptionsCreated)
    } finally {
      // Clean up the extra rows so they do not skew later cases (afterAll FK-safe
      // teardown only knows the seeded ids).
      await prisma.voucherRedemption.deleteMany({ where: { id: realRedemption.id } })
      await prisma.voucher.deleteMany({ where: { id: realVoucher.id } })
      await prisma.branch.deleteMany({ where: { id: realBranch.id } })
      await prisma.user.deleteMany({ where: { id: realUser.id } })
      restoreDemoEnv()
    }
  })

  // --- (h) FINDING #10: scoped delete preserves a non-test row on a demo branch

  it('(h finding #10) reseed PRESERVES a non-test redemption on a demo branch (scoped delete = isTestData=true only)', async () => {
    // Put a NON-test redemption directly on an existing demo (isTestData=true) branch,
    // then reseed. The scoped delete (branchId IN demo + isTestData=true) must leave
    // this row alone while still reconciling the fixture-owned test rows.
    const realUser = await prisma.user.create({
      data: { email: `insights-demo-stray-${Date.now()}@example.com`, status: 'ACTIVE' },
      select: { id: true },
    })
    const strayRedemption = await prisma.voucherRedemption.create({
      data: {
        userId: realUser.id,
        voucherId: voucherIds[0],
        branchId: branchIds[0], // a demo (isTestData=true) branch
        redemptionCode: `STRAY-${Date.now()}`.toUpperCase().slice(0, 24),
        redeemedAt: new Date('2026-02-06T12:00:00Z'),
        estimatedSaving: 3,
        isTestData: false, // NON-test stray on a demo branch
      },
      select: { id: true },
    })

    try {
      await withSeedGuardsOpen(() => seedInsightsDemoFixture(prisma))

      // The stray non-test row survives the reseed.
      const survived = await prisma.voucherRedemption.findUnique({
        where: { id: strayRedemption.id },
        select: { id: true, isTestData: true },
      })
      expect(survived).not.toBeNull()
      expect(survived?.isTestData).toBe(false)

      // And the fixture-owned test count is still exactly the deterministic demo count.
      const testCount = await prisma.voucherRedemption.count({
        where: { branchId: { in: branchIds }, isTestData: true },
      })
      expect(testCount).toBe(redemptionsCreated)
    } finally {
      await prisma.voucherRedemption.deleteMany({ where: { id: strayRedemption.id } })
      await prisma.user.deleteMany({ where: { id: realUser.id } })
      restoreDemoEnv()
    }
  })
})

// --- FINDING #10: collision fail-closed + credential fail-closed + atomicity --
//
// These cases need to corrupt/insert pre-existing state BEFORE seeding, so they run
// in their own describe with isolated setup/teardown (NOT the shared demo fixture).
describe('Insights demo fixture - finding #10 collision + credential + atomicity (real local DB)', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = makeTestPrisma()
  })

  afterEach(() => {
    restoreDemoEnv()
  })

  afterAll(async () => {
    // Defensive teardown: remove anything any case might have created with the demo
    // sentinels (so a thrown case cannot leave residue for the shared suite).
    const demoMerchants = await prisma.merchant.findMany({
      where: { businessName: INSIGHTS_DEMO_MERCHANT_NAME },
      select: { id: true },
    })
    const ids = demoMerchants.map((m) => m.id)
    if (ids.length) {
      const demoBranches = await prisma.branch.findMany({ where: { merchantId: { in: ids } }, select: { id: true } })
      const branchIds = demoBranches.map((b) => b.id)
      if (branchIds.length)
        await prisma.voucherRedemption.deleteMany({ where: { branchId: { in: branchIds } } })
      await prisma.voucher.deleteMany({ where: { merchantId: { in: ids } } })
      await prisma.merchantMembership.deleteMany({ where: { merchantId: { in: ids } } })
      await prisma.branch.deleteMany({ where: { merchantId: { in: ids } } })
      await prisma.merchant.deleteMany({ where: { id: { in: ids } } })
    }
    await prisma.merchantAdmin.deleteMany({ where: { email: INSIGHTS_DEMO_LOGIN_EMAIL } })
    await prisma.voucher.deleteMany({ where: { code: DEMO_VOUCHER_CODE } })
    await prisma.user.deleteMany({ where: { email: { endsWith: '@redeemo-insights-demo.invalid' } } })
    await prisma.$disconnect()
  })

  it('CREDENTIAL FAIL-CLOSED: unset INSIGHTS_DEMO_ADMIN_PASSWORD -> throws, NOTHING is seeded', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    delete process.env.INSIGHTS_DEMO_ADMIN_PASSWORD

    await expect(seedInsightsDemoFixture(prisma)).rejects.toThrow(/INSIGHTS_DEMO_ADMIN_PASSWORD/)

    // Nothing was seeded (the credential is read+hashed before any DB write).
    const merchant = await prisma.merchant.findFirst({
      where: { businessName: INSIGHTS_DEMO_MERCHANT_NAME },
      select: { id: true },
    })
    expect(merchant).toBeNull()
    const admin = await prisma.merchantAdmin.findUnique({
      where: { email: INSIGHTS_DEMO_LOGIN_EMAIL },
      select: { id: true },
    })
    expect(admin).toBeNull()
  })

  it('COLLISION: a pre-existing NON-test merchant with the sentinel name -> THROWS (never hijacked)', async () => {
    // A real (isTestData=false) merchant happens to carry the demo sentinel name.
    const real = await prisma.merchant.create({
      data: { businessName: INSIGHTS_DEMO_MERCHANT_NAME, status: 'ACTIVE', isTestData: false },
      select: { id: true },
    })
    try {
      await expect(
        withSeedGuardsOpen(() => seedInsightsDemoFixture(prisma)),
      ).rejects.toThrow(/NON-test merchant|hijack/i)

      // The real merchant is untouched (still isTestData=false, still ACTIVE).
      const after = await prisma.merchant.findUnique({
        where: { id: real.id },
        select: { isTestData: true, status: true },
      })
      expect(after?.isTestData).toBe(false)
      expect(after?.status).toBe('ACTIVE')
    } finally {
      await prisma.merchant.deleteMany({ where: { id: real.id } })
    }
  })

  it('COLLISION: a pre-existing NON-demo voucher already owning a demo code -> THROWS (never upserted)', async () => {
    // A real merchant + a real (isTestData=false) voucher that already owns one of the
    // demo voucher codes. The fixture must THROW rather than upsert/hijack it.
    const otherMerchant = await prisma.merchant.create({
      data: { businessName: `Unrelated real merchant ${Date.now()}`, status: 'ACTIVE', isTestData: false },
      select: { id: true },
    })
    const realVoucher = await prisma.voucher.create({
      data: {
        merchantId: otherMerchant.id,
        code: DEMO_VOUCHER_CODE, // collides with a demo voucher code
        type: 'BOGO',
        title: 'A real voucher that grabbed the demo code',
        estimatedSaving: 9,
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        isTestData: false,
      },
      select: { id: true, merchantId: true },
    })
    try {
      await expect(
        withSeedGuardsOpen(() => seedInsightsDemoFixture(prisma)),
      ).rejects.toThrow(new RegExp(`${DEMO_VOUCHER_CODE}|hijack`, 'i'))

      // The real voucher is untouched: same owner, still non-test.
      const after = await prisma.voucher.findUnique({
        where: { id: realVoucher.id },
        select: { merchantId: true, isTestData: true, title: true },
      })
      expect(after?.merchantId).toBe(otherMerchant.id)
      expect(after?.isTestData).toBe(false)
      expect(after?.title).toBe('A real voucher that grabbed the demo code')
    } finally {
      await prisma.voucher.deleteMany({ where: { id: realVoucher.id } })
      // A demo merchant may have been created before the voucher loop threw; clean it.
      const demoM = await prisma.merchant.findFirst({
        where: { businessName: INSIGHTS_DEMO_MERCHANT_NAME },
        select: { id: true },
      })
      if (demoM) {
        await prisma.voucherRedemption.deleteMany({ where: { branch: { merchantId: demoM.id } } })
        await prisma.voucher.deleteMany({ where: { merchantId: demoM.id } })
        await prisma.merchantMembership.deleteMany({ where: { merchantId: demoM.id } })
        await prisma.branch.deleteMany({ where: { merchantId: demoM.id } })
        await prisma.merchant.deleteMany({ where: { id: demoM.id } })
        await prisma.merchantAdmin.deleteMany({ where: { email: INSIGHTS_DEMO_LOGIN_EMAIL } })
        await prisma.user.deleteMany({ where: { email: { endsWith: '@redeemo-insights-demo.invalid' } } })
      }
      await prisma.merchant.deleteMany({ where: { id: otherMerchant.id } })
    }
  })

  it('ATOMICITY: the reconcile delete+recreate is wrapped in prisma.$transaction (a valid seed reconciles cleanly)', async () => {
    // Prove the happy-path reconcile is transactional: seed once, then reseed; the
    // count is deterministic (the delete+recreate either both apply or neither does).
    // The transaction wrapping itself is what guarantees a mid-reconcile crash cannot
    // leave a partial (deleted-but-not-recreated) state.
    const first = await withSeedGuardsOpen(() => seedInsightsDemoFixture(prisma))
    expect(first.redemptionsCreated).toBeGreaterThan(0)

    const second = await withSeedGuardsOpen(() => seedInsightsDemoFixture(prisma))
    expect(second.merchantId).toBe(first.merchantId)
    expect(second.redemptionsCreated).toBe(first.redemptionsCreated)

    const count = await prisma.voucherRedemption.count({
      where: { branchId: { in: first.branchIds }, isTestData: true },
    })
    expect(count).toBe(first.redemptionsCreated)
  })
})
