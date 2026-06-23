import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Mock issueMerchantClaim so invite/resend routes don't touch Redis claim minting.
vi.mock('../../../src/api/auth/merchant/service', async (orig) => {
  const actual = await (orig as any)()
  return { ...actual, issueMerchantClaim: vi.fn().mockResolvedValue(undefined) }
})

// An OWNER membership row used by BOTH resolvers:
//  - getOwnerMembership (findFirst, role:OWNER) for resolveAdminMerchant (service)
//  - getActiveMembership (findMany) for resolveMerchantContext (route assertOwner)
const ownerMembershipRow = {
  id: 'owner-mm', merchantId: 'm1', merchantAdminId: 'ma1',
  role: 'OWNER', allBranches: true, canManageVouchers: false,
  merchant: { status: 'ACTIVE', businessName: 'X' },
  branches: [],
}

// A non-owner (BRANCH_MANAGER) active membership for the 403 pins. getOwnerMembership
// (role:OWNER findFirst) returns null for this person -> resolveAdminMerchant would
// throw, but assertOwner on resolveMerchantContext fires FIRST in the route handler.
const branchManagerRow = {
  id: 'bm-mm', merchantId: 'm1', merchantAdminId: 'ma1',
  role: 'BRANCH_MANAGER', allBranches: false, canManageVouchers: false,
  merchant: { status: 'ACTIVE', businessName: 'X' },
  branches: [{ branchId: 'b1' }],
}

function decorate(app: FastifyInstance, opts: { role: 'OWNER' | 'BRANCH_MANAGER' } = { role: 'OWNER' }) {
  const activeRow = opts.role === 'OWNER' ? ownerMembershipRow : branchManagerRow
  app.decorate('prisma', {
    merchantAdmin: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'new-admin' }),
      update: vi.fn().mockResolvedValue({}),
    },
    merchantMembership: {
      // resolveMerchantContext -> getActiveMembership -> findMany (single active row)
      findMany: vi.fn().mockResolvedValue([activeRow]),
      // resolveAdminMerchant -> getOwnerMembership -> findFirst (OWNER only)
      findFirst: vi.fn().mockResolvedValue(opts.role === 'OWNER' ? ownerMembershipRow : null),
      findUnique: vi.fn().mockResolvedValue({
        id: 'mm-target', merchantId: 'm1', merchantAdminId: 'target-admin',
        role: 'STAFF', status: 'ACTIVE', allBranches: true, canManageVouchers: false,
        merchantAdmin: { id: 'target-admin', email: 't@x.com', passwordHash: null, firstName: 'T', lastName: 'X' },
      }),
      create: vi.fn().mockResolvedValue({ id: 'new-mm' }),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(2),
    },
    merchantMembershipBranch: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    branch: {
      findMany: vi.fn().mockResolvedValue([{ id: 'b1', name: 'Main' }]),
    },
    branchUser: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  } as any)
  ;(app as any).prisma.$transaction = vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma))
  app.decorate('redis', {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(1),
  } as any)
}

function sign(app: FastifyInstance): string {
  const jwtAny = app.jwt as any
  return jwtAny.merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
}

