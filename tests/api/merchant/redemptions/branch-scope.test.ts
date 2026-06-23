import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Staff & Access PR-B (B5, §4.3 SCOPED-READ): merchant-redemptions list / lookup /
// export.csv intersect the requested branchId with the caller's allowed-branch set.
//   - OWNER / allBranches      -> no restriction (all branches).
//   - scoped member, no branchId -> branchId IN allowedBranchIds.
//   - scoped member, branchId in set    -> that single branch.
//   - scoped member, branchId NOT in set -> branchId IN [] (empty, denied, never leaked).
//
// The route resolves role + branch scope via resolveMerchantContext
// (getActiveMembership -> merchantMembership.findMany); the service builds the where
// off ctx.allowedBranchIds. These tests pin the where (the security boundary) for
// scoped vs owner callers.

function scopedRow() {
  return {
    id: 'mm-bm', merchantId: 'm1', merchantAdminId: 'ma1', role: 'BRANCH_MANAGER',
    allBranches: false, canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [{ branchId: 'b1' }],
  }
}
function ownerRow() {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER',
    allBranches: true, canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
  }
}

function redemptionRow(branchId: string) {
  return {
    id: 'r1', redemptionCode: 'A7K2P9X4', redeemedAt: new Date('2026-06-21T10:00:00.000Z'),
    isValidated: false, validatedAt: null, validationMethod: null, estimatedSaving: 5,
    voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO', merchantId: 'm1' },
    branch: { id: branchId, name: 'Branch ' + branchId }, user: { firstName: 'Sarah', lastName: 'Khan' },
    validatedBy: null,
  }
}

async function makeApp(membershipRows: any[]) {
  const app = await buildApp()
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(membershipRows),
    },
    voucherRedemption: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
  }
  app.decorate('prisma', prismaMock as any)
  app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
  await app.ready()
  const token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  return { app, token, prismaMock }
}

describe('merchant redemptions branch-scope intersect (B5 SCOPED-READ)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  function get(a: FastifyInstance, token: string, url: string) {
    return a.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } })
  }

  it('LIST scoped member, no branchId -> where.branchId = { in: allowedBranchIds }', async () => {
    const made = await makeApp([scopedRow()]); app = made.app
    const res = await get(made.app, made.token, '/api/v1/merchant/redemptions')
    expect(res.statusCode).toBe(200)
    const where = (made.prismaMock.voucherRedemption.findMany as any).mock.calls[0][0].where
    expect(where.branch).toEqual({ merchantId: 'm1' })
    expect(where.branchId).toEqual({ in: ['b1'] })
  })

  it('LIST scoped member requesting an ALLOWED branchId -> filters to that branch', async () => {
    const made = await makeApp([scopedRow()]); app = made.app
    await get(made.app, made.token, '/api/v1/merchant/redemptions?branchId=b1')
    const where = (made.prismaMock.voucherRedemption.findMany as any).mock.calls[0][0].where
    expect(where.branchId).toBe('b1')
  })

  it('LIST scoped member requesting a NON-allowed branchId -> branchId { in: [] } (empty, denied)', async () => {
    const made = await makeApp([scopedRow()]); app = made.app
    await get(made.app, made.token, '/api/v1/merchant/redemptions?branchId=b2')
    const where = (made.prismaMock.voucherRedemption.findMany as any).mock.calls[0][0].where
    expect(where.branchId).toEqual({ in: [] })
  })

  it('LIST owner -> no branch restriction (client branchId honoured, branch.merchantId still pins the tenant)', async () => {
    const made = await makeApp([ownerRow()]); app = made.app
    await get(made.app, made.token, '/api/v1/merchant/redemptions?branchId=any-branch')
    const where = (made.prismaMock.voucherRedemption.findMany as any).mock.calls[0][0].where
    expect(where.branch).toEqual({ merchantId: 'm1' })
    expect(where.branchId).toBe('any-branch')
  })

  it('EXPORT scoped member, no branchId -> where.branchId = { in: allowedBranchIds }', async () => {
    const made = await makeApp([scopedRow()]); app = made.app
    await get(made.app, made.token, '/api/v1/merchant/redemptions/export.csv')
    const where = (made.prismaMock.voucherRedemption.findMany as any).mock.calls[0][0].where
    expect(where.branchId).toEqual({ in: ['b1'] })
  })

  it('LOOKUP scoped member, code from an ALLOWED branch -> returns the row', async () => {
    const made = await makeApp([scopedRow()]); app = made.app
    made.prismaMock.voucherRedemption.findUnique = vi.fn().mockResolvedValue(redemptionRow('b1'))
    const res = await get(made.app, made.token, '/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).branch.id).toBe('b1')
  })

  it("LOOKUP scoped member, code from a NON-allowed branch -> masked REDEMPTION_NOT_FOUND", async () => {
    const made = await makeApp([scopedRow()]); app = made.app
    made.prismaMock.voucherRedemption.findUnique = vi.fn().mockResolvedValue(redemptionRow('b2'))
    const res = await get(made.app, made.token, '/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('REDEMPTION_NOT_FOUND')
  })

  it('LOOKUP owner, code from any branch -> returns the row (no branch restriction)', async () => {
    const made = await makeApp([ownerRow()]); app = made.app
    made.prismaMock.voucherRedemption.findUnique = vi.fn().mockResolvedValue(redemptionRow('b9'))
    const res = await get(made.app, made.token, '/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).branch.id).toBe('b9')
  })
})
