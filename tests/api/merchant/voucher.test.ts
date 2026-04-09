import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant custom voucher routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  const mockVoucher = {
    id: 'v1',
    merchantId: 'm1',
    code: 'RCV-ABC12345',
    isRmv: false,
    type: 'DISCOUNT_PERCENT',
    title: '10% off',
    description: null,
    terms: null,
    imageUrl: null,
    estimatedSaving: 5.00,
    expiryDate: null,
    status: 'DRAFT',
    approvalStatus: 'PENDING',
    isMandatory: false,
    rmvTemplateId: null,
    merchantFields: null,
    publishedAt: null,
    approvalComment: null,
    approvedAt: null,
    approvedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      voucher: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null) } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    merchantToken = jwtAny.merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/vouchers returns custom vouchers', async () => {
    app.prisma.voucher.findMany = vi.fn().mockResolvedValue([mockVoucher])
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('POST /api/v1/merchant/vouchers creates a DRAFT voucher', async () => {
    app.prisma.voucher.create = vi.fn().mockResolvedValue({ ...mockVoucher })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'DISCOUNT_PERCENT',
        title: '10% off',
        estimatedSaving: 5.00,
      },
    })
    expect(res.statusCode).toBe(201)
    expect(app.prisma.voucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DRAFT',
          isRmv: false,
        }),
      })
    )
  })

  it('PATCH /api/v1/merchant/vouchers/:id updates a DRAFT voucher', async () => {
    app.prisma.voucher.findFirst = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, status: 'DRAFT' })
    app.prisma.voucher.update = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, title: 'Updated title' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { title: 'Updated title' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('PATCH /api/v1/merchant/vouchers/:id returns 409 for PENDING_APPROVAL voucher', async () => {
    app.prisma.voucher.findFirst = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, status: 'PENDING_APPROVAL' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { title: 'Updated title' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_EDITABLE')
  })

  it('POST /api/v1/merchant/vouchers/:id/submit moves DRAFT to PENDING_APPROVAL', async () => {
    app.prisma.voucher.findFirst = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, status: 'DRAFT' })
    app.prisma.voucher.update = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, status: 'PENDING_APPROVAL' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers/v1/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING_APPROVAL',
        }),
      })
    )
  })

  it('DELETE /api/v1/merchant/vouchers/:id deletes a DRAFT voucher', async () => {
    app.prisma.voucher.findFirst = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, status: 'DRAFT' })
    app.prisma.voucher.delete = vi.fn().mockResolvedValue(mockVoucher)
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('DELETE /api/v1/merchant/vouchers/:id returns 409 for non-DRAFT voucher', async () => {
    app.prisma.voucher.findFirst = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, status: 'PENDING_APPROVAL' })
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_DELETABLE')
  })
})