describe('merchant staff routes — OWNER caller', () => {
  let app: FastifyInstance
  let token: string

  beforeEach(async () => {
    app = await buildApp()
    decorate(app, { role: 'OWNER' })
    await app.ready()
    token = sign(app)
  })
  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/staff returns 200 with members and NO passwordHash', async () => {
    app.prisma.merchantMembership.findMany = vi.fn()
      // first call: resolveMerchantContext (active membership)
      .mockResolvedValueOnce([ownerMembershipRow])
      // second call: listMembers
      .mockResolvedValueOnce([
        {
          id: 'mm1', role: 'OWNER', status: 'ACTIVE', canManageVouchers: false, allBranches: true,
          merchantAdmin: { id: 'a1', firstName: 'Owner', lastName: 'One', email: 'o@x.com', passwordHash: 'SECRET', lastLoginAt: null },
          branches: [],
        },
      ])

    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/staff', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('passwordHash')
    expect(res.body).not.toContain('SECRET')
    const body = JSON.parse(res.body)
    expect(Array.isArray(body.members)).toBe(true)
    expect(body.members[0].id).toBe('mm1')
  })

  it('GET /api/v1/merchant/staff/app-users returns 200 with the locked shape and NO passwordHash', async () => {
    app.prisma.branch.findMany = vi.fn().mockResolvedValue([{ id: 'b1', name: 'Main' }])
    app.prisma.branchUser.findMany = vi.fn().mockResolvedValue([
      { id: 'u1', branchId: 'b1', firstName: 'A', lastName: 'B', jobTitle: null, email: 'a@x.com', status: 'ACTIVE', lastLoginAt: null },
    ])

    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/staff/app-users', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('passwordHash')
    const body = JSON.parse(res.body)
    expect(body.branches[0]).toMatchObject({ branchId: 'b1', branchName: 'Main', appUserCount: 1 })
    expect(body.branches[0].users[0]).toMatchObject({ id: 'u1', branchId: 'b1', email: 'a@x.com', status: 'ACTIVE' })
  })

  it('POST /api/v1/merchant/staff invites a member (2xx)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/staff', headers: { authorization: `Bearer ${token}` },
      payload: { email: 'new@x.com', firstName: 'New', lastName: 'Member', role: 'STAFF', allBranches: true },
    })
    expect([200, 201]).toContain(res.statusCode)
    const body = JSON.parse(res.body)
    expect(body.inviteDelivery).toBe('EMAIL_DARK')
    expect(res.body).not.toMatch(/token/i)
  })

  it('PATCH /api/v1/merchant/staff/:id updates access (200)', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/staff/mm-target', headers: { authorization: `Bearer ${token}` },
      payload: { role: 'STAFF', allBranches: true },
    })
    expect(res.statusCode).toBe(200)
  })

  it('POST /api/v1/merchant/staff/:id/deactivate (200)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/staff/mm-target/deactivate', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
  })

  it('POST /api/v1/merchant/staff/:id/reactivate (200)', async () => {
    // FIX C (P2): reactivate applies ONLY to an INACTIVE member. The shared target
    // double is ACTIVE, so override the target lookup to INACTIVE for this route test.
    app.prisma.merchantMembership.findUnique = vi.fn().mockResolvedValue({
      id: 'mm-target', merchantId: 'm1', merchantAdminId: 'target-admin',
      role: 'STAFF', status: 'INACTIVE', allBranches: true, canManageVouchers: false,
      merchantAdmin: { id: 'target-admin', email: 't@x.com', passwordHash: null, firstName: 'T', lastName: 'X' },
    })
    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/staff/mm-target/reactivate', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
  })

  it('DELETE /api/v1/merchant/staff/:id removes a member (200)', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/merchant/staff/mm-target', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
  })

  it('POST /api/v1/merchant/staff/:id/resend-invite (200, EMAIL_DARK)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/staff/mm-target/resend-invite', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).inviteDelivery).toBe('EMAIL_DARK')
  })

  it('returns 401 without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/staff' })
    expect(res.statusCode).toBe(401)
  })
})

describe('merchant staff routes — non-owner (BRANCH_MANAGER) caller -> 403 on every route', () => {
  let app: FastifyInstance
  let token: string

  beforeEach(async () => {
    app = await buildApp()
    decorate(app, { role: 'BRANCH_MANAGER' })
    await app.ready()
    token = sign(app)
  })
  afterEach(async () => { await app.close() })

  const cases: Array<{ method: any; url: string; payload?: any }> = [
    { method: 'GET', url: '/api/v1/merchant/staff' },
    { method: 'GET', url: '/api/v1/merchant/staff/app-users' },
    { method: 'POST', url: '/api/v1/merchant/staff', payload: { email: 'x@x.com', firstName: 'A', lastName: 'B', role: 'STAFF', allBranches: true } },
    { method: 'PATCH', url: '/api/v1/merchant/staff/mm-target', payload: { role: 'STAFF', allBranches: true } },
    { method: 'POST', url: '/api/v1/merchant/staff/mm-target/deactivate' },
    { method: 'POST', url: '/api/v1/merchant/staff/mm-target/reactivate' },
    { method: 'DELETE', url: '/api/v1/merchant/staff/mm-target' },
    { method: 'POST', url: '/api/v1/merchant/staff/mm-target/resend-invite' },
  ]

  for (const c of cases) {
    it(`${c.method} ${c.url} -> 403 INSUFFICIENT_PERMISSIONS`, async () => {
      const res = await app.inject({ method: c.method, url: c.url, headers: { authorization: `Bearer ${token}` }, ...(c.payload ? { payload: c.payload } : {}) })
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    })
  }
})
