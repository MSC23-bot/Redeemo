import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  newFixtureIds,
  seedMerchant,
  seedBranch,
  seedMerchantAdmin,
  seedMembership,
  cleanup,
  type FixtureIds,
} from './_helpers/testDb'
import {
  buildRouteApp,
  type RouteApp,
  INSIGHTS_PREFIX,
  INSIGHTS_ENDPOINTS,
  EXPORT_ENDPOINT,
} from './_helpers/routeApp'

// Insights PR-A Task A7 LIFECYCLE + STAFF + session (real local DB + HTTP).
//
// LIFECYCLE (plan 2.4 / SEC-M2): only Merchant.status === 'ACTIVE' may read.
//   - ACTIVE                                   -> 200 (data path);
//   - REGISTERED/PENDING_APPROVAL/INACTIVE/DELETED -> 403 MERCHANT_NOT_ACTIVE
//     (from assertMerchantActive : blocked server-side, not just UI-hidden);
//   - SUSPENDED                                -> 403 MERCHANT_SUSPENDED
//     (from resolveMerchantContext, before assertMerchantActive).
// STAFF -> 403 INSUFFICIENT_PERMISSIONS on EVERY endpoint (server-side deny).
// SESSION -> a revoked session is rejected at the authenticateMerchant decorator.

const get = (rt: RouteApp, adminId: string, path: string) =>
  rt.app.inject({ method: 'GET', url: `${INSIGHTS_PREFIX}${path}?period=last_month`, headers: rt.authHeader(adminId) })

describe('Insights routes : lifecycle + staff + session (real local DB + HTTP)', () => {
  let rt: RouteApp
  let ids: FixtureIds

  beforeAll(async () => {
    rt = await buildRouteApp()
    ids = newFixtureIds()
  })

  afterAll(async () => {
    await cleanup(rt.prisma, ids)
    await rt.app.close()
    await rt.prisma.$disconnect()
  })

  /** Seed an OWNER admin for a merchant with the given lifecycle status. */
  async function seedOwnerForStatus(status: 'ACTIVE' | 'REGISTERED' | 'PENDING_APPROVAL' | 'INACTIVE' | 'SUSPENDED' | 'DELETED') {
    const merchantId = await seedMerchant(rt.prisma, ids, { status, businessName: `Lifecycle ${status}` })
    await seedBranch(rt.prisma, ids, merchantId, { name: `${status} Branch` })
    const adminId = await seedMerchantAdmin(rt.prisma, ids)
    await seedMembership(rt.prisma, ids, { merchantId, merchantAdminId: adminId, role: 'OWNER', allBranches: true })
    return adminId
  }

  it('ACTIVE merchant -> 200 on /overview', async () => {
    const adminId = await seedOwnerForStatus('ACTIVE')
    const res = await get(rt, adminId, '/overview')
    expect(res.statusCode).toBe(200)
  })

  for (const status of ['REGISTERED', 'PENDING_APPROVAL', 'INACTIVE', 'DELETED'] as const) {
    it(`${status} merchant -> 403 MERCHANT_NOT_ACTIVE on /overview`, async () => {
      const adminId = await seedOwnerForStatus(status)
      const res = await get(rt, adminId, '/overview')
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('MERCHANT_NOT_ACTIVE')
    })
  }

  it('SUSPENDED merchant -> 403 MERCHANT_SUSPENDED (blocked at resolveMerchantContext)', async () => {
    const adminId = await seedOwnerForStatus('SUSPENDED')
    const res = await get(rt, adminId, '/overview')
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
  })

  it('the lifecycle gate applies to EVERY endpoint, not just /overview (INACTIVE -> MERCHANT_NOT_ACTIVE everywhere)', async () => {
    const adminId = await seedOwnerForStatus('INACTIVE')
    for (const path of [...INSIGHTS_ENDPOINTS, EXPORT_ENDPOINT]) {
      const res = await get(rt, adminId, path)
      expect(res.statusCode, `path ${path}`).toBe(403)
      expect(JSON.parse(res.body).error.code, `path ${path}`).toBe('MERCHANT_NOT_ACTIVE')
    }
  })

  it('STAFF -> 403 INSUFFICIENT_PERMISSIONS on EVERY endpoint (incl. export)', async () => {
    const merchantId = await seedMerchant(rt.prisma, ids, { status: 'ACTIVE', businessName: 'Staff Co' })
    await seedBranch(rt.prisma, ids, merchantId, { name: 'Staff Branch' })
    const staffAdmin = await seedMerchantAdmin(rt.prisma, ids)
    await seedMembership(rt.prisma, ids, { merchantId, merchantAdminId: staffAdmin, role: 'STAFF', allBranches: false, allowedBranchIds: [] })

    for (const path of [...INSIGHTS_ENDPOINTS, EXPORT_ENDPOINT]) {
      const res = await get(rt, staffAdmin, path)
      expect(res.statusCode, `path ${path}`).toBe(403)
      expect(JSON.parse(res.body).error.code, `path ${path}`).toBe('INSUFFICIENT_PERMISSIONS')
    }
  })

  it('a revoked session is rejected at the authenticateMerchant decorator (401 SESSION_REVOKED)', async () => {
    const adminId = await seedOwnerForStatus('ACTIVE')
    rt.setSessionLive(false) // redis.exists -> 0 (session gone)
    try {
      const res = await get(rt, adminId, '/overview')
      expect(res.statusCode).toBe(401)
      expect(JSON.parse(res.body).error.code).toBe('SESSION_REVOKED')
    } finally {
      rt.setSessionLive(true)
    }
  })
})
