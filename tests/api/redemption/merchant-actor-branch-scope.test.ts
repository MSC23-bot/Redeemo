import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// Staff & Access PR-B (B6, §4.3 † routes): the two resolver-bypassing redemption
// routes (POST /redemption/verify + GET /branch/:branchId/redemptions) authorize off
// the cached authMerchant session, NOT resolveAdminMerchant. For a MERCHANT actor we
// now resolve role + branch scope via resolveMerchantContext and assertBranchAllowed
// BEFORE acting, so a scoped non-owner cannot validate / read a code at a branch
// outside their allowed set. The BRANCH-actor (BranchUser) path is UNCHANGED.
//
// These are the highest-value IDOR pins of the milestone.

const MERCHANT_ID = 'm1'

function scopedMembership() {
  return {
    id: 'mm-bm', merchantId: MERCHANT_ID, merchantAdminId: 'ma1', role: 'BRANCH_MANAGER',
    allBranches: false, canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [{ branchId: 'b1' }],
  }
}
function ownerMembership() {
  return {
    id: 'mm-owner', merchantId: MERCHANT_ID, merchantAdminId: 'ma1', role: 'OWNER',
    allBranches: true, canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
  }
}

function redemptionAtBranch(branchId: string) {
  return {
    id: 'r1', branchId, isValidated: false, userId: 'cust1',
    voucher: { merchantId: MERCHANT_ID, merchant: { status: 'ACTIVE' } },
    branch: { isActive: true },
    user: { firstName: 'Jane', lastName: 'Doe' },
  }
}

async function makeApp(membershipRows: any[]) {
  const app = await buildApp()
  const prismaMock: any = {
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(membershipRows),
    },
    voucherRedemption: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({ id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'MANUAL' }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    branch: { findUnique: vi.fn().mockResolvedValue({ merchantId: MERCHANT_ID, merchant: { status: 'ACTIVE' } }) },
  }
  app.decorate('prisma', prismaMock as any)
  // The authMerchant session (cached at login) — what the † routes read off Redis.
  const redisMock: any = {
    get: vi.fn().mockImplementation(async (key: string) => {
      if (key === RedisKey.authMerchant('ma1')) {
        return JSON.stringify({ merchantId: MERCHANT_ID, isSuspended: false, approvalStatus: 'APPROVED' })
      }
      return null
    }),
    exists: vi.fn().mockResolvedValue(1),
  }
  app.decorate('redis', redisMock as any)
  await app.ready()
  const token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  return { app, token, prismaMock }
}

describe('† POST /redemption/verify (merchant actor) branch-scope guard (B6)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  function verify(a: FastifyInstance, token: string) {
    return a.inject({
      method: 'POST', url: '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${token}` },
      payload: { code: 'A7K2P9X4', method: 'MANUAL' },
    })
  }

  it('scoped member validating a code at an ALLOWED branch -> 200, row validated', async () => {
    const made = await makeApp([scopedMembership()]); app = made.app
    made.prismaMock.voucherRedemption.findUnique = vi.fn().mockResolvedValue(redemptionAtBranch('b1'))
    const res = await verify(made.app, made.token)
    expect(res.statusCode).toBe(200)
    expect(made.prismaMock.voucherRedemption.update).toHaveBeenCalled()
  })

  it('scoped member validating a code at a NON-allowed branch -> denied, no validation write', async () => {
    const made = await makeApp([scopedMembership()]); app = made.app
    made.prismaMock.voucherRedemption.findUnique = vi.fn().mockResolvedValue(redemptionAtBranch('b2'))
    const res = await verify(made.app, made.token)
    expect(res.statusCode).not.toBe(200)
    // Denied via a branch-access / permission code; never a successful validation.
    expect(['BRANCH_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS', 'REDEMPTION_NOT_FOUND']).toContain(JSON.parse(res.body).error.code)
    expect(made.prismaMock.voucherRedemption.update).not.toHaveBeenCalled()
  })

  it('OWNER (allBranches) validating a code at any branch -> 200', async () => {
    const made = await makeApp([ownerMembership()]); app = made.app
    made.prismaMock.voucherRedemption.findUnique = vi.fn().mockResolvedValue(redemptionAtBranch('b9'))
    const res = await verify(made.app, made.token)
    expect(res.statusCode).toBe(200)
    expect(made.prismaMock.voucherRedemption.update).toHaveBeenCalled()
  })
})

describe('† GET /branch/:branchId/redemptions (merchant actor) branch-scope guard (B6)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  function list(a: FastifyInstance, token: string, branchId: string) {
    return a.inject({
      method: 'GET', url: `/api/v1/branch/${branchId}/redemptions`,
      headers: { authorization: `Bearer ${token}` },
    })
  }

  it('scoped member reading an ALLOWED branch -> 200', async () => {
    const made = await makeApp([scopedMembership()]); app = made.app
    const res = await list(made.app, made.token, 'b1')
    expect(res.statusCode).toBe(200)
  })

  it('scoped member reading a NON-allowed branch -> denied, no list read', async () => {
    const made = await makeApp([scopedMembership()]); app = made.app
    const res = await list(made.app, made.token, 'b2')
    expect(res.statusCode).not.toBe(200)
    expect(['BRANCH_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS']).toContain(JSON.parse(res.body).error.code)
    expect(made.prismaMock.voucherRedemption.findMany).not.toHaveBeenCalled()
  })

  it('OWNER (allBranches) reading any branch -> 200', async () => {
    const made = await makeApp([ownerMembership()]); app = made.app
    const res = await list(made.app, made.token, 'b9')
    expect(res.statusCode).toBe(200)
  })
})

// The BRANCH-actor (BranchUser) path is UNCHANGED — no resolveMerchantContext, no
// membership lookup. This pins that the branch-actor verify still works off the
// authBranch session alone (a scoped-merchant guard must NOT leak into it).
describe('† branch-actor path unchanged (B6 regression guard)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  it('BranchUser validating a code at their own branch -> 200, NO membership resolve', async () => {
    const app2 = await buildApp()
    const prismaMock: any = {
      merchantMembership: { findFirst: vi.fn(), findMany: vi.fn() },
      voucherRedemption: {
        findUnique: vi.fn().mockResolvedValue(redemptionAtBranch('b1')),
        update: vi.fn().mockResolvedValue({ id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'MANUAL' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    app2.decorate('prisma', prismaMock as any)
    app2.decorate('redis', {
      get: vi.fn().mockImplementation(async (key: string) => {
        if (key === RedisKey.authBranch('bu1')) return JSON.stringify({ branchId: 'b1', merchantId: MERCHANT_ID, isActive: true })
        return null
      }),
      exists: vi.fn().mockResolvedValue(1),
    } as any)
    await app2.ready()
    app = app2
    const branchToken = (app2.jwt as any).branch.sign({ sub: 'bu1', role: 'branch_staff', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
    const res = await app2.inject({
      method: 'POST', url: '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${branchToken}` },
      payload: { code: 'A7K2P9X4', method: 'MANUAL' },
    })
    expect(res.statusCode).toBe(200)
    // Branch-actor path must NOT resolve a merchant membership (no scoped-merchant guard).
    expect(prismaMock.merchantMembership.findMany).not.toHaveBeenCalled()
  })
})
