import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B2.5-core: auth + capability + strict-body gate on the admin propose
// route. The capability gate (authenticateAdmin then
// requireAdminCapability('merchant:propose-edit')) fires in preHandlers and the
// strict Zod body parses BEFORE the service, so a prisma mock suffices. The
// positive case drives createMerchantEditRequestCore through a mock prisma whose
// $transaction runs the callback with the same mock as `tx`.
describe('B2.5-core: POST /admin/merchants/:id/edit-request (auth + capability + strict body)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })
  const url = '/api/v1/admin/merchants/m1/edit-request'

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' }) },
      merchantPendingEdit: {
        findFirst: vi.fn().mockResolvedValue(null), // no existing pending edit
        create: vi.fn().mockResolvedValue({ id: 'pe-1' }),
      },
      adminApproval: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url, payload: { businessName: 'New', reason: 'fix' } })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for OPERATIONS (lacks merchant:propose-edit)', async () => {
    const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` }, payload: { businessName: 'New', reason: 'fix' } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for SUPPORT', async () => {
    const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` }, payload: { businessName: 'New', reason: 'fix' } })
    expect(res.statusCode).toBe(403)
  })

  it('400 when reason is missing', async () => {
    const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { businessName: 'New' } })
    expect(res.statusCode).toBe(400)
  })

  it('400 when a non-allow-listed key is sent (logoUrl, strict body)', async () => {
    const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { logoUrl: 'https://x.com/logo.png', reason: 'fix' } })
    expect(res.statusCode).toBe(400)
  })

  it('400 NO_SENSITIVE_FIELDS when no identity field is sent (only reason)', async () => {
    const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { reason: 'fix' } })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('NO_SENSITIVE_FIELDS')
  })

  it('409 PENDING_EDIT_EXISTS when an edit is already awaiting review', async () => {
    ;(app as any).prisma.merchantPendingEdit.findFirst.mockResolvedValueOnce({ id: 'pe-0' })
    const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { businessName: 'New', reason: 'fix' } })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PENDING_EDIT_EXISTS')
  })

  it('200 SUPER_ADMIN proposes: creates pending edit + admin-comment approval + actor ADMIN audit', async () => {
    const res = await app.inject({
      method: 'POST', url,
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: { businessName: 'Acme Rebrand', tradingName: 'Acme', reason: 'companies house rename' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ pendingEditId: 'pe-1' })

    // PendingEdit carries only the proposed sensitive keys.
    expect(app.prisma.merchantPendingEdit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', proposedChanges: { businessName: 'Acme Rebrand', tradingName: 'Acme' } }) }),
    )
    // The AdminApproval comment records the admin proposer + reason.
    const approvalArgs = (app.prisma.adminApproval.create as any).mock.calls[0][0]
    expect(approvalArgs.data.type).toBe('MERCHANT_IDENTITY_EDIT')
    expect(approvalArgs.data.comment).toMatch(/Admin-proposed/)
    expect(approvalArgs.data.comment).toMatch(/companies house rename/)
    // Actor-attributed audit.
    expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MERCHANT_EDIT_REQUEST_CREATED', actorType: 'ADMIN', reason: 'companies house rename' }) }),
    )
  })
})
