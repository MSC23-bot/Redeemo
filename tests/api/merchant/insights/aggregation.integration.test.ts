import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  makeTestPrisma,
  newFixtureIds,
  seedMerchant,
  seedBranch,
  seedUser,
  seedVoucher,
  seedRedemption,
  cleanup,
  type FixtureIds,
} from './_helpers/testDb'
import type { PrismaClient } from '../../../../generated/prisma/client'
import type { MerchantContext } from '../../../../src/api/merchant/shared'
import { QA_ACCOUNT_EMAILS } from '../../../../src/api/customer/discovery/qaAccountFilter'
import {
  getOverview,
  getVouchers,
  getBranches,
  type InsightsFilters,
} from '../../../../src/api/merchant/insights/service'

// Insights PR-A Task A4 AGGREGATION + CLEANLINESS + SCOPE (real local DB).
//
// CLEANLINESS: seed eligible rows alongside isTestData=true (redemption/branch/
// merchant), a QA-email user, a DELETED user, and a cross-tenant branch; assert
// only the eligible rows count (exercises buildEligibilityWhereSql end-to-end).
// SCOPE: all-branches ctx sees all merchant branches; a scoped ctx sees only its
// allowed branches; an empty scope sees no rows.
// VOUCHERS/BRANCHES: rank + 7-type share + per-branch reconcile.

const ownerCtx = (merchantId: string): MerchantContext => ({
  adminId: 'test-admin',
  merchantId,
  role: 'OWNER',
  allBranches: true,
  allowedBranchIds: [],
  canManageVouchers: true,
})

const scopedBmCtx = (merchantId: string, allowedBranchIds: string[]): MerchantContext => ({
  adminId: 'test-admin',
  merchantId,
  role: 'BRANCH_MANAGER',
  allBranches: false,
  allowedBranchIds,
  canManageVouchers: false,
})

const NOW = new Date('2026-03-15T12:00:00Z')
const allTime = (): InsightsFilters => ({ period: 'all', now: NOW })

