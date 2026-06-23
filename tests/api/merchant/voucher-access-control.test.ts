import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Staff & Access PR-B (B5, spec §5.1.1): the four-case voucher-write protection
// matrix against POST /merchant/vouchers (the representative write), plus the
// MEMBER-READ allow for all four roles, plus the body-cannot-self-grant pin.
//
// The voucher service now resolves via `resolveMerchantContext` (getActiveMembership
// -> merchantMembership.findMany) for BOTH reads + writes; writes additionally call
// assertCanManageVouchers(ctx). The resolved membership (never the request body) is
// the sole source of role + canManageVouchers.

const mockVoucher = {
  id: 'v1', merchantId: 'm1', code: 'RCV-ABC12345', isRmv: false,
  type: 'DISCOUNT_PERCENT', title: '10% off', description: null, terms: null,
  imageUrl: null, estimatedSaving: 5.0, expiryDate: null, status: 'DRAFT',
  approvalStatus: 'PENDING', isMandatory: false, rmvTemplateId: null,
  merchantFields: null, publishedAt: null, approvalComment: null,
  approvedAt: null, approvedBy: null, createdAt: new Date(), updatedAt: new Date(),
}

type Role = 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'

function membershipRow(role: Role, canManageVouchers: boolean) {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role,
    allBranches: true, canManageVouchers,
    merchant: { status: 'ACTIVE', businessName: 'Acme' },
    branches: [],
  }
}

async function makeApp(role: Role, canManageVouchers: boolean) {
  const app = await buildApp()
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      // resolveMerchantContext -> getActiveMembership -> findMany (single active row)
      findMany: vi.fn().mockResolvedValue([membershipRow(role, canManageVouchers)]),
      // resolveAdminMerchant -> getOwnerMembership -> findFirst (OWNER only)
      findFirst: vi.fn().mockResolvedValue(
        role === 'OWNER' ? { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'ACTIVE', businessName: 'Acme' } } : null
      ),
    },
    voucher: {
      findMany: vi.fn().mockResolvedValue([mockVoucher]),
      findFirst: vi.fn().mockResolvedValue(mockVoucher),
      create: vi.fn().mockResolvedValue({ ...mockVoucher }),
      update: vi.fn().mockResolvedValue({ ...mockVoucher }),
      delete: vi.fn().mockResolvedValue(mockVoucher),
    },
    adminApproval: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'appr1' }),
      update: vi.fn().mockResolvedValue({ id: 'appr1' }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
  app.decorate('prisma', prismaMock as any)
  app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
  await app.ready()
  const jwtAny = app.jwt as any
  const token = jwtAny.merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  return { app, token, prismaMock }
}

describe('voucher write protection — four-case matrix (§5.1.1)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  async function postVoucher(role: Role, canManageVouchers: boolean, payloadExtra: Record<string, unknown> = {}) {
    const made = await makeApp(role, canManageVouchers)
    app = made.app
    return made.app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${made.token}` },
      payload: { type: 'DISCOUNT_PERCENT', title: '10% off', estimatedSaving: 5.0, ...payloadExtra },
    })
  }

  it('OWNER -> voucher write allowed (201)', async () => {
    const res = await postVoucher('OWNER', false)
    expect(res.statusCode).toBe(201)
  })

  it('BRANCH_MANAGER WITH canManageVouchers -> voucher write allowed (201)', async () => {
    const res = await postVoucher('BRANCH_MANAGER', true)
    expect(res.statusCode).toBe(201)
  })

  it('BRANCH_MANAGER WITHOUT canManageVouchers -> 403 INSUFFICIENT_PERMISSIONS', async () => {
    const res = await postVoucher('BRANCH_MANAGER', false)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })

  it('STAFF -> 403 INSUFFICIENT_PERMISSIONS', async () => {
    const res = await postVoucher('STAFF', false)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })

  it('STAFF body carrying canManageVouchers:true is IGNORED -> still 403 (value comes from membership, never the body)', async () => {
    const res = await postVoucher('STAFF', false, { canManageVouchers: true })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })
})

describe('voucher read — MEMBER-READ allowed for every active role', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  const roles: Array<{ role: Role; cmv: boolean }> = [
    { role: 'OWNER', cmv: false },
    { role: 'BRANCH_MANAGER', cmv: true },
    { role: 'BRANCH_MANAGER', cmv: false },
    { role: 'STAFF', cmv: false },
  ]

  for (const { role, cmv } of roles) {
    it(`GET /merchant/vouchers allowed for ${role}${cmv ? '+MV' : ''} (200)`, async () => {
      const made = await makeApp(role, cmv)
      app = made.app
      const res = await made.app.inject({
        method: 'GET', url: '/api/v1/merchant/vouchers',
        headers: { authorization: `Bearer ${made.token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toHaveLength(1)
    })
  }
})
