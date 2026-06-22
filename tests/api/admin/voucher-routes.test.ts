import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Day-2 Vouchers A8: auth + capability gate on the admin VOUCHER routes (not
// business logic). The gate fires in preHandlers (authenticateAdmin to
// requireAdminCapability) before any service/prisma call, so for the gate cases
// a bare prisma mock suffices.
//
// voucher-review needs approval:read; approve/reject/request-changes need
// approval:action. SUPPORT holds neither; OPERATIONS / SUPER_ADMIN hold both.

describe('A8: admin VOUCHER route auth + capability gates', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {} as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('401 when unauthenticated (GET voucher-review)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/approvals/some-id/voucher-review' })
    expect(res.statusCode).toBe(401)
  })

  it('401 when unauthenticated (POST approve-voucher)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/approvals/some-id/approve-voucher' })
    expect(res.statusCode).toBe(401)
  })

  it('401 when unauthenticated (POST reject-voucher)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/approvals/some-id/reject-voucher' })
    expect(res.statusCode).toBe(401)
  })

  it('401 when unauthenticated (POST request-voucher-changes)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/approvals/some-id/request-voucher-changes' })
    expect(res.statusCode).toBe(401)
  })

  it('403 for a role without approval:read (SUPPORT, voucher-review)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals/some-id/voucher-review',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for a role without approval:action (SUPPORT, approve-voucher)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/approve-voucher',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for a role without approval:action (SUPPORT, reject-voucher)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/reject-voucher',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
      payload: { reason: 'no good' },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for a role without approval:action (SUPPORT, request-voucher-changes)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/request-voucher-changes',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
      payload: { note: 'tweak it' },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('reject-voucher requires a reason body (400 when missing)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/reject-voucher',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('request-voucher-changes requires a note body (400 when missing)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/request-voucher-changes',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})

// OPERATIONS passes the cap gate; with a prisma mock we drive the routes
// end-to-end and pin dispatch + the non-VOUCHER APPROVAL_NOT_ACTIONABLE path.
describe('A8: admin VOUCHER route dispatch (OPERATIONS, prisma mock)', () => {
  let app: FastifyInstance
  const signOps = () =>
    (app.jwt as any).admin.sign(
      { sub: 'admin-9', role: 'admin', adminRole: 'OPERATIONS', sessionId: 's1' },
      { expiresIn: '1h' },
    )

  // A VOUCHER approval whose review context resolves a curated voucher + merchant.
  function makeVoucherPrisma() {
    return {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({ id: 'appr-v', type: 'VOUCHER', referenceId: 'v-1' }),
      },
      voucher: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'v-1', title: 'Lunch deal', type: 'DISCOUNT_FIXED', status: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING', description: 'd', terms: 't', estimatedSaving: '12.50',
          expiryDate: null, cooldownSeconds: null, merchantFields: { askHelp: false }, merchantId: 'm-1',
          availabilityWindows: [],
        }),
        count: vi.fn().mockResolvedValue(0), // flagship live
      },
      merchant: {
        findUnique: vi.fn().mockResolvedValue({ id: 'm-1', businessName: 'Acme', status: 'ACTIVE' }),
      },
    } as any
  }

  // A non-VOUCHER approval (onboarding) drives the APPROVAL_NOT_ACTIONABLE branch.
  function makeNonVoucherPrisma() {
    return {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({ id: 'appr-o', type: 'MERCHANT_ONBOARDING', referenceId: 'm-1' }),
      },
    } as any
  }

  afterEach(async () => {
    await app.close()
  })

  it('GET voucher-review dispatches to getVoucherReviewContext (curated voucher + merchant + goLive)', async () => {
    app = await buildApp()
    app.decorate('prisma', makeVoucherPrisma())
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals/appr-v/voucher-review',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.voucher.id).toBe('v-1')
    expect(body.voucher.estimatedSaving).toBe(12.5)
    expect(body.merchant).toEqual({ id: 'm-1', businessName: 'Acme', status: 'ACTIVE' })
    expect(body.goLive).toBe(true)
  })

  it('GET voucher-review on a non-VOUCHER approval -> 409 APPROVAL_NOT_ACTIONABLE', async () => {
    app = await buildApp()
    app.decorate('prisma', makeNonVoucherPrisma())
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals/appr-o/voucher-review',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('APPROVAL_NOT_ACTIONABLE')
  })
})
