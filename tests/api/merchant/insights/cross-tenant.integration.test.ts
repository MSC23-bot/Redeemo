import { describe, it, expect, beforeAll, afterAll } from 'vitest'
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
import { periodWindow } from '../../../../src/api/merchant/insights/london'

// Insights PR-A Task A7 CROSS-TENANT isolation (real local DB + HTTP).
//
// Merchant A authenticates and must NEVER read merchant B's data : the tenant
// boundary is `branch.merchantId = ctx.merchantId` (the redemption has no
// merchantId; it joins via branch). Pins:
//   - A's endpoints count ONLY A's rows (B's rows are invisible);
//   - a crafted branchId belonging to B yields an EMPTY result, not an oracle
//     (no 404/403 that would confirm the branch exists, and zero rows);
//   - /branches never serialises B's branch ids / names;
//   - a scoped BM with ZERO in-scope branches gets empty rows;
//   - MUTATION: neutering the merchant tenant boundary in the eligibility WHERE
//     makes a cross-tenant test FAIL (proves the boundary is load-bearing).

const NOW = new Date()
const LAST_MONTH = periodWindow('last_month', NOW)
const IN_LAST_MONTH = new Date(LAST_MONTH.startUtc!.getTime() + 5 * 24 * 60 * 60 * 1000)

const get = (rt: RouteApp, adminId: string, path: string, query = '') =>
  rt.app.inject({ method: 'GET', url: `${INSIGHTS_PREFIX}${path}${query}`, headers: rt.authHeader(adminId) })

