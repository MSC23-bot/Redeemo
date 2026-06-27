import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
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
  getRepeatRate,
  getNewVsReturning,
  type InsightsFilters,
} from '../../../../src/api/merchant/insights/service'

// Insights PR-A Task A5 BEHAVIOURAL service (GATED) - real local DB.
//
// getRepeatRate + getNewVsReturning derive customer-history analytics over the
// eligible logged dataset and are HARD-GATED by behaviouralGateOpen():
//   - GATE OPEN  -> they run the real queries.
//   - GATE CLOSED -> they return { available:false } and run NO query
//                    (spy on prisma.$queryRaw and assert it is not called).
//
// COHORT + LOOKBACK rules (spec 1.5):
//   - "Returning" = a distinct customer in the period (the voucher-type-filtered
//     cohort) who has >=1 PRIOR eligible logged redemption STRICTLY BEFORE the
//     window start, within the SAME effective branch scope but ACROSS ALL
//     voucher types.
//   - "New" = first eligible logged redemption inside the period (first+second
//     in-period -> still New).
//   - newCount + returningCount === total === distinct customers for the period.
//   - DELETED users excluded from BOTH the cohort and the lookback.
//   - repeat-rate denominator == the voucher-type-filtered distinct cohort.

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

// last_month for NOW = 2026-03-15 is FEBRUARY 2026 (a complete period). Window =
// [2026-02-01, 2026-03-01) London. The comparison window is JANUARY 2026.
const NOW = new Date('2026-03-15T12:00:00Z')
const febFilters = (extra: Partial<InsightsFilters> = {}): InsightsFilters => ({
  period: 'last_month',
  now: NOW,
  ...extra,
})

const GATE_VAR = 'INSIGHTS_BEHAVIOURAL_GATE'

/** Run a block with the behavioural gate OPEN, restoring the prior value after. */
async function withGateOpen<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env[GATE_VAR]
  process.env[GATE_VAR] = '1'
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env[GATE_VAR]
    else process.env[GATE_VAR] = prev
  }
}

/** Run a block with the behavioural gate explicitly CLOSED (unset). */
async function withGateClosed<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env[GATE_VAR]
  delete process.env[GATE_VAR]
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env[GATE_VAR]
    else process.env[GATE_VAR] = prev
  }
}

