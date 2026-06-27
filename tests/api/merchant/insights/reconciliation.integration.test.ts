import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  makeTestPrisma,
  newFixtureIds,
  seedScenario,
  seedBranch,
  seedUser,
  seedVoucher,
  seedRedemption,
  cleanup,
  type FixtureIds,
} from './_helpers/testDb'
import type { PrismaClient } from '../../../../generated/prisma/client'
import type { MerchantContext } from '../../../../src/api/merchant/shared'
import {
  getOverview,
  getTrend,
  getValidation,
  type InsightsFilters,
} from '../../../../src/api/merchant/insights/service'

// Insights PR-A Task A4 RECONCILIATION (real local DB).
//
// Pins the locked counting model (spec 4.2):
//   - confirmed + awaiting === logged for several filters/windows;
//   - trend months sum to the overview logged;
//   - savings: estimatedLogged >= estimatedConfirmed, awaiting = logged - confirmed;
//   - confirmed is discriminated by isValidated=true, NOT validatedAt IS NOT NULL
//     (a row with validatedAt set but isValidated=false MUST count as AWAITING).

const ownerCtx = (merchantId: string): MerchantContext => ({
  adminId: 'test-admin',
  merchantId,
  role: 'OWNER',
  allBranches: true,
  allowedBranchIds: [],
  canManageVouchers: true,
})

// A fixed clock so window math is deterministic. 15 March 2026 12:00 UTC: well
// inside the current incomplete month; redemptions seeded in early March fall in
// the this_month window.
const NOW = new Date('2026-03-15T12:00:00Z')

const allTime = (): InsightsFilters => ({ period: 'all', now: NOW })
const thisMonth = (): InsightsFilters => ({ period: 'this_month', now: NOW })

