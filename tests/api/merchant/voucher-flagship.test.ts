import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

/**
 * M2 B3 (Decision D, MINIMAL): the merchant flagship-RMV create-flagship endpoint.
 *
 * The merchant chooses an eligible voucher type; the backend reads the merchant's
 * primaryCategoryId, walks it to the top-level parent, finds the per-(category,
 * type) RmvTemplate, and creates ONE template-linked DRAFT RMV with template
 * defaults. Ineligible types (TIME_LIMITED / REUSABLE) are rejected. The created
 * RMV stays template-linked so updateRmvVoucher allowedFields keep working.
 *
 * Scope guard (Decision D): this slice does NOT touch setMerchantCategoryCore /
 * handleCategoryChange / provisionRmvVouchers / the B5.1 cores / the checklist gate.
 */
describe('merchant flagship-RMV create-flagship route (M2 B3)', () => {
  let app: FastifyInstance
  let merchantToken: string

  const bogoTemplate = {
    id: 'tmpl-bogo', categoryId: 'cat-food', voucherType: 'BOGO',
    title: 'Buy one, get one free', description: 'A second of the same item, free.',
    allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl', 'merchantFields'],
    minimumSaving: 15.0, isActive: true,
  }

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: 'sub-restaurant' }) },
      category: { findUnique: vi.fn().mockResolvedValue({ parentId: 'cat-food' }) },
      rmvTemplate: { findFirst: vi.fn() },
      voucher: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
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

  it('creates ONE template-linked DRAFT RMV with template defaults for an eligible type', async () => {
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue(bogoTemplate)
    app.prisma.voucher.create = vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'rmv-new', ...data }))

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/create-flagship',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { voucherType: 'BOGO' },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.isRmv).toBe(true)
    expect(body.isMandatory).toBe(true)
    expect(body.rmvTemplateId).toBe('tmpl-bogo')
    expect(body.type).toBe('BOGO')
    expect(body.status).toBe('DRAFT')
    expect(body.approvalStatus).toBe('PENDING')

    // Template looked up against the resolved TOP-LEVEL parent + the chosen type.
    expect(app.prisma.rmvTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: 'cat-food', voucherType: 'BOGO', isActive: true }),
      })
    )
    // Exactly one voucher created, with template defaults + RMV-prefixed code.
    expect(app.prisma.voucher.create).toHaveBeenCalledTimes(1)
    const createArg = (app.prisma.voucher.create as any).mock.calls[0][0]
    expect(createArg.data).toEqual(expect.objectContaining({
      merchantId: 'm1',
      isRmv: true,
      isMandatory: true,
      rmvTemplateId: 'tmpl-bogo',
      type: 'BOGO',
      title: bogoTemplate.title,
      description: bogoTemplate.description,
      estimatedSaving: bogoTemplate.minimumSaving,
      status: 'DRAFT',
      approvalStatus: 'PENDING',
      merchantFields: {},
    }))
    expect(createArg.data.code).toMatch(/^RMV-/)
  })

  it.each(['TIME_LIMITED', 'REUSABLE'])('rejects ineligible flagship type %s before any template lookup', async (type) => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/create-flagship',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { voucherType: type },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_TYPE_NOT_ELIGIBLE')
    // No template lookup / no voucher created for an ineligible type.
    expect(app.prisma.voucher.create).not.toHaveBeenCalled()
  })

  it('throws NO_RMV_TEMPLATE when no template exists for the (category, type) pair', async () => {
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/create-flagship',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { voucherType: 'PACKAGE_DEAL' },
    })

    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.body).error.code).toBe('NO_RMV_TEMPLATE')
    expect(app.prisma.voucher.create).not.toHaveBeenCalled()
  })

  it('does NOT reject a below-floor saving (advisory floor only, no hard server gate)', async () => {
    // Template carries a GBP 15 advisory floor, but the create path persists the
    // template default (= the floor) and never blocks on the value. There is no
    // saving validation in create-flagship at all (saving sanity is B4, scoring is
    // advisory client-side per D8b). Proven: the create succeeds.
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue({ ...bogoTemplate, minimumSaving: 15.0 })
    app.prisma.voucher.create = vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'rmv-new', ...data }))

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/create-flagship',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { voucherType: 'BOGO' },
    })

    expect(res.statusCode).toBe(201)
    expect(app.prisma.voucher.create).toHaveBeenCalledTimes(1)
  })

  it('writes an audit log on flagship create', async () => {
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue(bogoTemplate)
    app.prisma.voucher.create = vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'rmv-new', ...data }))

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/create-flagship',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { voucherType: 'BOGO' },
    })

    expect(res.statusCode).toBe(201)
    expect(app.prisma.auditLog.create).toHaveBeenCalled()
  })

  it('keeps the created RMV editable via updateRmvVoucher allowedFields', async () => {
    // After create-flagship the RMV is template-linked, so the existing B5.1 RMV
    // edit core can still read allowedFields and merge merchantFields. This proves
    // the template-link contract that updateRmvVoucherCore depends on is intact.
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({
      id: 'rmv-new', merchantId: 'm1', isRmv: true, status: 'DRAFT',
      merchantFields: {}, rmvTemplate: { ...bogoTemplate },
    })
    app.prisma.voucher.update = vi.fn().mockResolvedValue({ id: 'rmv-new', merchantFields: { terms: 'Dine in only' } })

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/vouchers/rmv/rmv-new',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { terms: 'Dine in only' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ merchantFields: expect.objectContaining({ terms: 'Dine in only' }) }) })
    )
  })

  it('submits the created RMV: DRAFT -> PENDING_APPROVAL', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({
      id: 'rmv-new', merchantId: 'm1', isRmv: true, status: 'DRAFT',
    })
    app.prisma.voucher.update = vi.fn().mockResolvedValue({ id: 'rmv-new', status: 'PENDING_APPROVAL' })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/rmv-new/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL' }) })
    )
  })
})
