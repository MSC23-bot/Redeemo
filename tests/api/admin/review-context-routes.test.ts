import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// M4 — auth + capability gate on GET /api/v1/admin/approvals/:id/review.
// The gate fires in preHandlers (authenticateAdmin → requireAdminCapability)
// before any service/prisma call, so a stub prisma suffices.
describe('M4 — /admin/approvals/:id/review route auth + capability gate', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    app = await buildApp()
    // Stub prisma so the preHandler gate fires before the service is ever reached.
    // When the gate passes (OPERATIONS/SUPER_ADMIN), getReviewContext is called on
    // the stub — we just need it to not crash, so stub returns a minimal object.
    app.decorate('prisma', {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'some-id',
          type: 'VOUCHER',
          referenceId: 'ref-1',
          referenceType: 'voucher',
          status: 'PENDING',
          adminUserId: null,
          comment: null,
          submittedAt: new Date(),
          actionedAt: null,
          claimedById: null,
          claimedAt: null,
        }),
      },
      adminUser: { findMany: vi.fn().mockResolvedValue([]) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('401 when unauthenticated (GET review)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/approvals/some-id/review' })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for a role without approval:read (SUPPORT)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals/some-id/review',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 ADMIN_CAPABILITY_DENIED for FINANCE role (no approval:read)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals/some-id/review',
      headers: { authorization: `Bearer ${signAdmin('FINANCE')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('200 (or handler-reached) with OPERATIONS token — gate passes, service runs on stub', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals/some-id/review',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    // Gate passed — handler reached the service stub. The stub returns a non-MERCHANT_ONBOARDING
    // approval (VOUCHER type), so the service should return 200 with the minimal context.
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('approval')
    expect(body.approval.id).toBe('some-id')
    expect(body.merchant).toBeNull()
    expect(body.branches).toEqual([])
    expect(body.vouchers).toEqual([])
    expect(body.documents).toEqual([])
  })

  it('200 with SUPER_ADMIN token — gate passes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals/some-id/review',
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
    })
    expect(res.statusCode).toBe(200)
  })
})