describe('Insights reconciliation (real local DB)', () => {
  let prisma: PrismaClient
  let ids: FixtureIds
  let merchantId: string
  let branchId: string
  let voucherId: string

  beforeAll(async () => {
    prisma = makeTestPrisma()
    ids = newFixtureIds()
    const s = await seedScenario(prisma, ids)
    merchantId = s.merchantId
    branchId = s.branchId
    voucherId = s.voucherId

    const userA = await seedUser(prisma, ids)
    const userB = await seedUser(prisma, ids)
    const userC = await seedUser(prisma, ids)

    // 3 CONFIRMED rows in March 2026 (this_month), savings 5 each.
    await seedRedemption(prisma, ids, { userId: userA, voucherId, branchId, redeemedAt: new Date('2026-03-02T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-02T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 5 })
    await seedRedemption(prisma, ids, { userId: userB, voucherId, branchId, redeemedAt: new Date('2026-03-05T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-06T11:00:00Z'), validationMethod: 'MANUAL', estimatedSaving: 5 })
    await seedRedemption(prisma, ids, { userId: userA, voucherId, branchId, redeemedAt: new Date('2026-03-10T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-10T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 5 })

    // 2 AWAITING rows in March 2026, savings 5 each.
    await seedRedemption(prisma, ids, { userId: userB, voucherId, branchId, redeemedAt: new Date('2026-03-07T10:00:00Z'), isValidated: false, estimatedSaving: 5 })
    await seedRedemption(prisma, ids, { userId: userC, voucherId, branchId, redeemedAt: new Date('2026-03-08T10:00:00Z'), isValidated: false, estimatedSaving: 5 })

    // 1 CONFIRMED row in February 2026 (NOT this_month), savings 5.
    await seedRedemption(prisma, ids, { userId: userA, voucherId, branchId, redeemedAt: new Date('2026-02-10T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-02-10T11:00:00Z'), validationMethod: 'QR_SCAN', estimatedSaving: 5 })
  })

  afterAll(async () => {
    await cleanup(prisma, ids)
    await prisma.$disconnect()
  })

  it('confirmed + awaiting === logged (this_month)', async () => {
    const o = await getOverview(prisma, ownerCtx(merchantId), thisMonth())
    expect(o.redemptionActivity.logged).toBe(5) // 3 confirmed + 2 awaiting in March
    expect(o.redemptionActivity.confirmed).toBe(3)
    expect(o.redemptionActivity.awaiting).toBe(2)
    expect(o.redemptionActivity.confirmed + o.redemptionActivity.awaiting).toBe(o.redemptionActivity.logged)
  })

  it('confirmed + awaiting === logged (all-time, includes Feb)', async () => {
    const o = await getOverview(prisma, ownerCtx(merchantId), allTime())
    expect(o.redemptionActivity.logged).toBe(6) // 5 March + 1 Feb
    expect(o.redemptionActivity.confirmed).toBe(4) // 3 March + 1 Feb confirmed
    expect(o.redemptionActivity.awaiting).toBe(2)
    expect(o.redemptionActivity.confirmed + o.redemptionActivity.awaiting).toBe(o.redemptionActivity.logged)
  })

  it('distinct customers counts DISTINCT userId (this_month)', async () => {
    const o = await getOverview(prisma, ownerCtx(merchantId), thisMonth())
    // userA (x2), userB (x2), userC (x1) -> 3 distinct in March.
    expect(o.distinctCustomers.logged).toBe(3)
  })

  it('savings: estimatedLogged >= estimatedConfirmed; awaiting = logged - confirmed', async () => {
    const o = await getOverview(prisma, ownerCtx(merchantId), thisMonth())
    expect(o.savings.estimatedLogged).toBe(25) // 5 rows x 5
    expect(o.savings.estimatedConfirmed).toBe(15) // 3 confirmed x 5
    expect(o.savings.estimatedLogged).toBeGreaterThanOrEqual(o.savings.estimatedConfirmed)
    expect(o.savings.awaiting).toBe(o.savings.estimatedLogged - o.savings.estimatedConfirmed)
    expect(o.savings.awaiting).toBe(10)
  })

  it('trend months sum to the overview logged (all-time)', async () => {
    const ctx = ownerCtx(merchantId)
    const o = await getOverview(prisma, ctx, allTime())
    const t = await getTrend(prisma, ctx, allTime())
    const summedLogged = t.months.reduce((acc, m) => acc + m.logged, 0)
    const summedConfirmed = t.months.reduce((acc, m) => acc + m.confirmed, 0)
    expect(summedLogged).toBe(o.redemptionActivity.logged)
    expect(summedConfirmed).toBe(o.redemptionActivity.confirmed)
    // Two London months present: Feb + March.
    expect(t.months.length).toBe(2)
    expect(t.months.map((m) => m.monthStartLondon)).toEqual(['2026-02-01', '2026-03-01'])
  })

  it('CRITICAL: confirmed uses isValidated=true, NOT validatedAt IS NOT NULL', async () => {
    // Seed a row with validatedAt SET but isValidated=false: it must count as
    // AWAITING. If the service used `validatedAt IS NOT NULL` it would wrongly
    // count as confirmed and break the invariant.
    const scratch = newFixtureIds()
    const s = await seedScenario(prisma, scratch)
    const u = await seedUser(prisma, scratch)
    await seedRedemption(prisma, scratch, {
      userId: u,
      voucherId: s.voucherId,
      branchId: s.branchId,
      redeemedAt: new Date('2026-03-09T10:00:00Z'),
      isValidated: false, // the discriminator
      validatedAt: new Date('2026-03-09T11:00:00Z'), // the decoy
      validationMethod: null,
      estimatedSaving: 9,
    })

    try {
      const o = await getOverview(prisma, ownerCtx(s.merchantId), thisMonth())
      expect(o.redemptionActivity.logged).toBe(1)
      expect(o.redemptionActivity.confirmed).toBe(0) // NOT counted as confirmed
      expect(o.redemptionActivity.awaiting).toBe(1)
      expect(o.savings.estimatedConfirmed).toBe(0)
      expect(o.savings.estimatedLogged).toBe(9)

      // Validation methods must also exclude this row (it has null method anyway,
      // but the isValidated=true gate is the real guard).
      const v = await getValidation(prisma, ownerCtx(s.merchantId), thisMonth())
      expect(v.logged).toBe(1)
      expect(v.confirmed).toBe(0)
      expect(v.awaiting).toBe(1)
      expect(v.methods).toEqual([])
    } finally {
      await cleanup(prisma, scratch)
    }
  })

  it('validation totals reconcile + method breakdown adapts (>1 method -> shown)', async () => {
    const v = await getValidation(prisma, ownerCtx(merchantId), thisMonth())
    expect(v.logged).toBe(5)
    expect(v.confirmed).toBe(3)
    expect(v.awaiting).toBe(2)
    expect(v.confirmed + v.awaiting).toBe(v.logged)
    // March confirmed methods: PIN x2 + MANUAL x1 -> 2 distinct methods -> shown.
    const totalMethodCount = v.methods.reduce((acc, m) => acc + m.count, 0)
    expect(v.methods.length).toBe(2)
    expect(totalMethodCount).toBe(v.confirmed)
    const pin = v.methods.find((m) => m.method === 'PIN')
    const manual = v.methods.find((m) => m.method === 'MANUAL')
    expect(pin?.count).toBe(2)
    expect(manual?.count).toBe(1)
  })

  it('completion rate = confirmed / logged (0-safe fraction)', async () => {
    const v = await getValidation(prisma, ownerCtx(merchantId), thisMonth())
    expect(v.completionRate).toBeCloseTo(3 / 5, 5)
  })
})
