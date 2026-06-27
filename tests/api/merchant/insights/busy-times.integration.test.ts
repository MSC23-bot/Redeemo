import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  makeTestPrisma,
  newFixtureIds,
  seedScenario,
  seedUser,
  seedRedemption,
  cleanup,
  type FixtureIds,
} from './_helpers/testDb'
import type { PrismaClient } from '../../../../generated/prisma/client'
import type { MerchantContext } from '../../../../src/api/merchant/shared'
import {
  getBusyTimes,
  getTrend,
  type BusyTimesResult,
  type BusyTimesIntensity,
  type InsightsFilters,
} from '../../../../src/api/merchant/insights/service'

// Insights PR-A Task A4 BUSY-TIMES + LONDON/DST + PRIVACY (real local DB).
//
// Pins:
//   - day index Mon=0..Sun=6 (a London Monday -> day===0; a London Sunday -> day===6);
//   - a row at a daypart boundary lands in exactly ONE daypart (half-open bounds);
//   - a row whose UTC hour differs from its London hour under BST buckets by the
//     London hour (DST-correct);
//   - a DST-transition-month row buckets into the correct London month (via trend);
//   - PRIVACY: the payload has NO 'logged'/raw-count field anywhere, busiest
//     carries no count, and busiest is location-only (day+daypart).

const ownerCtx = (merchantId: string): MerchantContext => ({
  adminId: 'test-admin',
  merchantId,
  role: 'OWNER',
  allBranches: true,
  allowedBranchIds: [],
  canManageVouchers: true,
})

// NOW well after the seeded rows so the 'all' window includes everything.
const NOW = new Date('2026-12-15T12:00:00Z')
const allTime = (): InsightsFilters => ({ period: 'all', now: NOW })

// DAYPART bounds (london.ts): [0,7) [7,12) [12,15) [15,18) [18,22) [22,24).
const DAYPART = { OVERNIGHT: 0, MORNING: 1, LUNCH: 2, AFTERNOON: 3, EVENING: 4, LATE: 5 }

function cell(grid: BusyTimesIntensity['grid'], day: number, daypart: number) {
  return grid.find((c) => c.day === day && c.daypart === daypart)
}

function asIntensity(r: BusyTimesResult): BusyTimesIntensity {
  if (!('mode' in r) || r.mode !== 'intensity') throw new Error('expected mode:intensity')
  return r
}

