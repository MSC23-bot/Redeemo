import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Merchant 360 A4: the two NEW additive admin reads —
//   GET /admin/merchants/:id/vouchers  (custom / RCV roster)
//   GET /admin/merchants/:id/staff     (portal members + branch app logins)
// Both gate on the existing `merchant:read` (OD4 interim decision). The gate
// (authenticateAdmin -> requireAdminCapability -> resolveTargetMerchantForAdmin)
// fires before the service, so a tiny prisma mock suffices. These tests pin the
// EXACT curated key set on each payload and assert the absence of every secret
// (redemptionPin, passwordHash, tokens, session data, customer PII).

describe('A4: GET /admin/merchants/:id/vouchers (custom RCV roster)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })
  const url = '/api/v1/admin/merchants/m1/vouchers'

  const voucherRow = {
    id: 'v1', code: 'RCV-001', title: 'Free coffee Friday', type: 'FREEBIE',
    status: 'ACTIVE', approvalStatus: 'APPROVED',
    estimatedSaving: { toString: () => '3.50' }, // Prisma Decimal-like (Number()-coercible)
    expiryDate: new Date('2026-12-31T00:00:00.000Z'),
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    pendingEdits: [{ id: 'pe1', kind: 'CHANGE', status: 'PENDING' }],
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      // resolveTargetMerchantForAdmin -> findUnique {id,status}; the service ->
      // voucher.findMany.
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' }) },
      voucher: { findMany: vi.fn().mockResolvedValue([voucherRow]) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for SUPPORT (lacks merchant:read)', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('200 for OPERATIONS with the exact curated key set + coerced Decimal + query redaction', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.vouchers).toHaveLength(1)
    const v = body.vouchers[0]

    // Exact key set — nothing more, nothing less.
    expect(Object.keys(v).sort()).toEqual([
      'approvalStatus', 'code', 'createdAt', 'estimatedSaving', 'expiryDate', 'id', 'pendingEdit', 'status', 'title', 'type',
    ])
    // estimatedSaving coerced to a Number (Prisma Decimal serialises as a string).
    expect(v.estimatedSaving).toBe(3.5)
    expect(typeof v.estimatedSaving).toBe('number')
    // Curated pending-edit summary only.
    expect(v.pendingEdit).toEqual({ id: 'pe1', kind: 'CHANGE', status: 'PENDING' })
    // No customer PII, no redemption rows, no merchantFields, no secrets.
    expect(v).not.toHaveProperty('merchantFields')
    expect(v).not.toHaveProperty('redemptions')
    expect(v).not.toHaveProperty('redemptionPin')

    // The query is scoped to custom (isRmv:false) vouchers of this merchant, and
    // the select never asks for a secret / customer field.
    const findArgs = (app as any).prisma.voucher.findMany.mock.calls[0][0]
    expect(findArgs.where).toEqual({ merchantId: 'm1', isRmv: false })
    expect(findArgs.select).not.toHaveProperty('merchantFields')
    expect(findArgs.select.pendingEdits.select).toEqual({ id: true, kind: true, status: true })
  })

  it('pendingEdit is null when the voucher has no open edit', async () => {
    ;(app as any).prisma.voucher.findMany.mockResolvedValueOnce([{ ...voucherRow, pendingEdits: [] }])
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).vouchers[0].pendingEdit).toBeNull()
  })

  it('404 MERCHANT_NOT_FOUND when the merchant is absent', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValueOnce(null)
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_NOT_FOUND')
  })
})

describe('A4: GET /admin/merchants/:id/staff (roster read)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })
  const url = '/api/v1/admin/merchants/m1/staff'

  const membershipRow = {
    id: 'mm1', role: 'OWNER', status: 'ACTIVE', allBranches: true, canManageVouchers: false,
    merchantAdmin: { firstName: 'Marta', lastName: 'Okafor', email: 'marta@x.com', emailVerified: true },
    branches: [],
  }
  const managerRow = {
    id: 'mm2', role: 'BRANCH_MANAGER', status: 'ACTIVE', allBranches: false, canManageVouchers: true,
    merchantAdmin: { firstName: 'Ben', lastName: 'Ng', email: 'ben@x.com', emailVerified: false },
    branches: [{ branch: { id: 'b1', name: 'High Street' } }],
  }
  const branchUserRow = {
    id: 'bu1', firstName: 'Sam', lastName: 'Lee', email: 'sam@x.com', status: 'ACTIVE',
    branch: { id: 'b1', name: 'High Street' },
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' }) },
      merchantMembership: { findMany: vi.fn().mockResolvedValue([membershipRow, managerRow]) },
      branchUser: { findMany: vi.fn().mockResolvedValue([branchUserRow]) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for SUPPORT (lacks merchant:read)', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('200 for OPERATIONS with the exact curated member + app-login key sets', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Object.keys(body).sort()).toEqual(['appLogins', 'members'])
    expect(body.members).toHaveLength(2)
    expect(body.appLogins).toHaveLength(1)

    const owner = body.members[0]
    expect(Object.keys(owner).sort()).toEqual([
      'allBranches', 'appAccess', 'branchScopes', 'canManageVouchers', 'email', 'emailVerified', 'id', 'name', 'role', 'status',
    ])
    expect(owner).toMatchObject({
      id: 'mm1', name: 'Marta Okafor', email: 'marta@x.com', role: 'OWNER', status: 'ACTIVE',
      allBranches: true, canManageVouchers: false, emailVerified: true, appAccess: false, branchScopes: [],
    })
    // The scoped BRANCH_MANAGER carries its branch scopes (id + name only).
    expect(body.members[1].branchScopes).toEqual([{ id: 'b1', name: 'High Street' }])

    const login = body.appLogins[0]
    expect(Object.keys(login).sort()).toEqual(['appAccess', 'branch', 'email', 'id', 'name', 'status'])
    expect(login).toEqual({
      id: 'bu1', name: 'Sam Lee', email: 'sam@x.com', status: 'ACTIVE',
      branch: { id: 'b1', name: 'High Street' }, appAccess: true,
    })
  })

  it('REDACTION: never selects passwordHash / redemptionPin / tokens on either identity', async () => {
    await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    const memberArgs = (app as any).prisma.merchantMembership.findMany.mock.calls[0][0]
    // Neither the membership nor the joined MerchantAdmin selects a secret.
    expect(memberArgs.select).not.toHaveProperty('merchantAdmin.passwordHash')
    expect(memberArgs.select.merchantAdmin.select).not.toHaveProperty('passwordHash')
    expect(memberArgs.select.merchantAdmin.select).not.toHaveProperty('otpVerifiedAt')
    const buArgs = (app as any).prisma.branchUser.findMany.mock.calls[0][0]
    expect(buArgs.select).not.toHaveProperty('passwordHash')
    expect(buArgs.select).not.toHaveProperty('redemptionPin')
    // App logins are scoped to this merchant's non-deleted branches.
    expect(buArgs.where).toEqual({ branch: { merchantId: 'm1', deletedAt: null } })
  })

  it('REDACTION: the serialised body carries no secret field on any row', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    const body = JSON.parse(res.body)
    for (const row of [...body.members, ...body.appLogins]) {
      expect(row).not.toHaveProperty('passwordHash')
      expect(row).not.toHaveProperty('redemptionPin')
      expect(row).not.toHaveProperty('mustChangePassword')
      expect(row).not.toHaveProperty('otpVerifiedAt')
    }
  })

  it('404 MERCHANT_NOT_FOUND when the merchant is absent', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValueOnce(null)
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_NOT_FOUND')
  })
})
