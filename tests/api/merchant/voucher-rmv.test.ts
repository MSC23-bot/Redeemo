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
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      voucher: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      rmvTemplate: { findMany: vi.fn() },
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null) } as any)
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
