import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import {
  newFixtureIds,
  seedMerchant,
  seedBranch,
  seedUser,
  seedVoucher,
  seedRedemption,
  seedMerchantAdmin,
  seedMembership,
  cleanup,
  type FixtureIds,
} from './_helpers/testDb'
import { buildRouteApp, type RouteApp, INSIGHTS_PREFIX } from './_helpers/routeApp'
import { periodWindow, resolveComparisonWindow } from '../../../../src/api/merchant/insights/london'

// Insights PR-A Task A7 ROUTES (real local DB + HTTP layer).
//
// Pins the section 2.7 wire contract end-to-end through the fresh authz chain:
//   - the operational endpoints return their service result through the route;
//   - /overview merges the operational KPIs with the gated repeatRate;
//   - the gate closed -> repeatRate + /customers + /export.csv are not-available
//     and NO behavioural query runs (operational endpoints still work);
//   - busy-times is privacy-mode intensity ONLY (no raw count / no raw peak),
//     including under narrowed filters;
//   - the comparison wire shape is { cur, prev, pct, label } (NO `kind`) and
//     completionRate is a 0..1 fraction (alignment decisions, pinned for B1);
//   - a membership/status change between two requests takes effect immediately.

const get = (rt: RouteApp, adminId: string, path: string, query = '') =>
  rt.app.inject({
    method: 'GET',
    url: `${INSIGHTS_PREFIX}${path}${query}`,
    headers: rt.authHeader(adminId),
  })

// The ROUTE uses the REAL request clock (`new Date()`) as `now` (spec: pass the
// real request time). So fixtures are seeded relative to the actual current
// London month: an instant safely inside the "last_month" window, and one inside
// the comparison window (the month before last_month). Both are computed from the
// same london.ts window math the service uses, so the rows land in the windows
// the route resolves regardless of which calendar month the suite runs in.
const NOW = new Date()
const LAST_MONTH = periodWindow('last_month', NOW)
const LAST_MONTH_CMP = resolveComparisonWindow('last_month', NOW)!

/** An instant safely inside a [startUtc, endUtc) window (start + ~10 days). */
function midWindow(w: { startUtc: Date | null; endUtc: Date }): Date {
  const start = w.startUtc!.getTime()
  const end = w.endUtc.getTime()
  return new Date(start + Math.min(10 * 24 * 60 * 60 * 1000, (end - start) / 2))
}

const IN_LAST_MONTH = midWindow(LAST_MONTH)
const IN_LAST_MONTH_2 = new Date(IN_LAST_MONTH.getTime() + 2 * 24 * 60 * 60 * 1000)
const IN_LAST_MONTH_3 = new Date(IN_LAST_MONTH.getTime() + 4 * 24 * 60 * 60 * 1000)
const IN_PRIOR_MONTH = midWindow(LAST_MONTH_CMP)

