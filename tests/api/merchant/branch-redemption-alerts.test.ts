import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Branches PR-7 (§7): the per-branch redemption-alerts TOGGLE write authorization.
// Same branch-management WRITE boundary as the PR-4 hours toggle / setAmenities:
// resolveMerchantContext + assertCanManageBranch — OWNER any branch || assigned
// BRANCH_MANAGER; STAFF denied even when assigned; suspended merchant ->
// MERCHANT_SUSPENDED (SEC-M2). Modelled on branch-access-control.test.ts.

const ASSIGNED_BRANCH = 'b-assigned'
const UNASSIGNED_BRANCH = 'b-unassigned'

type Role = 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'

function mockBranch(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, merchantId: 'm1', name: 'Branch', isMainBranch: false,
    addressLine1: '1 Test St', addressLine2: null, city: 'London', postcode: 'EC1A 1BB',
    country: 'GB', phone: '+44111', email: null, websiteUrl: null, isActive: true,
    about: 'about', logoUrl: null, bannerUrl: null, latitude: 51.5, longitude: -0.1,
    localityId: 'loc1', localityName: 'London', redemptionPin: null, deletedAt: null,
    redemptionAlertsEnabled: false,
    openingHours: [], amenities: [], photos: [], pendingEdits: [],
    ...overrides,
  }
}

function membershipRow(role: Role, allBranches: boolean, branchIds: string[], status = 'ACTIVE') {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role,
    allBranches, canManageVouchers: false,
    merchant: { status, businessName: 'Acme' },
    branches: branchIds.map((branchId) => ({ branchId })),
  }
}

async function makeApp(row: ReturnType<typeof membershipRow>) {
  const app = await buildApp()
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      // resolveMerchantContext -> getActiveMembership -> findMany (single active row)
      findMany: vi.fn().mockResolvedValue([row]),
    },
    merchant: {
      findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: row.merchant.status }),
    },
    branch: {
      findFirst: vi.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(mockBranch(where?.id, { merchantId: 'm1' })),
      ),
      update: vi.fn().mockImplementation(({ where, data }: any) =>
        Promise.resolve(mockBranch(where?.id, data)),
      ),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
  app.decorate('prisma', prismaMock as any)
  app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn(), exists: vi.fn().mockResolvedValue(1) } as any)
  await app.ready()
  const token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  return { app, token, prismaMock }
}

function inject(a: FastifyInstance, token: string, branchId: string, payload: unknown) {
  return a.inject({
    method: 'PATCH',
    url: `/api/v1/merchant/branches/${branchId}/redemption-alerts`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  } as any)
}

describe('PR-7 redemption-alerts toggle write authorization', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  const owner = () => membershipRow('OWNER', true, [])
  const bm = (status = 'ACTIVE') => membershipRow('BRANCH_MANAGER', false, [ASSIGNED_BRANCH], status)
  const staff = () => membershipRow('STAFF', false, [ASSIGNED_BRANCH])

  it('OWNER -> toggle ON on ANY branch (200) + branch.update writes redemptionAlertsEnabled:true', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, UNASSIGNED_BRANCH, { enabled: true })
    expect(res.statusCode).toBe(200)
    expect(made.prismaMock.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { redemptionAlertsEnabled: true } }),
    )
    expect(JSON.parse(res.body).redemptionAlertsEnabled).toBe(true)
  })

  it('OWNER -> toggle OFF (200) writes redemptionAlertsEnabled:false', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, ASSIGNED_BRANCH, { enabled: false })
    expect(res.statusCode).toBe(200)
    expect(made.prismaMock.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { redemptionAlertsEnabled: false } }),
    )
  })

  it('BM -> toggle on ASSIGNED branch (200)', async () => {
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, ASSIGNED_BRANCH, { enabled: true })
    expect(res.statusCode).toBe(200)
  })

  it('BM -> toggle on UNASSIGNED branch -> 403 INSUFFICIENT_PERMISSIONS (no branch write)', async () => {
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, UNASSIGNED_BRANCH, { enabled: true })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branch.update).not.toHaveBeenCalled()
  })

  it('STAFF -> toggle on ASSIGNED branch -> 403 INSUFFICIENT_PERMISSIONS (no branch write)', async () => {
    const made = await makeApp(staff()); app = made.app
    const res = await inject(made.app, made.token, ASSIGNED_BRANCH, { enabled: true })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branch.update).not.toHaveBeenCalled()
  })

  it('SUSPENDED merchant (OWNER) -> toggle -> MERCHANT_SUSPENDED (no branch write)', async () => {
    const made = await makeApp(membershipRow('OWNER', true, [], 'SUSPENDED')); app = made.app
    const res = await inject(made.app, made.token, ASSIGNED_BRANCH, { enabled: true })
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
    expect(made.prismaMock.branch.update).not.toHaveBeenCalled()
  })
})