describe('Insights behavioural service (gated, real local DB)', () => {
  let prisma: PrismaClient
  let ids: FixtureIds

  let merchantId: string
  let branch1: string
  let branch2: string
  let voucherBogo: string
  let voucherDisc: string

  // Cohort customers (have an in-period February redemption).
  let returningUser: string // also has a prior (Jan) redemption -> Returning
  let newUser: string // only in-period -> New
  let crossTypeReturningUser: string // prior history is a DIFFERENT voucher type
  let priorOtherBranchUser: string // prior history on a sibling branch (scope-sensitive)

  beforeAll(async () => {
    prisma = makeTestPrisma()
    ids = newFixtureIds()

    merchantId = await seedMerchant(prisma, ids)
    branch1 = await seedBranch(prisma, ids, merchantId, { name: 'Branch One' })
    branch2 = await seedBranch(prisma, ids, merchantId, { name: 'Branch Two' })

    voucherBogo = await seedVoucher(prisma, ids, merchantId, { type: 'BOGO', title: 'BOGO', estimatedSaving: 10 })
    voucherDisc = await seedVoucher(prisma, ids, merchantId, { type: 'DISCOUNT_FIXED', title: 'Disc', estimatedSaving: 5 })

    returningUser = await seedUser(prisma, ids)
    newUser = await seedUser(prisma, ids)
    crossTypeReturningUser = await seedUser(prisma, ids)
    priorOtherBranchUser = await seedUser(prisma, ids)

    // --- Returning customer: PRIOR (Jan, BOGO, branch1) + IN-PERIOD (Feb, BOGO, branch1).
    await seedRedemption(prisma, ids, { userId: returningUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-01-10T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-01-10T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 10 })
    await seedRedemption(prisma, ids, { userId: returningUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-02-05T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-02-05T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 10 })

    // --- New customer: ONLY IN-PERIOD (Feb, BOGO, branch1) twice (first+second in-period -> New).
    await seedRedemption(prisma, ids, { userId: newUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-02-06T10:00:00Z'), isValidated: false, estimatedSaving: 10 })
    await seedRedemption(prisma, ids, { userId: newUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-02-20T10:00:00Z'), isValidated: false, estimatedSaving: 10 })

    // --- Cross-type returning: PRIOR history is a DIFFERENT voucher type (Jan DISCOUNT),
    //     IN-PERIOD cohort row is BOGO (Feb). When the cohort is filtered to BOGO this
    //     customer is still RETURNING because the lookback spans ALL voucher types.
    await seedRedemption(prisma, ids, { userId: crossTypeReturningUser, voucherId: voucherDisc, branchId: branch1, redeemedAt: new Date('2026-01-15T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-01-15T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 5 })
    await seedRedemption(prisma, ids, { userId: crossTypeReturningUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-02-10T10:00:00Z'), isValidated: false, estimatedSaving: 10 })

    // --- Scope-sensitivity customer: PRIOR history is on branch2 (Jan), IN-PERIOD on
    //     branch1 (Feb). Under a branch1-only scope this customer is NEW (the prior
    //     branch2 redemption is outside the effective scope); under all-branches they
    //     are RETURNING.
    await seedRedemption(prisma, ids, { userId: priorOtherBranchUser, voucherId: voucherBogo, branchId: branch2, redeemedAt: new Date('2026-01-20T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-01-20T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 10 })
    await seedRedemption(prisma, ids, { userId: priorOtherBranchUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-02-12T10:00:00Z'), isValidated: false, estimatedSaving: 10 })

    // --- DELETED user: PRIOR (Jan) + IN-PERIOD (Feb), all on branch1, BOGO. MUST be
    //     excluded from BOTH the cohort (not counted in total) AND any lookback.
    const deletedUser = await seedUser(prisma, ids, { status: 'DELETED' })
    await seedRedemption(prisma, ids, { userId: deletedUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-01-25T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-01-25T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 99 })
    await seedRedemption(prisma, ids, { userId: deletedUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-02-15T10:00:00Z'), isValidated: false, estimatedSaving: 99 })

    // --- QA-email user: PRIOR + IN-PERIOD, must be excluded by eligibility.
    const qaUser = await seedUser(prisma, ids, { email: QA_ACCOUNT_EMAILS[0] })
    await seedRedemption(prisma, ids, { userId: qaUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-01-26T10:00:00Z'), isValidated: true, validatedAt: new Date('2026-01-26T11:00:00Z'), validationMethod: 'PIN', estimatedSaving: 99 })
    await seedRedemption(prisma, ids, { userId: qaUser, voucherId: voucherBogo, branchId: branch1, redeemedAt: new Date('2026-02-16T10:00:00Z'), isValidated: false, estimatedSaving: 99 })
  })

  afterAll(async () => {
    await cleanup(prisma, ids)
    await prisma.$disconnect()
  })

  // --- GATE-CLOSED: { available:false } AND no query runs ---------------------

  it('GATE CLOSED: getRepeatRate returns {available:false} and runs NO query', async () => {
    await withGateClosed(async () => {
      const spy = vi.spyOn(prisma, '$queryRaw')
      try {
        const r = await getRepeatRate(prisma, ownerCtx(merchantId), febFilters())
        expect(r).toEqual({ available: false })
        expect(spy).not.toHaveBeenCalled()
      } finally {
        spy.mockRestore()
      }
    })
  })

  it('GATE CLOSED: getNewVsReturning returns {available:false} and runs NO query', async () => {
    await withGateClosed(async () => {
      const spy = vi.spyOn(prisma, '$queryRaw')
      try {
        const r = await getNewVsReturning(prisma, ownerCtx(merchantId), febFilters())
        expect(r).toEqual({ available: false })
        expect(spy).not.toHaveBeenCalled()
      } finally {
        spy.mockRestore()
      }
    })
  })

  // --- GATE-OPEN: New/Returning split + reconciliation ------------------------

  it('GATE OPEN: new-vs-returning split (all-branches owner, all types)', async () => {
    await withGateOpen(async () => {
      const r = await getNewVsReturning(prisma, ownerCtx(merchantId), febFilters())
      expect('available' in r).toBe(false)
      if ('available' in r) throw new Error('unreachable')
      // In-period cohort (all types, all branches): returningUser, newUser,
      // crossTypeReturningUser, priorOtherBranchUser = 4 distinct (DELETED + QA excluded).
      expect(r.total).toBe(4)
      // Returning (prior eligible redemption strictly before 2026-02-01, all types,
      // all branches): returningUser (Jan BOGO), crossTypeReturningUser (Jan DISC),
      // priorOtherBranchUser (Jan branch2). = 3. newUser is New.
      expect(r.returningCount).toBe(3)
      expect(r.newCount).toBe(1)
      // Invariant: new + returning === total === distinct customers.
      expect(r.newCount + r.returningCount).toBe(r.total)
    })
  })

  it('GATE OPEN: returning split scoped to branch1 drops the sibling-branch prior history', async () => {
    await withGateOpen(async () => {
      const r = await getNewVsReturning(prisma, scopedBmCtx(merchantId, [branch1]), febFilters())
      if ('available' in r) throw new Error('unreachable')
      // Cohort scoped to branch1 in-period: returningUser, newUser,
      // crossTypeReturningUser, priorOtherBranchUser all have a Feb branch1 row = 4.
      expect(r.total).toBe(4)
      // Lookback scoped to branch1 only: returningUser (Jan branch1) +
      // crossTypeReturningUser (Jan branch1 DISC) = 2 Returning. priorOtherBranchUser's
      // prior history is on branch2 (out of scope) -> NEW. newUser -> NEW.
      expect(r.returningCount).toBe(2)
      expect(r.newCount).toBe(2)
      expect(r.newCount + r.returningCount).toBe(r.total)
    })
  })

  it('GATE OPEN: voucher-type filter selects the cohort, lookback spans ALL types', async () => {
    await withGateOpen(async () => {
      const r = await getNewVsReturning(prisma, ownerCtx(merchantId), febFilters({ voucherType: 'BOGO' }))
      if ('available' in r) throw new Error('unreachable')
      // BOGO cohort in Feb (all branches): returningUser, newUser,
      // crossTypeReturningUser, priorOtherBranchUser all have a Feb BOGO row = 4.
      expect(r.total).toBe(4)
      // crossTypeReturningUser's prior is a DISCOUNT (Jan) - still RETURNING because
      // the lookback spans all voucher types. So Returning = returningUser,
      // crossTypeReturningUser, priorOtherBranchUser = 3; New = newUser = 1.
      expect(r.returningCount).toBe(3)
      expect(r.newCount).toBe(1)
      expect(r.newCount + r.returningCount).toBe(r.total)
    })
  })

  // --- GATE-OPEN: repeat-rate ------------------------------------------------

  it('GATE OPEN: repeat-rate denominator is the voucher-type-filtered distinct cohort', async () => {
    await withGateOpen(async () => {
      const rate = await getRepeatRate(prisma, ownerCtx(merchantId), febFilters({ voucherType: 'BOGO' }))
      if ('available' in rate) throw new Error('unreachable')
      const split = await getNewVsReturning(prisma, ownerCtx(merchantId), febFilters({ voucherType: 'BOGO' }))
      if ('available' in split) throw new Error('unreachable')
      // value = returning / total as a percentage. The denominator equals the split
      // total (the voucher-type-filtered distinct cohort).
      expect(rate.insufficient).toBe(false)
      const expectedPct = Math.round((split.returningCount / split.total) * 1000) / 10
      expect(rate.value).toBe(expectedPct) // 3/4 = 75
      expect(rate.value).toBe(75)
    })
  })

  it('GATE OPEN: repeat-rate matches the all-types split', async () => {
    await withGateOpen(async () => {
      const rate = await getRepeatRate(prisma, ownerCtx(merchantId), febFilters())
      if ('available' in rate) throw new Error('unreachable')
      // returning 3 / total 4 = 75%.
      expect(rate.value).toBe(75)
      expect(rate.insufficient).toBe(false)
      // last_month is a COMPLETE period -> comparison object present (non-null).
      expect(rate.comparison).not.toBeNull()
    })
  })

  it('GATE OPEN: repeat-rate insufficient when the cohort is empty (no in-period customers)', async () => {
    await withGateOpen(async () => {
      // last_3m for NOW=2026-03-15 = [2025-12-01, 2026-03-01). The fixture has Jan+Feb
      // rows; restrict instead to a window with NO eligible cohort: a fresh merchant.
      const freshIds = newFixtureIds()
      try {
        const freshMerchant = await seedMerchant(prisma, freshIds)
        await seedBranch(prisma, freshIds, freshMerchant, { name: 'Empty Branch' })
        const rate = await getRepeatRate(prisma, ownerCtx(freshMerchant), febFilters())
        if ('available' in rate) throw new Error('unreachable')
        expect(rate.insufficient).toBe(true)
        expect(rate.value).toBeNull()
      } finally {
        await cleanup(prisma, freshIds)
      }
    })
  })

  it('GATE OPEN: DELETED users are excluded from cohort + lookback', async () => {
    await withGateOpen(async () => {
      // The deletedUser has BOTH a prior (Jan) and an in-period (Feb) eligible-shaped
      // redemption. It must not inflate total (cohort) nor returningCount (lookback).
      const r = await getNewVsReturning(prisma, ownerCtx(merchantId), febFilters())
      if ('available' in r) throw new Error('unreachable')
      // total is 4 (deleted + QA both excluded) - already asserted above; this test
      // pins the exclusion explicitly so a regression that admits DELETED fails here.
      expect(r.total).toBe(4)
      // If DELETED leaked into the cohort, total would be >=5; into the lookback,
      // returning would over-count. 3 returning + 1 new.
      expect(r.returningCount).toBe(3)
      expect(r.newCount).toBe(1)
    })
  })
})