describe('Insights aggregation/cleanliness/scope (real local DB)', () => {
  let prisma: PrismaClient
  let ids: FixtureIds

  // Primary eligible merchant with two branches.
  let merchantId: string
  let branch1: string
  let branch2: string
  let voucherBogo: string
  let voucherDiscFixed: string
  let voucherDiscPercent: string

  beforeAll(async () => {
    prisma = makeTestPrisma()
    ids = newFixtureIds()

    merchantId = await seedMerchant(prisma, ids)
    branch1 = await seedBranch(prisma, ids, merchantId, { name: 'Branch One' })
    branch2 = await seedBranch(prisma, ids, merchantId, { name: 'Branch Two' })

    voucherBogo = await seedVoucher(prisma, ids, merchantId, { type: 'BOGO', title: 'BOGO Voucher', estimatedSaving: 10 })
    voucherDiscFixed = await seedVoucher(prisma, ids, merchantId, { type: 'DISCOUNT_FIXED', title: 'Fixed Off', estimatedSaving: 4 })
    voucherDiscPercent = await seedVoucher(prisma, ids, merchantId, { type: 'DISCOUNT_PERCENT', title: 'Percent Off', estimatedSaving: 6 })

    const u1 = await seedUser(prisma, ids)
    const u2 = await seedUser(prisma, ids)
    const u3 = await seedUser(prisma, ids)

    // --- Eligible rows (all March 2026) ---
    // Branch 1: BOGO x3 (2 confirmed + 1 awaiting), DiscFixed x1 confirmed.
    await seedRedemption(prisma, ids, { userId: u1, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-03-02T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-02T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 10 })
    await seedRedemption(prisma, ids, { userId: u2, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-03-03T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-03T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 10 })
    await seedRedemption(prisma, ids, { userId: u3, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-03-04T10:00:00Z'), isValidated: false, estimatedSaving: 10 })
    await seedRedemption(prisma, ids, { userId: u1, voucherId: voucherDiscFixed, branchId: branch1, redeemedAt: new Date('2026-03-05T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-05T11:00:00Z'), validationMethod: 'MANUAL', estimatedSaving: 4 })

    // Branch 2: DiscPercent x2 (1 confirmed + 1 awaiting).
    await seedRedemption(prisma, ids, { userId: u2, voucherId: voucherDiscPercent, branchId: branch2, redeemedAt: new Date('2026-03-06T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-06T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 6 })
    await seedRedemption(prisma, ids, { userId: u3, voucherId: voucherDiscPercent, branchId: branch2, redeemedAt: new Date('2026-03-07T10:00:00Z'), isValidated: false, estimatedSaving: 6 })

    // --- INELIGIBLE rows (must be excluded) ---
    // 1) isTestData=true redemption on the primary eligible branch.
    await seedRedemption(prisma, ids, { userId: u1, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-03-08T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-08T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 99, isTestData: true })

    // 2) isTestData=true BRANCH under the eligible merchant.
    const testBranch = await seedBranch(prisma, ids, merchantId, { name: 'Test Branch', isTestData: true })
    await seedRedemption(prisma, ids, { userId: u1, voucherId: voucherBogo, branchId: testBranch, redeemedAt: new Date('2026-03-09T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-09T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 99 })

    // 3) isTestData=true MERCHANT (separate) with its own branch/voucher.
    const testMerchant = await seedMerchant(prisma, ids, { isTestData: true })
    const testMerchantBranch = await seedBranch(prisma, ids, testMerchant, {})
    const testMerchantVoucher = await seedVoucher(prisma, ids, testMerchant, { type: 'BOGO' })
    await seedRedemption(prisma, ids, { userId: u1, voucherId: testMerchantVoucher, branchId: testMerchantBranch, redeemedAt: new Date('2026-03-10T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-10T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 99 })

    // 4) QA-email user redemption on the eligible branch.
    const qaUser = await seedUser(prisma, ids, { email: QA_ACCOUNT_EMAILS[0] })
    await seedRedemption(prisma, ids, { userId: qaUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-03-11T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-11T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 99 })

    // 5) DELETED user redemption on the eligible branch.
    const deletedUser = await seedUser(prisma, ids, { status: 'DELETED' })
    await seedRedemption(prisma, ids, { userId: deletedUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-03-12T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-12T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 99 })

    // 6) Cross-tenant branch under ANOTHER eligible merchant (must never count
    //    for the primary merchant).
    const otherMerchant = await seedMerchant(prisma, ids)
    const otherBranch = await seedBranch(prisma, ids, otherMerchant, {})
    const otherVoucher = await seedVoucher(prisma, ids, otherMerchant, { type: 'BOGO' })
    await seedRedemption(prisma, ids, { userId: u1, voucherId: otherVoucher, branchId: otherBranch, redeemedAt: new Date('2026-03-13T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-13T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 99 })
  })

  afterAll(async () => {
    await cleanup(prisma, ids)
    await prisma.$disconnect()
  })

  it('CLEANLINESS: only the eligible rows count (excludes test/QA/DELETED/cross-tenant)', async () => {
    const o = await getOverview(prisma, ownerCtx(merchantId), allTime())
    // 6 eligible rows total (4 branch1 + 2 branch2). All the 99-saving decoys excluded.
    expect(o.redemptionActivity.logged).toBe(6)
    expect(o.redemptionActivity.confirmed).toBe(4) // BOGOx2 + DiscFixedx1 + DiscPercentx1
    expect(o.redemptionActivity.awaiting).toBe(2)
    // No 99-value decoy leaked into the savings sum: 10+10+10+4+6+6 = 46.
    expect(o.savings.estimatedLogged).toBe(46)
    expect(o.savings.estimatedConfirmed).toBe(10 + 10 + 4 + 6) // confirmed subset
    // distinct customers across eligible: u1,u2,u3 -> 3.
    expect(o.distinctCustomers.logged).toBe(3)
  })

  it('SCOPE: owner all-branches sees all merchant branches', async () => {
    const b = await getBranches(prisma, ownerCtx(merchantId), allTime())
    const branchIds = b.rows.map((r) => r.branchId).sort()
    expect(branchIds).toEqual([branch1, branch2].sort())
    const b1 = b.rows.find((r) => r.branchId === branch1)
    const b2 = b.rows.find((r) => r.branchId === branch2)
    expect(b1?.logged).toBe(4)
    expect(b2?.logged).toBe(2)
  })

  it('SCOPE: scoped BM with [branch1] sees ONLY branch1 (no sibling leak)', async () => {
    const b = await getBranches(prisma, scopedBmCtx(merchantId, [branch1]), allTime())
    expect(b.rows.map((r) => r.branchId)).toEqual([branch1])
    expect(b.rows[0].logged).toBe(4)
    // Overview is also scoped to branch1 only.
    const o = await getOverview(prisma, scopedBmCtx(merchantId, [branch1]), allTime())
    expect(o.redemptionActivity.logged).toBe(4)
  })

  it('SCOPE: scoped BM with empty allowed set sees NO rows (fail-closed)', async () => {
    const b = await getBranches(prisma, scopedBmCtx(merchantId, []), allTime())
    expect(b.rows).toEqual([])
    const o = await getOverview(prisma, scopedBmCtx(merchantId, []), allTime())
    expect(o.redemptionActivity.logged).toBe(0)
    expect(o.redemptionActivity.confirmed).toBe(0)
    expect(o.redemptionActivity.awaiting).toBe(0)
    expect(o.savings.estimatedLogged).toBe(0)
  })

  it('VOUCHERS: top ranks by logged + reconciles confirmed; by-type collapses DISCOUNT', async () => {
    const v = await getVouchers(prisma, ownerCtx(merchantId), allTime())
    // Top: BOGO logged 3 (rank 1), then DiscFixed 1 + DiscPercent 1.
    expect(v.top[0].voucherId).toBe(voucherBogo)
    expect(v.top[0].type7).toBe('BOGO')
    expect(v.top[0].logged).toBe(3)
    expect(v.top[0].confirmed).toBe(2)
    expect(v.top[0].estimatedLogged).toBe(30)
    expect(v.top[0].estimatedConfirmed).toBe(20)

    // By-type: DISCOUNT collapses Fixed(1) + Percent(2) = 3; BOGO = 3. Total = 6.
    // (DiscPercent has 2 eligible rows: 1 confirmed + 1 awaiting.)
    const discount = v.byType.find((t) => t.type7 === 'DISCOUNT')
    const bogo = v.byType.find((t) => t.type7 === 'BOGO')
    expect(discount?.logged).toBe(3)
    expect(bogo?.logged).toBe(3)
    // Share denominator = total logged across the type groups = 3 BOGO + 3
    // DISCOUNT = 6 (all eligible rows).
    const totalByType = v.byType.reduce((acc, t) => acc + t.logged, 0)
    expect(totalByType).toBe(6)
    expect(bogo?.sharePct).toBeCloseTo(50, 1) // 3/6
    expect(discount?.sharePct).toBeCloseTo(50, 1) // 3/6 (1 fixed + 2 percent)
  })

  it('VOUCHER-TYPE FILTER: DISCOUNT maps to both DB discount values', async () => {
    const v = await getVouchers(prisma, ownerCtx(merchantId), { period: 'all', now: NOW, voucherType: 'DISCOUNT' })
    // Only the discount vouchers appear; total logged = DiscFixed(1) + DiscPercent(2) = 3.
    const ids2 = v.top.map((t) => t.voucherId).sort()
    expect(ids2).toEqual([voucherDiscFixed, voucherDiscPercent].sort())
    const o = await getOverview(prisma, ownerCtx(merchantId), { period: 'all', now: NOW, voucherType: 'DISCOUNT' })
    expect(o.redemptionActivity.logged).toBe(3)
  })

  it('BRANCHES reconcile to overview logged (sum of per-branch logged)', async () => {
    const ctx = ownerCtx(merchantId)
    const o = await getOverview(prisma, ctx, allTime())
    const b = await getBranches(prisma, ctx, allTime())
    const summed = b.rows.reduce((acc, r) => acc + r.logged, 0)
    expect(summed).toBe(o.redemptionActivity.logged)
  })

  it('META: scopeLabel + earliestDate reflect scope', async () => {
    const o = await getOverview(prisma, ownerCtx(merchantId), allTime())
    expect(o.meta.scopeLabel).toBe('All branches')
    // Earliest eligible redemption is the 2 March 2026 BOGO row.
    expect(o.meta.earliestDate).toBe('2026-03-02T10:00:00.000Z')
    expect(o.meta.filtersEcho.period).toBe('all')
  })

  it('COMPARISON: incomplete period (all) -> all comparisons null', async () => {
    const o = await getOverview(prisma, ownerCtx(merchantId), allTime())
    expect(o.redemptionActivity.comparison).toBeNull()
    expect(o.distinctCustomers.comparison).toBeNull()
    expect(o.savings.comparison).toBeNull()
  })

  it('COMPARISON: completed period (last_month) computes per-KPI deltas', async () => {
    // last_month for NOW=2026-03-15 is February 2026; comparison window = January.
    // Feb has NO eligible rows in this fixture (all are March). So logged=0; the
    // comparison object is non-null (period is complete) with cur=0.
    const o = await getOverview(prisma, ownerCtx(merchantId), { period: 'last_month', now: NOW })
    expect(o.redemptionActivity.comparison).not.toBeNull()
    expect(o.redemptionActivity.comparison?.cur).toBe(0)
    expect(o.redemptionActivity.comparison?.prev).toBe(0)
    expect(o.redemptionActivity.comparison?.pct).toBeNull() // prev 0 -> pct null
  })
})