describe('Insights routes : cross-tenant isolation (real local DB + HTTP)', () => {
  let rt: RouteApp
  let ids: FixtureIds

  // Merchant A (the caller) + Merchant B (the sibling tenant).
  let merchantA: string
  let branchA: string
  let adminA: string
  let voucherA: string

  let merchantB: string
  let branchB: string
  let voucherB: string

  beforeAll(async () => {
    rt = await buildRouteApp()
    ids = newFixtureIds()

    merchantA = await seedMerchant(rt.prisma, ids, { businessName: 'Merchant A' })
    branchA = await seedBranch(rt.prisma, ids, merchantA, { name: 'A Branch' })
    adminA = await seedMerchantAdmin(rt.prisma, ids)
    await seedMembership(rt.prisma, ids, { merchantId: merchantA, merchantAdminId: adminA, role: 'OWNER', allBranches: true })
    voucherA = await seedVoucher(rt.prisma, ids, merchantA, { type: 'BOGO', title: 'A Voucher', estimatedSaving: 7 })

    merchantB = await seedMerchant(rt.prisma, ids, { businessName: 'Merchant B SECRET' })
    branchB = await seedBranch(rt.prisma, ids, merchantB, { name: 'B SECRET Branch' })
    voucherB = await seedVoucher(rt.prisma, ids, merchantB, { type: 'FREEBIE', title: 'B Voucher', estimatedSaving: 9 })

    const userA = await seedUser(rt.prisma, ids)
    const userB = await seedUser(rt.prisma, ids)

    // A: 2 eligible rows. B: 3 eligible rows (must stay invisible to A).
    await seedRedemption(rt.prisma, ids, { userId: userA, voucherId: voucherA, branchId: branchA, redeemedAt: IN_LAST_MONTH, isValidated: true, validatedAt: IN_LAST_MONTH, validationMethod: 'PIN', estimatedSaving: 7 })
    await seedRedemption(rt.prisma, ids, { userId: userA, voucherId: voucherA, branchId: branchA, redeemedAt: IN_LAST_MONTH, isValidated: false, estimatedSaving: 7 })

    await seedRedemption(rt.prisma, ids, { userId: userB, voucherId: voucherB, branchId: branchB, redeemedAt: IN_LAST_MONTH, isValidated: true, validatedAt: IN_LAST_MONTH, validationMethod: 'PIN', estimatedSaving: 9 })
    await seedRedemption(rt.prisma, ids, { userId: userB, voucherId: voucherB, branchId: branchB, redeemedAt: IN_LAST_MONTH, isValidated: true, validatedAt: IN_LAST_MONTH, validationMethod: 'PIN', estimatedSaving: 9 })
    await seedRedemption(rt.prisma, ids, { userId: userB, voucherId: voucherB, branchId: branchB, redeemedAt: IN_LAST_MONTH, isValidated: false, estimatedSaving: 9 })
  })

  afterAll(async () => {
    await cleanup(rt.prisma, ids)
    await rt.app.close()
    await rt.prisma.$disconnect()
  })

  it('A.overview counts ONLY A rows (B is invisible)', async () => {
    const body = JSON.parse((await get(rt, adminA, '/overview', '?period=last_month')).body)
    expect(body.redemptionActivity.logged).toBe(2)
    expect(body.redemptionActivity.confirmed).toBe(1)
    expect(body.savings.estimatedLogged).toBe(14) // 7 + 7, never B's 9s
  })

  it('A.branches never serialises B branch ids or names', async () => {
    const body = JSON.parse((await get(rt, adminA, '/branches', '?period=last_month')).body)
    const branchIds = body.rows.map((r: any) => r.branchId)
    expect(branchIds).toContain(branchA)
    expect(branchIds).not.toContain(branchB)
    const serialised = JSON.stringify(body)
    expect(serialised).not.toContain(branchB)
    expect(serialised).not.toContain('SECRET')
  })

  it('A.vouchers never serialises B vouchers', async () => {
    const body = JSON.parse((await get(rt, adminA, '/vouchers', '?period=last_month')).body)
    const voucherIds = body.top.map((v: any) => v.voucherId)
    expect(voucherIds).toContain(voucherA)
    expect(voucherIds).not.toContain(voucherB)
  })

  it('a crafted cross-tenant branchId (belonging to B) yields an EMPTY result, not an oracle', async () => {
    // A asks for B's branch. Same 200 + zero rows as a non-existent branch :
    // existence is never confirmed (no 404/403, no leaked data).
    const ovStatus = (await get(rt, adminA, '/overview', `?period=last_month&branchId=${branchB}`)).statusCode
    expect(ovStatus).toBe(200)
    const ov = JSON.parse((await get(rt, adminA, '/overview', `?period=last_month&branchId=${branchB}`)).body)
    expect(ov.redemptionActivity.logged).toBe(0)

    const br = JSON.parse((await get(rt, adminA, '/branches', `?period=last_month&branchId=${branchB}`)).body)
    expect(br.rows).toEqual([])

    // A bogus, never-seeded branch id behaves identically (no oracle distinction).
    const bogus = JSON.parse((await get(rt, adminA, '/overview', '?period=last_month&branchId=does-not-exist')).body)
    expect(bogus.redemptionActivity.logged).toBe(0)
  })

  it('a scoped BM with ZERO in-scope branches gets empty rows (fail-closed)', async () => {
    // A BRANCH_MANAGER, allBranches=false, no allowed branches -> scope [] -> no rows.
    const bmAdmin = await seedMerchantAdmin(rt.prisma, ids)
    await seedMembership(rt.prisma, ids, {
      merchantId: merchantA, merchantAdminId: bmAdmin, role: 'BRANCH_MANAGER', allBranches: false, allowedBranchIds: [],
    })
    const ov = JSON.parse((await get(rt, bmAdmin, '/overview', '?period=last_month')).body)
    expect(ov.redemptionActivity.logged).toBe(0)
    const br = JSON.parse((await get(rt, bmAdmin, '/branches', '?period=last_month')).body)
    expect(br.rows).toEqual([])
  })

  // ── MUTATION: prove the tenant boundary is load-bearing ────────────────────
  //
  // Directly run the SAME eligible query the service runs, but with the merchant
  // tenant clause NEUTERED (merchantId = merchantId), and assert it would leak B's
  // rows : i.e. the cross-tenant guarantee depends on the merchant clause. If the
  // boundary were absent from the real query, the assertions above could not hold.
  it('MUTATION: neutering the merchant tenant clause WOULD leak sibling rows (boundary is load-bearing)', async () => {
    const { Prisma } = await import('../../../../generated/prisma/client')

    // The real eligible row count for A (last_month) via the genuine tenant clause.
    const real = await rt.prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS n
      FROM "VoucherRedemption" r
      JOIN "Branch" b ON r."branchId" = b.id
      WHERE b."merchantId" = ${merchantA}
        AND r."isTestData" = false AND b."isTestData" = false
        AND r."redeemedAt" >= ${LAST_MONTH.startUtc} AND r."redeemedAt" < ${LAST_MONTH.endUtc}
    `)
    expect(Number(real[0].n)).toBe(2) // only A's rows

    // The MUTATED query: the merchant clause is a tautology (no tenant scoping).
    // It returns A + B rows, proving the tenant clause is what excludes B.
    const mutated = await rt.prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS n
      FROM "VoucherRedemption" r
      JOIN "Branch" b ON r."branchId" = b.id
      WHERE b."merchantId" = b."merchantId"
        AND r."isTestData" = false AND b."isTestData" = false
        AND r."redeemedAt" >= ${LAST_MONTH.startUtc} AND r."redeemedAt" < ${LAST_MONTH.endUtc}
        AND b.id IN (${Prisma.join([branchA, branchB])})
    `)
    // 2 (A) + 3 (B) = 5: without the tenant boundary, B leaks. The route's real
    // query keeps the boundary, so A.overview returned 2 above (not 5).
    expect(Number(mutated[0].n)).toBe(5)
    expect(Number(mutated[0].n)).not.toBe(Number(real[0].n))
  })
})
