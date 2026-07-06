import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Staff & Access PR-B (B5):
//   - GET /merchant/branches  (SCOPED-READ): scoped member sees only allowedBranchIds;
//     owner / allBranches sees all.
//   - GET /merchant/branches/:id (SCOPED-READ): assertBranchAllowed denies an
//     out-of-scope branch (INSUFFICIENT_PERMISSIONS), allows an in-scope one.
//   - GET /merchant/profile   (MEMBER-READ): any active role can read business info.

type Role = 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'

function membershipRow(role: Role, allBranches: boolean, branchIds: string[]) {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role,
    allBranches, canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'Acme' },
    branches: branchIds.map((branchId) => ({ branchId })),
  }
}

async function makeApp(row: any) {
  const app = await buildApp()
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([row]),
    },
    branch: {
      findMany: vi.fn().mockResolvedValue([{ id: 'b1', name: 'Main', openingHours: [], amenities: [], photos: [], pendingEdits: [] }]),
      findFirst: vi.fn().mockResolvedValue({ id: 'b1', name: 'Main', merchantId: 'm1', openingHours: [], amenities: [], photos: [], pendingEdits: [] }),
    },
    merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', businessName: 'Acme', pendingEdits: [] }) },
    // Business Profile M1: getMerchantProfile additionally resolves the OWNER
    // contact + signed agreement (both additive, both default to absent here).
    merchantContract: { findUnique: vi.fn().mockResolvedValue(null) },
  }
  app.decorate('prisma', prismaMock as any)
  app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
  await app.ready()
  const token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  return { app, token, prismaMock }
}

describe('branch read scope + profile MEMBER-READ (B5)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  function get(a: FastifyInstance, token: string, url: string) {
    return a.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } })
  }

  it('LIST owner -> no branch filter (all branches)', async () => {
    const made = await makeApp(membershipRow('OWNER', true, [])); app = made.app
    const res = await get(made.app, made.token, '/api/v1/merchant/branches')
    expect(res.statusCode).toBe(200)
    const where = (made.prismaMock.branch.findMany as any).mock.calls[0][0].where
    expect(where).toEqual({ merchantId: 'm1', deletedAt: null })
  })

  it('LIST scoped member -> where filters to id IN allowedBranchIds', async () => {
    const made = await makeApp(membershipRow('BRANCH_MANAGER', false, ['b1'])); app = made.app
    const res = await get(made.app, made.token, '/api/v1/merchant/branches')
    expect(res.statusCode).toBe(200)
    const where = (made.prismaMock.branch.findMany as any).mock.calls[0][0].where
    expect(where).toMatchObject({ merchantId: 'm1', deletedAt: null, id: { in: ['b1'] } })
  })

  it('GET /branches/:id in-scope -> 200', async () => {
    const made = await makeApp(membershipRow('BRANCH_MANAGER', false, ['b1'])); app = made.app
    const res = await get(made.app, made.token, '/api/v1/merchant/branches/b1')
    expect(res.statusCode).toBe(200)
  })

  it('GET /branches/:id out-of-scope -> 403 INSUFFICIENT_PERMISSIONS (assertBranchAllowed), no branch read', async () => {
    const made = await makeApp(membershipRow('BRANCH_MANAGER', false, ['b1'])); app = made.app
    const res = await get(made.app, made.token, '/api/v1/merchant/branches/b2')
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branch.findFirst).not.toHaveBeenCalled()
  })

  it('GET /branches/:id owner (allBranches) any branch -> 200', async () => {
    const made = await makeApp(membershipRow('OWNER', true, [])); app = made.app
    const res = await get(made.app, made.token, '/api/v1/merchant/branches/anything')
    expect(res.statusCode).toBe(200)
  })

  const profileRoles: Array<{ role: Role; allBranches: boolean; ids: string[] }> = [
    { role: 'OWNER', allBranches: true, ids: [] },
    { role: 'BRANCH_MANAGER', allBranches: false, ids: ['b1'] },
    { role: 'STAFF', allBranches: false, ids: ['b1'] },
  ]
  for (const { role, allBranches, ids } of profileRoles) {
    it(`GET /merchant/profile MEMBER-READ allowed for ${role} (200)`, async () => {
      const made = await makeApp(membershipRow(role, allBranches, ids)); app = made.app
      const res = await get(made.app, made.token, '/api/v1/merchant/profile')
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toMatchObject({ id: 'm1', businessName: 'Acme' })
    })
  }
})