describe('Insights busy-times / London-DST / privacy (real local DB)', () => {
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

    const u = await seedUser(prisma, ids)
    const mk = (redeemedAt: Date) =>
      seedRedemption(prisma, ids, { userId: u, voucherId, branchId, redeemedAt, isValidated: true, validatedAt: redeemedAt, validationMethod: 'PIN', estimatedSaving: 5 })

    // Make the Monday Morning cell the PEAK so busiest is unambiguous and clearly
    // above the near-empty threshold (>3 rows).
    // 2 March 2026 is a London Monday; 08:00 GMT -> London 08:00 -> Morning.
    for (let i = 0; i < 5; i++) {
      await mk(new Date('2026-03-02T08:00:00Z'))
    }

    // A London SUNDAY row -> day===6. 8 March 2026 13:00 -> Lunch (daypart 2).
    await mk(new Date('2026-03-08T13:00:00Z'))

    // DAYPART BOUNDARY: London 07:00 (start of Morning) lands in Morning, NOT
    // Overnight. 3 March 2026 07:00 GMT = London 07:00. (Tuesday -> day 1.)
    await mk(new Date('2026-03-03T07:00:00Z'))
    // And the instant just before: London 06:59 -> Overnight (daypart 0).
    await mk(new Date('2026-03-03T06:59:00Z'))

    // DST-CORRECT HOUR: 20 April 2026 11:30 UTC -> London 12:30 (BST=UTC+1) ->
    // Lunch (daypart 2), Monday. If the service bucketed by UTC hour it would be
    // Morning (11:30 < 12). This pins the AT TIME ZONE conversion.
    await mk(new Date('2026-04-20T11:30:00Z'))

    // DST-TRANSITION MONTH: 30 March 2026 20:00 UTC -> London 21:00 (BST after
    // the 29 Mar switch) -> Monday Evening; must stay in the MARCH London month
    // (asserted via trend below).
    await mk(new Date('2026-03-30T20:00:00Z'))
  })

  afterAll(async () => {
    await cleanup(prisma, ids)
    await prisma.$disconnect()
  })

  it('day index is Mon=0..Sun=6: a London Monday -> day 0, a London Sunday -> day 6', async () => {
    const r = asIntensity(await getBusyTimes(prisma, ownerCtx(merchantId), allTime()))
    // Monday Morning peak cell is non-zero.
    expect(cell(r.grid, 0, DAYPART.MORNING)?.intensity).toBeGreaterThan(0)
    // Sunday Lunch cell is non-zero.
    expect(cell(r.grid, 6, DAYPART.LUNCH)?.intensity).toBeGreaterThan(0)
  })

  it('grid is a full 7x6 = 42 cells with valid day/daypart ranges', async () => {
    const r = asIntensity(await getBusyTimes(prisma, ownerCtx(merchantId), allTime()))
    expect(r.grid.length).toBe(42)
    for (const c of r.grid) {
      expect(c.day).toBeGreaterThanOrEqual(0)
      expect(c.day).toBeLessThanOrEqual(6)
      expect(c.daypart).toBeGreaterThanOrEqual(0)
      expect(c.daypart).toBeLessThanOrEqual(5)
      expect([0, 1, 2, 3].includes(c.intensity)).toBe(true)
    }
  })

  it('a daypart boundary lands in exactly one daypart (half-open): 07:00 -> Morning, 06:59 -> Overnight', async () => {
    const r = asIntensity(await getBusyTimes(prisma, ownerCtx(merchantId), allTime()))
    // Tuesday (day 1): the 07:00 row sits in Morning, NOT Overnight; the 06:59 row
    // sits in Overnight, NOT Morning. Each contributes to exactly one cell.
    expect(cell(r.grid, 1, DAYPART.MORNING)?.intensity).toBeGreaterThan(0)
    expect(cell(r.grid, 1, DAYPART.OVERNIGHT)?.intensity).toBeGreaterThan(0)
    // No double counting: every other Tuesday cell is the zero band.
    for (const dp of [DAYPART.LUNCH, DAYPART.AFTERNOON, DAYPART.EVENING, DAYPART.LATE]) {
      expect(cell(r.grid, 1, dp)?.intensity).toBe(0)
    }
  })

  it('DST-correct hour bucketing: 11:30 UTC in April -> London 12:30 -> Lunch (Monday)', async () => {
    const r = asIntensity(await getBusyTimes(prisma, ownerCtx(merchantId), allTime()))
    // Monday Lunch is non-zero (the April BST row). If bucketed by UTC hour the
    // row would land in Monday Morning instead.
    expect(cell(r.grid, 0, DAYPART.LUNCH)?.intensity).toBeGreaterThan(0)
  })

  it('DST-transition-month row buckets into the correct London month (March)', async () => {
    // The 30 Mar 2026 20:00 UTC row (London 21:00 BST) must land in the March
    // London month bucket, not April. trend buckets by redeemedAt London-month.
    const t = await getTrend(prisma, ownerCtx(merchantId), allTime())
    const march = t.months.find((m) => m.monthStartLondon === '2026-03-01')
    const april = t.months.find((m) => m.monthStartLondon === '2026-04-01')
    // March has the bulk of rows incl. the BST-transition row; April has only the
    // single 20 Apr row.
    expect(march).toBeTruthy()
    expect(april?.logged).toBe(1)
    // 5 Monday + 1 Sunday + 1 boundary(07:00) + 1 boundary(06:59) + 1 BST-transition = 9.
    expect(march?.logged).toBe(9)
  })

  it('PRIVACY: payload carries NO logged/raw-count field anywhere; busiest is location-only', async () => {
    const r = await getBusyTimes(prisma, ownerCtx(merchantId), allTime())
    const intensity = asIntensity(r)
    // Mode is intensity (the default privacy-safe mode).
    expect(intensity.mode).toBe('intensity')
    // No cell exposes a raw count under any key name.
    for (const c of intensity.grid) {
      expect('logged' in c).toBe(false)
      expect('count' in c).toBe(false)
      expect('cnt' in c).toBe(false)
      expect('peak' in c).toBe(false)
      expect(Object.keys(c).sort()).toEqual(['daypart', 'day', 'intensity'].sort())
    }
    // busiest is the peak LOCATION only (day+daypart), never a count.
    expect(intensity.busiest).not.toBeNull()
    expect(Object.keys(intensity.busiest!).sort()).toEqual(['daypart', 'day'].sort())
    expect('logged' in intensity.busiest!).toBe(false)
    expect('count' in intensity.busiest!).toBe(false)
    expect('intensity' in intensity.busiest!).toBe(false)
    // The Monday Morning peak (5 rows) is the busiest cell.
    expect(intensity.busiest).toEqual({ day: 0, daypart: DAYPART.MORNING })

    // Whole-payload deep scan: no key anywhere named like a raw count.
    const json = JSON.stringify(r)
    expect(json).not.toContain('"logged"')
    expect(json).not.toContain('"count"')
    expect(json).not.toContain('"cnt"')
    expect(json).not.toContain('"peak"')
  })

  it('PRIVACY: busiest is null when the peak could be near-empty (conservative omission)', async () => {
    // A fresh merchant with ONLY 2 redemptions in one cell: at/below the
    // near-empty threshold: so busiest is omitted (null) but intensity still
    // renders.
    const scratch = newFixtureIds()
    const s = await seedScenario(prisma, scratch)
    const u = await seedUser(prisma, scratch)
    await seedRedemption(prisma, scratch, { userId: u, voucherId: s.voucherId, branchId: s.branchId, redeemedAt: new Date('2026-03-02T08:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-02T08:00:00Z'), validationMethod: 'PIN', estimatedSaving: 5 })
    await seedRedemption(prisma, scratch, { userId: u, voucherId: s.voucherId, branchId: s.branchId, redeemedAt: new Date('2026-03-02T08:00:00Z'), isValidated: true, validatedAt: new Date('2026-03-02T08:00:00Z'), validationMethod: 'PIN', estimatedSaving: 5 })
    try {
      const r = asIntensity(await getBusyTimes(prisma, ownerCtx(s.merchantId), allTime()))
      expect(r.busiest).toBeNull() // 2 rows <= near-empty threshold (3)
      // The cell still has a non-zero intensity band (the client renders bands).
      expect(cell(r.grid, 0, DAYPART.MORNING)?.intensity).toBeGreaterThan(0)
    } finally {
      await cleanup(prisma, scratch)
    }
  })
})