describe('Insights routes : section 2.7 contract (real local DB + HTTP)', () => {
  let rt: RouteApp
  let ids: FixtureIds

  let merchantId: string
  let branch1: string
  let branch2: string
  let ownerAdmin: string
  let voucherBogo: string
  let voucherDiscFixed: string

  beforeAll(async () => {
    rt = await buildRouteApp()
    ids = newFixtureIds()

    merchantId = await seedMerchant(rt.prisma, ids, { businessName: 'Routes Co' })
    branch1 = await seedBranch(rt.prisma, ids, merchantId, { name: 'Branch One' })
    branch2 = await seedBranch(rt.prisma, ids, merchantId, { name: 'Branch Two' })
    ownerAdmin = await seedMerchantAdmin(rt.prisma, ids)
    await seedMembership(rt.prisma, ids, {
      merchantId, merchantAdminId: ownerAdmin, role: 'OWNER', allBranches: true,
    })

    voucherBogo = await seedVoucher(rt.prisma, ids, merchantId, { type: 'BOGO', title: 'BOGO', estimatedSaving: 10 })
    voucherDiscFixed = await seedVoucher(rt.prisma, ids, merchantId, { type: 'DISCOUNT_FIXED', title: 'Fixed', estimatedSaving: 4 })

    const u1 = await seedUser(rt.prisma, ids)
    const u2 = await seedUser(rt.prisma, ids)

    // Last-month eligible rows: 3 logged, 2 confirmed (one PIN, one QR_SCAN), 1 awaiting.
    await seedRedemption(rt.prisma, ids, {
      userId: u1, voucherId: voucherBogo, branchId: branch1,
      redeemedAt: IN_LAST_MONTH, isValidated: true, validatedAt: IN_LAST_MONTH, validationMethod: 'PIN', estimatedSaving: 10,
    })
    await seedRedemption(rt.prisma, ids, {
      userId: u2, voucherId: voucherDiscFixed, branchId: branch2,
      redeemedAt: IN_LAST_MONTH_2, isValidated: true, validatedAt: IN_LAST_MONTH_2, validationMethod: 'QR_SCAN', estimatedSaving: 4,
    })
    await seedRedemption(rt.prisma, ids, {
      userId: u1, voucherId: voucherDiscFixed, branchId: branch1,
      redeemedAt: IN_LAST_MONTH_3, isValidated: false, estimatedSaving: 4,
    })
    // Prior-month eligible row (the comparison window for last_month + the
    // returning-customer lookback): 1 row, by u1.
    await seedRedemption(rt.prisma, ids, {
      userId: u1, voucherId: voucherBogo, branchId: branch1,
      redeemedAt: IN_PRIOR_MONTH, isValidated: true, validatedAt: IN_PRIOR_MONTH, validationMethod: 'PIN', estimatedSaving: 10,
    })
  })

  afterEach(() => {
    // Gate is server-owned via env; ensure no test leaves it open.
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await cleanup(rt.prisma, ids)
    await rt.app.close()
    await rt.prisma.$disconnect()
  })

  // ── /overview ──────────────────────────────────────────────────────────────

  it('GET /overview returns operational KPIs (last_month) with per-KPI comparisons', async () => {
    const res = await get(rt, ownerAdmin, '/overview', '?period=last_month')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.redemptionActivity.logged).toBe(3)
    expect(body.redemptionActivity.confirmed).toBe(2)
    expect(body.redemptionActivity.awaiting).toBe(1)
    expect(body.distinctCustomers.logged).toBe(2)
    expect(body.savings.estimatedLogged).toBe(18) // 10 + 4 + 4
    expect(body.savings.estimatedConfirmed).toBe(14) // 10 + 4
    expect(body.meta.scopeLabel).toBe('All branches')
    expect(body.meta.filtersEcho.period).toBe('last_month')

    // The comparison object exists for a COMPLETE period and is shaped
    // { cur, prev, pct, label } with NO `kind` (alignment decision (a)).
    const cmp = body.redemptionActivity.comparison
    expect(cmp).not.toBeNull()
    expect(Object.keys(cmp).sort()).toEqual(['cur', 'label', 'pct', 'prev'])
    expect(cmp).not.toHaveProperty('kind')
    expect(cmp.cur).toBe(3)
    expect(cmp.prev).toBe(1) // January had 1 eligible logged row
    expect(cmp.label).toBe('last_month')
  })

  it('GET /overview repeatRate is {available:false} with the gate CLOSED (operational KPIs still return)', async () => {
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    const res = await get(rt, ownerAdmin, '/overview', '?period=last_month')
    const body = JSON.parse(res.body)
    expect(body.repeatRate).toEqual({ available: false })
    // Operational KPIs unaffected.
    expect(body.redemptionActivity.logged).toBe(3)
  })

  it('GET /overview comparison is null for an INCOMPLETE period (this_month)', async () => {
    const res = await get(rt, ownerAdmin, '/overview', '?period=this_month')
    const body = JSON.parse(res.body)
    expect(body.redemptionActivity.comparison).toBeNull()
    expect(body.distinctCustomers.comparison).toBeNull()
    expect(body.savings.comparison).toBeNull()
  })

  // ── /trend ───────────────────────────────────────────────────────────────

  it('GET /trend returns the monthly series bucketed by London month', async () => {
    const res = await get(rt, ownerAdmin, '/trend', '?period=last_6m')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body.months)).toBe(true)
    // The last-month bucket carries this suite's 3 logged / 2 confirmed rows. Find
    // it by its values (the label format is pinned by the trend unit suite; here we
    // pin that the route surfaces the right month's totals).
    const lastMonthBucket = body.months.find((m: any) => m.logged === 3 && m.confirmed === 2)
    expect(lastMonthBucket).toBeTruthy()
    expect(typeof lastMonthBucket.monthStartLondon).toBe('string')
    expect(lastMonthBucket.monthStartLondon).toMatch(/^\d{4}-\d{2}-01$/)
  })

  // ── /vouchers ──────────────────────────────────────────────────────────────

  it('GET /vouchers returns the per-voucher ranking + 7-type share', async () => {
    const res = await get(rt, ownerAdmin, '/vouchers', '?period=last_month')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.top.length).toBe(2)
    const fixed = body.top.find((v: any) => v.voucherId === voucherDiscFixed)
    expect(fixed.type7).toBe('DISCOUNT')
    expect(fixed.logged).toBe(2)
    // by-type share over total logged (3): DISCOUNT 2/3, BOGO 1/3.
    const disc = body.byType.find((t: any) => t.type7 === 'DISCOUNT')
    expect(disc.logged).toBe(2)
    expect(disc.sharePct).toBeCloseTo(66.7, 1)
  })

  // ── /branches ──────────────────────────────────────────────────────────────

  it('GET /branches returns per-branch ranking for an all-branches owner', async () => {
    const res = await get(rt, ownerAdmin, '/branches', '?period=last_month')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const branchIds = body.rows.map((r: any) => r.branchId).sort()
    expect(branchIds).toEqual([branch1, branch2].sort())
    const b1 = body.rows.find((r: any) => r.branchId === branch1)
    expect(b1.logged).toBe(2) // BOGO confirmed + DISCOUNT awaiting
  })

  // ── /validation ──────────────────────────────────────────────────────────

  it('GET /validation returns totals + completionRate as a 0..1 fraction + adaptive methods', async () => {
    const res = await get(rt, ownerAdmin, '/validation', '?period=last_month')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.logged).toBe(3)
    expect(body.confirmed).toBe(2)
    expect(body.awaiting).toBe(1)
    // completionRate is a FRACTION in [0,1] (alignment decision (b)): 2/3 ≈ 0.667.
    expect(body.completionRate).toBeGreaterThan(0)
    expect(body.completionRate).toBeLessThanOrEqual(1)
    expect(body.completionRate).toBeCloseTo(0.667, 2)
    // Two methods (PIN, QR_SCAN) -> the adaptive breakdown is populated.
    const methods = body.methods.map((m: any) => m.method).sort()
    expect(methods).toEqual(['PIN', 'QR_SCAN'])
  })

  // ── /busy-times PRIVACY ──────────────────────────────────────────────────

  it('GET /busy-times is intensity-mode ONLY with no raw count and no raw peak (full grid)', async () => {
    const res = await get(rt, ownerAdmin, '/busy-times', '?period=last_6m')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.mode).toBe('intensity')
    expect(body.mode).not.toBe('exact')
    // 7 x 6 = 42 cells, each only { day, daypart, intensity } : NEVER a count.
    expect(body.grid.length).toBe(42)
    for (const cell of body.grid) {
      expect(Object.keys(cell).sort()).toEqual(['day', 'daypart', 'intensity'])
      expect(cell).not.toHaveProperty('logged')
      expect(cell).not.toHaveProperty('count')
      expect(cell).not.toHaveProperty('cnt')
    }
    // busiest is a LOCATION only (day+daypart) or null : never a count.
    if (body.busiest !== null) {
      expect(Object.keys(body.busiest).sort()).toEqual(['day', 'daypart'])
    }
    // No raw-peak field anywhere on the payload.
    expect(body).not.toHaveProperty('peak')
    expect(body).not.toHaveProperty('peakCount')
  })

  it('GET /busy-times stays intensity-mode with no raw count under NARROWED filters (branch + voucherType + period)', async () => {
    const res = await get(rt, ownerAdmin, '/busy-times', `?period=last_month&branchId=${branch1}&voucherType=DISCOUNT`)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.mode).toBe('intensity')
    for (const cell of body.grid) {
      expect(cell).not.toHaveProperty('logged')
      expect(cell).not.toHaveProperty('count')
    }
  })

  // ── /customers (gated) ──────────────────────────────────────────────────

  it('GET /customers is not-available with the gate CLOSED (no behavioural query)', async () => {
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    const res = await get(rt, ownerAdmin, '/customers', '?period=last_month')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.newVsReturning).toEqual({ available: false })
    expect(body.repeatRate).toEqual({ available: false })
  })

  it('GET /customers + /overview.repeatRate compute when the gate is OPEN', async () => {
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '1'
    const cust = JSON.parse((await get(rt, ownerAdmin, '/customers', '?period=last_month')).body)
    // u1 + u2 are the Feb cohort; u1 had a Jan eligible row (returning), u2 is new.
    expect(cust.newVsReturning.total).toBe(2)
    expect(cust.newVsReturning.returningCount).toBe(1)
    expect(cust.newVsReturning.newCount).toBe(1)
    expect(cust.repeatRate.available).toBeUndefined()
    expect(cust.repeatRate.value).toBeCloseTo(50, 1)

    const ov = JSON.parse((await get(rt, ownerAdmin, '/overview', '?period=last_month')).body)
    expect(ov.repeatRate.available).toBeUndefined()
    expect(ov.repeatRate.value).toBeCloseTo(50, 1)
  })

  // ── /export.csv (gated) ──────────────────────────────────────────────────

  it('GET /export.csv is not-available with the gate CLOSED', async () => {
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    const res = await get(rt, ownerAdmin, '/export.csv', '?period=last_month')
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ available: false })
  })

  it('GET /export.csv returns text/csv event rows with the gate OPEN and NO direct identifiers', async () => {
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '1'
    const res = await get(rt, ownerAdmin, '/export.csv', '?period=last_month')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('insights-redemptions.csv')

    const csv = res.body
    const headerLine = csv.split('\r\n')[0]
    // The expected event-level columns; DELIBERATELY no Customer column.
    expect(headerLine).toContain('Redeemed date')
    expect(headerLine).toContain('Voucher')
    expect(headerLine).toContain('Branch')
    expect(headerLine).toContain('Type')
    expect(headerLine).toContain('Status')
    expect(headerLine).toContain('Method')
    const lower = csv.toLowerCase()
    expect(lower).not.toContain('customer')
    expect(lower).not.toContain('email')
    expect(lower).not.toContain('userid')
    expect(lower).not.toContain('postcode')
    // The suite's last-month fixtures (3 logged rows) surface as 3 body lines.
    const bodyLines = csv.split('\r\n').slice(1).filter((l: string) => l.length > 0)
    expect(bodyLines.length).toBe(3)
    expect(lower).not.toContain('truncated')
  })

  it('GET /export.csv is rejected for a STAFF caller even with the gate OPEN (authz before gate)', async () => {
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '1'
    const staffAdmin = await seedMerchantAdmin(rt.prisma, ids)
    await seedMembership(rt.prisma, ids, {
      merchantId, merchantAdminId: staffAdmin, role: 'STAFF', allBranches: true,
    })
    const res = await get(rt, staffAdmin, '/export.csv', '?period=last_month')
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })

  // ── Fresh authz per request ──────────────────────────────────────────────

  it('a membership status change between two requests takes effect immediately (fresh authz)', async () => {
    // First request: an OWNER membership exists -> 200.
    const first = await get(rt, ownerAdmin, '/overview', '?period=last_month')
    expect(first.statusCode).toBe(200)

    // Flip the membership to INACTIVE -> getActiveMembership returns null ->
    // resolveMerchantContext throws INVALID_CREDENTIALS on the very next request.
    await rt.prisma.merchantMembership.updateMany({
      where: { merchantAdminId: ownerAdmin, merchantId },
      data: { status: 'INACTIVE' },
    })
    const second = await get(rt, ownerAdmin, '/overview', '?period=last_month')
    expect(second.statusCode).toBe(401)
    expect(JSON.parse(second.body).error.code).toBe('INVALID_CREDENTIALS')

    // Restore so afterAll cleanup + other ordering is unaffected.
    await rt.prisma.merchantMembership.updateMany({
      where: { merchantAdminId: ownerAdmin, merchantId },
      data: { status: 'ACTIVE' },
    })
  })

  it('rejects a malformed custom period (missing from/to) with 400', async () => {
    const res = await get(rt, ownerAdmin, '/overview', '?period=custom')
    expect(res.statusCode).toBe(400)
  })
})
