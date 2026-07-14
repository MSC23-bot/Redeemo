import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B5.1: admin RMV co-build on behalf.
//   GET  /admin/merchants/:id/vouchers/rmv                 (merchant:read)
//   PATCH /admin/merchants/:id/vouchers/:voucherId/rmv      (merchant:manage-vouchers)
//   POST  /admin/merchants/:id/vouchers/:voucherId/rmv/submit (merchant:manage-vouchers)
//
// The gate (authenticateAdmin then requireAdminCapability) fires in preHandlers
// before the service; the edit/submit run the SHARED cores the merchant routes run
// (no weaker path). A tiny prisma mock suffices: $transaction runs the callback
// with the same mock, so the in-tx audit lands on the same auditLog.create spy.
describe('B5.1: admin RMV co-build routes', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  const editUrl = '/api/v1/admin/merchants/m1/vouchers/rmv1/rmv'
  const submitUrl = '/api/v1/admin/merchants/m1/vouchers/rmv1/rmv/submit'
  const readUrl = '/api/v1/admin/merchants/m1/vouchers/rmv'

  const draftRmv = {
    id: 'rmv1', merchantId: 'm1', code: 'RMV-ABC12345', isRmv: true, rmvTemplateId: 'tmpl1',
    type: 'BOGO', title: 'Buy One Get One Free', estimatedSaving: 5.0,
    status: 'DRAFT', approvalStatus: 'PENDING', merchantFields: { terms: 'Old terms' },
    rmvTemplate: { id: 'tmpl1', allowedFields: ['terms', 'expiryDate'] },
  }

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      // resolveTargetMerchantForAdmin selects { id, status }; ACTIVE by default.
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' }) },
      voucher: {
        findFirst: vi.fn().mockResolvedValue(draftRmv),
        findMany: vi.fn().mockResolvedValue([draftRmv]),
        update: vi.fn().mockResolvedValue({ ...draftRmv }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prismaMock))
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  // ── auth / capability ──────────────────────────────────────────────────────

  it('401 when unauthenticated (PATCH)', async () => {
    const res = await app.inject({ method: 'PATCH', url: editUrl, payload: { fields: { terms: 'x' }, reason: 'r' } })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for SUPPORT on PATCH (lacks merchant:manage-vouchers)', async () => {
    const res = await app.inject({ method: 'PATCH', url: editUrl, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` }, payload: { fields: { terms: 'x' }, reason: 'r' } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 ADMIN_CAPABILITY_DENIED for FINANCE on submit', async () => {
    const res = await app.inject({ method: 'POST', url: submitUrl, headers: { authorization: `Bearer ${signAdmin('FINANCE')}` }, payload: { reason: 'r' } })
    expect(res.statusCode).toBe(403)
  })

  it('403 for SUPPORT on the GET read (lacks merchant:read)', async () => {
    const res = await app.inject({ method: 'GET', url: readUrl, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` } })
    expect(res.statusCode).toBe(403)
  })

  // ── read ────────────────────────────────────────────────────────────────────

  it('GET 200 for OPERATIONS: redacted RMV shape with allowedFields + numeric estimatedSaving', async () => {
    const res = await app.inject({ method: 'GET', url: readUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.vouchers).toHaveLength(1)
    expect(body.vouchers[0]).toMatchObject({
      id: 'rmv1', code: 'RMV-ABC12345', title: 'Buy One Get One Free', type: 'BOGO',
      estimatedSaving: 5, status: 'DRAFT', approvalStatus: 'PENDING',
      merchantFields: { terms: 'Old terms' }, allowedFields: ['terms', 'expiryDate'],
    })
    // No raw template object / no secrets leaked.
    expect(body.vouchers[0]).not.toHaveProperty('rmvTemplate')
  })

  // S5 item 2 (draft-type honesty): the co-build read is a per-request pass-through of
  // voucher.type + the LINKED template's allowedFields. After a draft-time relink
  // (percent -> fixed toggled save), the row carries the sibling type/template, so the
  // admin surface shows the TRUTHFUL mechanic for a toggled draft: no stale
  // DISCOUNT_PERCENT while the bag holds a fixed-amount offer.
  it('GET surfaces the truthful mechanic for a relinked draft (type + sibling allowedFields)', async () => {
    ;(app as any).prisma.voucher.findMany.mockResolvedValue([{
      ...draftRmv,
      type: 'DISCOUNT_FIXED', rmvTemplateId: 'tmpl-fixed',
      merchantFields: { merchantFields: { builderType: 'discount', discountKind: 'fixed', discAmount: 10 } },
      rmvTemplate: { id: 'tmpl-fixed', allowedFields: ['title', 'terms', 'merchantFields'] },
    }])
    const res = await app.inject({ method: 'GET', url: readUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const row = JSON.parse(res.body).vouchers[0]
    expect(row.type).toBe('DISCOUNT_FIXED')
    expect(row.allowedFields).toEqual(['title', 'terms', 'merchantFields'])
    expect(row.merchantFields.merchantFields.discountKind).toBe('fixed')
  })

  // ── edit ─────────────────────────────────────────────────────────────────────

  it('PATCH 400 when reason is missing (STRICT body)', async () => {
    const res = await app.inject({ method: 'PATCH', url: editUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` }, payload: { fields: { terms: 'x' } } })
    expect(res.statusCode).toBe(400)
  })

  it('PATCH 400 RMV_FIELD_NOT_ALLOWED for a disallowed field key', async () => {
    const res = await app.inject({
      method: 'PATCH', url: editUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { fields: { title: 'Sneaky rename', terms: 'ok' }, reason: 'co-build' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('RMV_FIELD_NOT_ALLOWED')
  })

  it('PATCH 409 VOUCHER_NOT_EDITABLE for a non-DRAFT RMV', async () => {
    ;(app as any).prisma.voucher.findFirst.mockResolvedValue({ ...draftRmv, status: 'PENDING_APPROVAL' })
    const res = await app.inject({
      method: 'PATCH', url: editUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { fields: { terms: 'x' }, reason: 'co-build' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_EDITABLE')
  })

  it('PATCH 404 RMV_NOT_FOUND when the voucher is not found / cross-merchant (scoped findFirst)', async () => {
    ;(app as any).prisma.voucher.findFirst.mockResolvedValue(null)
    const res = await app.inject({
      method: 'PATCH', url: editUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { fields: { terms: 'x' }, reason: 'co-build' },
    })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('RMV_NOT_FOUND')
  })

  it('PATCH 200 happy: merges merchantFields + writes an in-tx ADMIN RMV_UPDATED audit with reason', async () => {
    const res = await app.inject({
      method: 'PATCH', url: editUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { fields: { terms: 'New terms' }, reason: 'co-building with the owner on a call' },
    })
    expect(res.statusCode).toBe(200)
    expect((app as any).prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rmv1' }, data: expect.objectContaining({ merchantFields: { terms: 'New terms' } }) }),
    )
    expect((app as any).prisma.$transaction).toHaveBeenCalled()
    expect((app as any).prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        event: 'RMV_UPDATED', actorType: 'ADMIN', actorId: 'admin-1',
        reason: 'co-building with the owner on a call',
        before: { merchantFields: { terms: 'Old terms' } },
        after: { merchantFields: { terms: 'New terms' } },
        metadata: { voucherId: 'rmv1' },
      }) }),
    )
  })

  it('PATCH 200 on a SUSPENDED merchant with a DRAFT RMV (resolver allows SUSPENDED; DRAFT gate passes)', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValue({ id: 'm1', status: 'SUSPENDED' })
    const res = await app.inject({
      method: 'PATCH', url: editUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { fields: { terms: 'x' }, reason: 'operational fix' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('PATCH 404 MERCHANT_NOT_FOUND when the merchant is absent', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValue(null)
    const res = await app.inject({
      method: 'PATCH', url: editUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { fields: { terms: 'x' }, reason: 'r' },
    })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_NOT_FOUND')
  })

  it('PATCH 200 for SUPER_ADMIN (superuser holds merchant:manage-vouchers)', async () => {
    const res = await app.inject({
      method: 'PATCH', url: editUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: { fields: { terms: 'x' }, reason: 'r' },
    })
    expect(res.statusCode).toBe(200)
  })

  // ── submit ────────────────────────────────────────────────────────────────────

  it('POST submit 200: DRAFT -> PENDING_APPROVAL + in-tx ADMIN RMV_SUBMITTED audit with reason', async () => {
    const res = await app.inject({
      method: 'POST', url: submitUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { reason: 'submitting on behalf' },
    })
    expect(res.statusCode).toBe(200)
    expect((app as any).prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL' }) }),
    )
    expect((app as any).prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        event: 'RMV_SUBMITTED', actorType: 'ADMIN', actorId: 'admin-1', reason: 'submitting on behalf',
        before: { status: 'DRAFT' }, after: { status: 'PENDING_APPROVAL' }, metadata: { voucherId: 'rmv1' },
      }) }),
    )
  })

  it('POST submit 409 VOUCHER_NOT_SUBMITTABLE for a non-DRAFT RMV', async () => {
    ;(app as any).prisma.voucher.findFirst.mockResolvedValue({ ...draftRmv, status: 'ACTIVE' })
    const res = await app.inject({
      method: 'POST', url: submitUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { reason: 'try' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_SUBMITTABLE')
  })

  it('POST submit 200 with empty merchantFields (NO completeness gate; matches the merchant path)', async () => {
    ;(app as any).prisma.voucher.findFirst.mockResolvedValue({ ...draftRmv, merchantFields: {} })
    const res = await app.inject({
      method: 'POST', url: submitUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { reason: 'submit blank' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('POST submit 400 when reason is missing (STRICT body)', async () => {
    const res = await app.inject({
      method: 'POST', url: submitUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})
