import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant RMV voucher routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  const mockTemplate = {
    id: 'tmpl1', categoryId: 'cat1', voucherType: 'BOGO', title: 'Buy One Get One Free',
    description: 'Get a second item free.', allowedFields: ['terms', 'expiryDate'],
    minimumSaving: 5.00, isActive: true,
  }

  const mockRmv = {
    id: 'rmv1', merchantId: 'm1', code: 'RMV-ABC12345', isRmv: true, rmvTemplateId: 'tmpl1',
    type: 'BOGO', title: 'Buy One Get One Free', description: 'Get a second item free.',
    estimatedSaving: 5.00, status: 'DRAFT', approvalStatus: 'PENDING',
    merchantFields: null, isMandatory: true, rmvTemplate: null, publishedAt: null,
  }

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
      voucher: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      rmvTemplate: { findMany: vi.fn() },
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    // B5.1: the RMV edit/submit cores now wrap voucher.update + writeAuditLogTx in a
    // $transaction (the audit commits/rolls back with the change). The mock runs the
    // callback with the SAME prisma mock as the tx client, so the per-test
    // voucher.update / auditLog.create reassignments + assertions still apply.
    prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/vouchers/rmv returns RMV vouchers', async () => {
    app.prisma.voucher.findMany = vi.fn().mockResolvedValue([mockRmv])
    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/vouchers/rmv',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('PATCH /api/v1/merchant/vouchers/rmv/:id updates allowed fields only', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({
      ...mockRmv,
      rmvTemplate: { ...mockTemplate, allowedFields: ['terms', 'expiryDate'] },
    })
    app.prisma.voucher.update = vi.fn().mockResolvedValue({
      ...mockRmv,
      merchantFields: { terms: 'Min spend £10' },
    })

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/vouchers/rmv/rmv1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { terms: 'Min spend £10' },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ merchantFields: expect.objectContaining({ terms: 'Min spend £10' }) }) })
    )
  })

  // B5.1 non-regression: the merchant edit path now audits IN-TRANSACTION as
  // MERCHANT_ADMIN (actorId = the JWT sub), with before/after merchantFields and no
  // reason. Was a fire-and-forget writeAuditLog with no actor before B5.1.
  it('PATCH merchant RMV writes an in-tx MERCHANT_ADMIN RMV_UPDATED audit', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({
      ...mockRmv,
      merchantFields: { terms: 'Old terms' },
      rmvTemplate: { ...mockTemplate, allowedFields: ['terms', 'expiryDate'] },
    })
    app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockRmv })

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/vouchers/rmv/rmv1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { terms: 'New terms' },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.$transaction).toHaveBeenCalled()
    expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'RMV_UPDATED',
          actorType: 'MERCHANT_ADMIN',
          actorId: 'ma1',
          reason: undefined,
          before: { merchantFields: { terms: 'Old terms' } },
          after: { merchantFields: { terms: 'New terms' } },
          metadata: { voucherId: 'rmv1' },
        }),
      })
    )
  })

  it('PATCH /api/v1/merchant/vouchers/rmv/:id rejects disallowed fields', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({
      ...mockRmv,
      rmvTemplate: { ...mockTemplate, allowedFields: ['terms', 'expiryDate'] },
    })

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/vouchers/rmv/rmv1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { title: 'Sneaky name change', terms: 'OK term' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('RMV_FIELD_NOT_ALLOWED')
  })

  it('POST /api/v1/merchant/vouchers/rmv/:id/submit moves DRAFT to PENDING_APPROVAL', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockRmv, status: 'DRAFT' })
    app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockRmv, status: 'PENDING_APPROVAL' })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/rmv1/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL' }) })
    )
  })

  // B5.1 non-regression: the merchant submit path audits IN-TRANSACTION as
  // MERCHANT_ADMIN with the DRAFT -> PENDING_APPROVAL before/after.
  it('POST merchant RMV submit writes an in-tx MERCHANT_ADMIN RMV_SUBMITTED audit', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockRmv, status: 'DRAFT' })
    app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockRmv, status: 'PENDING_APPROVAL' })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/rmv1/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.$transaction).toHaveBeenCalled()
    expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'RMV_SUBMITTED',
          actorType: 'MERCHANT_ADMIN',
          actorId: 'ma1',
          reason: undefined,
          before: { status: 'DRAFT' },
          after: { status: 'PENDING_APPROVAL' },
          metadata: { voucherId: 'rmv1' },
        }),
      })
    )
  })

  it('POST merchant RMV submit rejects a non-DRAFT voucher (VOUCHER_NOT_SUBMITTABLE)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockRmv, status: 'PENDING_APPROVAL' })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/rmv1/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_SUBMITTABLE')
  })

  it('PATCH /api/v1/merchant/profile blocks category change if RMV submitted', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: 'cat1' })
    app.prisma.voucher.findMany = vi.fn().mockResolvedValue([{ ...mockRmv, status: 'PENDING_APPROVAL' }])

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { primaryCategoryId: 'cat2' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('CATEGORY_CHANGE_BLOCKED')
  })
})
