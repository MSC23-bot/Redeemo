import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B1 — auth + capability gate on the edit-applier routes (not business
// logic). The gate fires in preHandlers (authenticateAdmin → requireAdminCapability)
// before any service/prisma call, so for the gate cases a bare prisma mock suffices.
//
// approve-edit / reject-edit need approval:apply-edit; edit-review needs
// approval:read. SUPPORT holds neither; OPERATIONS / SUPER_ADMIN hold both.

describe('B1 — edit-applier route auth + capability gates', () => {
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

  it('401 when unauthenticated (POST approve-edit)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/approvals/some-id/approve-edit' })
    expect(res.statusCode).toBe(401)
  })

  it('401 when unauthenticated (POST reject-edit)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/approvals/some-id/reject-edit' })
    expect(res.statusCode).toBe(401)
  })

  it('401 when unauthenticated (GET edit-review)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/approvals/some-id/edit-review' })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for a role without approval:apply-edit (SUPPORT, approve-edit)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/approve-edit',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for a role without approval:apply-edit (SUPPORT, reject-edit)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/reject-edit',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
      payload: { reason: 'not acceptable' },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for a role without approval:read (SUPPORT, edit-review)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals/some-id/edit-review',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('reject-edit requires a reason body (400 when missing)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/reject-edit',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: {},
    })
    // Zod reasonBody rejects an empty body before any service call.
    expect(res.statusCode).toBe(400)
  })
})

// OPERATIONS passes the cap gate; with a prisma mock we drive the route end-to-end
// and pin the 200 response shapes for approve / reject / review.
describe('B1 — edit-applier route success shapes (OPERATIONS, prisma mock)', () => {
  let app: FastifyInstance
  const signOps = () =>
    (app.jwt as any).admin.sign(
      { sub: 'admin-9', role: 'admin', adminRole: 'OPERATIONS', sessionId: 's1' },
      { expiresIn: '1h' },
    )

  function makePrisma() {
    const pendingEdit = {
      id: 'pe-1', status: 'PENDING', merchantId: 'm-1',
      proposedChanges: { businessName: 'New Name' },
    }
    // The approve path runs inside $transaction against `tx`.
    const tx = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appr-1', type: 'MERCHANT_IDENTITY_EDIT', status: 'PENDING', referenceId: 'pe-1',
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      merchantPendingEdit: {
        findUnique: vi.fn().mockResolvedValue(pendingEdit),
        update: vi.fn().mockResolvedValue(undefined),
      },
      branchPendingEdit: { findUnique: vi.fn() },
      merchant: {
        findUnique: vi.fn().mockResolvedValue({ id: 'm-1', businessName: 'Old Name' }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      branch: { findUnique: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    }
    // The edit-review path runs on the top-level prisma (no $transaction); the
    // after-commit owner lookup also runs on the top level.
    return {
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      // No ACTIVE OWNER -> no notify (safe path; pinned shapes stay deterministic).
      merchantMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({ id: 'appr-1', type: 'MERCHANT_IDENTITY_EDIT', referenceId: 'pe-1' }),
      },
      merchantPendingEdit: { findUnique: vi.fn().mockResolvedValue(pendingEdit) },
      merchant: { findUnique: vi.fn().mockResolvedValue({ businessName: 'Old Name', tradingName: null, logoUrl: null, bannerUrl: null, description: null }) },
    } as any
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma())
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('approve-edit returns { approved: true }', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/appr-1/approve-edit',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ approved: true })
  })

  it('edit-review returns the field diff (current vs proposed, isCustomerVisible)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals/appr-1/edit-review',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.kind).toBe('merchant')
    expect(body.merchantId).toBe('m-1')
    expect(body.includesPhotos).toBe(false)
    expect(body.fields).toEqual([
      { field: 'businessName', current: 'Old Name', proposed: 'New Name', isCustomerVisible: true },
    ])
  })
})
