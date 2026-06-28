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

// Insights PR-A Task A7 BRANCH-SCOPE matrix (real local DB + HTTP).
//
// One merchant, two branches (each with eligible rows). The matrix (plan 2.4):
//   - OWNER, allBranches=true           -> sees BOTH branches;
//   - BRANCH_MANAGER, allBranches=true  -> sees BOTH branches (legit all-branches manager);
//   - scoped BM (allBranches=false, [b1]) -> sees ONLY b1, never b2 (no leak);
//   - empty-specific (scoped BM, allowed branch with NO data) -> empty rows.
// Asserted on /overview + /branches + /export.csv. A scoped BM never serialises a
// sibling branch's id/name.

const NOW = new Date()
const LAST_MONTH = periodWindow('last_month', NOW)
const IN_LAST_MONTH = new Date(LAST_MONTH.startUtc!.getTime() + 6 * 24 * 60 * 60 * 1000)

const get = (rt: RouteApp, adminId: string, path: string, query = '') =>
  rt.app.inject({ method: 'GET', url: `${INSIGHTS_PREFIX}${path}${query}`, headers: rt.authHeader(adminId) })

describe('Insights routes : branch-scope matrix (real local DB + HTTP)', () => {
  let rt: RouteApp
  let ids: FixtureIds

  let merchantId: string
  let branch1: string
  let branch2: string
  let branchEmpty: string // a third branch with NO eligible rows
  let voucher: string

  let ownerAdmin: string
  let allBranchesBmAdmin: string
  let scopedBmAdmin: string
  let emptyScopeBmAdmin: string

  beforeAll(async () => {
    rt = await buildRouteApp()
    ids = newFixtureIds()

    merchantId = await seedMerchant(rt.prisma, ids, { businessName: 'Scope Co' })
    branch1 = await seedBranch(rt.prisma, ids, merchantId, { name: 'Branch One' })
    branch2 = await seedBranch(rt.prisma, ids, merchantId, { name: 'Branch Two SIBLING' })
    branchEmpty = await seedBranch(rt.prisma, ids, merchantId, { name: 'Branch Empty' })
    voucher = await seedVoucher(rt.prisma, ids, merchantId, { type: 'BOGO', estimatedSaving: 5 })

    ownerAdmin = await seedMerchantAdmin(rt.prisma, ids)
    await seedMembership(rt.prisma, ids, { merchantId, merchantAdminId: ownerAdmin, role: 'OWNER', allBranches: true })

    allBranchesBmAdmin = await seedMerchantAdmin(rt.prisma, ids)
    await seedMembership(rt.prisma, ids, { merchantId, merchantAdminId: allBranchesBmAdmin, role: 'BRANCH_MANAGER', allBranches: true })

    scopedBmAdmin = await seedMerchantAdmin(rt.prisma, ids)
    await seedMembership(rt.prisma, ids, { merchantId, merchantAdminId: scopedBmAdmin, role: 'BRANCH_MANAGER', allBranches: false, allowedBranchIds: [branch1] })

    emptyScopeBmAdmin = await seedMerchantAdmin(rt.prisma, ids)
    await seedMembership(rt.prisma, ids, { merchantId, merchantAdminId: emptyScopeBmAdmin, role: 'BRANCH_MANAGER', allBranches: false, allowedBranchIds: [branchEmpty] })

    const u1 = await seedUser(rt.prisma, ids)
    const u2 = await seedUser(rt.prisma, ids)

    // branch1: 2 logged; branch2: 1 logged; branchEmpty: 0.
    await seedRedemption(rt.prisma, ids, { userId: u1, voucherId: voucher, branchId: branch1, redeemedAt: IN_LAST_MONTH, isValidated: true, validatedAt: IN_LAST_MONTH, validationMethod: 'PIN', estimatedSaving: 5 })
    await seedRedemption(rt.prisma, ids, { userId: u2, voucherId: voucher, branchId: branch1, redeemedAt: IN_LAST_MONTH, isValidated: false, estimatedSaving: 5 })
    await seedRedemption(rt.prisma, ids, { userId: u2, voucherId: voucher, branchId: branch2, redeemedAt: IN_LAST_MONTH, isValidated: true, validatedAt: IN_LAST_MONTH, validationMethod: 'PIN', estimatedSaving: 5 })
  })

  afterAll(async () => {
    await cleanup(rt.prisma, ids)
    await rt.app.close()
    await rt.prisma.$disconnect()
  })

  it('OWNER (allBranches=true) sees BOTH branches', async () => {
    const ov = JSON.parse((await get(rt, ownerAdmin, '/overview', '?period=last_month')).body)
    expect(ov.redemptionActivity.logged).toBe(3)
    const br = JSON.parse((await get(rt, ownerAdmin, '/branches', '?period=last_month')).body)
    expect(br.rows.map((r: any) => r.branchId).sort()).toEqual([branch1, branch2].sort())
  })

  it('all-branches BRANCH_MANAGER (allBranches=true, allowed=[]) sees BOTH branches', async () => {
    const ov = JSON.parse((await get(rt, allBranchesBmAdmin, '/overview', '?period=last_month')).body)
    expect(ov.redemptionActivity.logged).toBe(3)
    const br = JSON.parse((await get(rt, allBranchesBmAdmin, '/branches', '?period=last_month')).body)
    expect(br.rows.map((r: any) => r.branchId).sort()).toEqual([branch1, branch2].sort())
  })

  it('scoped BM (allowed=[branch1]) sees ONLY branch1, never the sibling branch2', async () => {
    const ov = JSON.parse((await get(rt, scopedBmAdmin, '/overview', '?period=last_month')).body)
    expect(ov.redemptionActivity.logged).toBe(2) // only branch1's two rows

    const br = JSON.parse((await get(rt, scopedBmAdmin, '/branches', '?period=last_month')).body)
    expect(br.rows.map((r: any) => r.branchId)).toEqual([branch1])
    const serialised = JSON.stringify(br)
    expect(serialised).not.toContain(branch2)
    expect(serialised).not.toContain('SIBLING')
  })

  it('scoped BM cannot widen to a sibling branch via an out-of-scope branchId param (empty, not leak)', async () => {
    // scopedBmAdmin asks for branch2 (outside its allowed set) -> intersect to [] -> no rows.
    const ov = JSON.parse((await get(rt, scopedBmAdmin, '/overview', `?period=last_month&branchId=${branch2}`)).body)
    expect(ov.redemptionActivity.logged).toBe(0)
    const br = JSON.parse((await get(rt, scopedBmAdmin, '/branches', `?period=last_month&branchId=${branch2}`)).body)
    expect(br.rows).toEqual([])
  })

  it('empty-specific (scoped BM on a branch with NO data) gets empty rows', async () => {
    const ov = JSON.parse((await get(rt, emptyScopeBmAdmin, '/overview', '?period=last_month')).body)
    expect(ov.redemptionActivity.logged).toBe(0)
    const br = JSON.parse((await get(rt, emptyScopeBmAdmin, '/branches', '?period=last_month')).body)
    expect(br.rows).toEqual([])
  })

  it('export.csv respects scope authz (a scoped BM is authorized; gate-closed -> not-available)', async () => {
    // The export route runs the SAME authz chain before the gate check; a scoped
    // BM is authorized and (gate closed) gets the typed not-available payload.
    const res = await get(rt, scopedBmAdmin, '/export.csv', '?period=last_month')
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ available: false })
  })
})
