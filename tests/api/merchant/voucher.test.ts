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
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
        // Staff & Access PR-B: voucher service now resolves via resolveMerchantContext
        // (getActiveMembership -> findMany). OWNER row -> voucher power by role.
        findMany: vi.fn().mockResolvedValue([{ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] }]),
      },
      voucher: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      // Day-2 Vouchers A4: submitVoucher now creates/reopens the VOUCHER approval
      // inside a $transaction. The mock runs the callback against the same mock.
      adminApproval: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'appr1' }),
        update: vi.fn().mockResolvedValue({ id: 'appr1' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
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

  // Nullable-clear contract (spec 2026-07-05, D1): PATCH { imageUrl: null } /
  // { expiryDate: null } CLEAR the saved column. The two fields are decided by
  // fully independent presence checks - every pin below also asserts the OTHER
  // field's key is absent, so a coupled-field regression (the originating
  // proposal's defect) would fail immediately.
  describe('nullable-clear contract (imageUrl / expiryDate)', () => {
    it('PATCH { imageUrl: null } on a DRAFT with a saved photo clears imageUrl and leaves expiryDate untouched', async () => {
      app.prisma.voucher.findFirst = vi
        .fn()
        .mockResolvedValue({ ...mockVoucher, status: 'DRAFT', imageUrl: 'https://cdn.example/saved.png' })
      app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockVoucher, imageUrl: null })
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/merchant/vouchers/v1',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { imageUrl: null },
      })
      expect(res.statusCode).toBe(200)
      expect(app.prisma.voucher.update).toHaveBeenCalledTimes(1)
      const arg = (app.prisma.voucher.update as any).mock.calls[0][0]
      expect(arg.data.imageUrl).toBeNull()
      expect(arg.data).not.toHaveProperty('expiryDate')
    })

    it('PATCH { expiryDate: null } on a DRAFT with a saved date clears expiryDate (literal null) and leaves imageUrl untouched', async () => {
      app.prisma.voucher.findFirst = vi
        .fn()
        .mockResolvedValue({ ...mockVoucher, status: 'DRAFT', expiryDate: new Date('2026-12-01T00:00:00.000Z') })
      app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockVoucher, expiryDate: null })
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/merchant/vouchers/v1',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { expiryDate: null },
      })
      expect(res.statusCode).toBe(200)
      expect(app.prisma.voucher.update).toHaveBeenCalledTimes(1)
      const arg = (app.prisma.voucher.update as any).mock.calls[0][0]
      // Strict literal null - not a Date instance, not the string "null".
      expect(arg.data.expiryDate).toBeNull()
      expect(arg.data.expiryDate).not.toBeInstanceOf(Date)
      expect(arg.data).not.toHaveProperty('imageUrl')
    })

    it('PATCH { title } only omits both imageUrl and expiryDate entirely (omission = preserve)', async () => {
      app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockVoucher, status: 'DRAFT' })
      app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockVoucher, title: 'Updated title' })
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/merchant/vouchers/v1',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Updated title' },
      })
      expect(res.statusCode).toBe(200)
      const arg = (app.prisma.voucher.update as any).mock.calls[0][0]
      expect(arg.data).not.toHaveProperty('imageUrl')
      expect(arg.data).not.toHaveProperty('expiryDate')
    })

    it('PATCH with real replacement values for both: imageUrl passes through, expiryDate becomes a Date', async () => {
      app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockVoucher, status: 'DRAFT' })
      app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockVoucher })
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/merchant/vouchers/v1',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { imageUrl: 'https://cdn.example/new.png', expiryDate: '2026-12-25T00:00:00.000Z' },
      })
      expect(res.statusCode).toBe(200)
      const arg = (app.prisma.voucher.update as any).mock.calls[0][0]
      expect(arg.data.imageUrl).toBe('https://cdn.example/new.png')
      expect(arg.data.expiryDate).toBeInstanceOf(Date)
      expect(arg.data.expiryDate.toISOString()).toBe('2026-12-25T00:00:00.000Z')
    })

    it('PATCH { imageUrl: "not-a-url" } is rejected 400 VALIDATION_ERROR; update is never called', async () => {
      app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockVoucher, status: 'DRAFT' })
      app.prisma.voucher.update = vi.fn()
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/merchant/vouchers/v1',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { imageUrl: 'not-a-url' },
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
      expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    })

    it('PATCH with a malformed expiryDate string is rejected 400 VALIDATION_ERROR; update is never called', async () => {
      app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockVoucher, status: 'DRAFT' })
      app.prisma.voucher.update = vi.fn()
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/merchant/vouchers/v1',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { expiryDate: 'not-a-date' },
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
      expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    })

    it('POST create with { imageUrl: null, expiryDate: null } is 201 and persists identically to omission', async () => {
      app.prisma.voucher.create = vi.fn().mockResolvedValue({ ...mockVoucher })
      const resNull = await app.inject({
        method: 'POST',
        url: '/api/v1/merchant/vouchers',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { type: 'DISCOUNT_PERCENT', title: '10% off', estimatedSaving: 5.0, imageUrl: null, expiryDate: null },
      })
      expect(resNull.statusCode).toBe(201)
      const nullArg = (app.prisma.voucher.create as any).mock.calls[0][0]

      ;(app.prisma.voucher.create as any).mockClear()
      const resOmit = await app.inject({
        method: 'POST',
        url: '/api/v1/merchant/vouchers',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { type: 'DISCOUNT_PERCENT', title: '10% off', estimatedSaving: 5.0 },
      })
      expect(resOmit.statusCode).toBe(201)
      const omitArg = (app.prisma.voucher.create as any).mock.calls[0][0]

      // create-with-null is DEFINED as identical to create-with-omission in
      // PERSISTED effect (plan §3 / §9): a nullable column with no default
      // stores NULL either way, whether the create call passes `null` or
      // never mentions the key. The literal JS values handed to Prisma are
      // NOT strictly `toBe`-equal (imageUrl: null vs imageUrl: undefined;
      // expiryDate stays undefined in BOTH cases because service.ts:332 is a
      // truthy guard) - that distinction is real but immaterial to Prisma,
      // which writes NULL for both `null` and an omitted-with-no-default key.
      expect(nullArg.data.imageUrl == null).toBe(true)
      expect(omitArg.data.imageUrl == null).toBe(true)
      expect(nullArg.data.expiryDate).toBeUndefined()
      expect(omitArg.data.expiryDate).toBeUndefined()
    })

    it('PATCH { imageUrl: null } on a non-DRAFT (ACTIVE) voucher is VOUCHER_NOT_EDITABLE; update never called', async () => {
      app.prisma.voucher.findFirst = vi
        .fn()
        .mockResolvedValue({ ...mockVoucher, status: 'ACTIVE', imageUrl: 'https://cdn.example/saved.png' })
      app.prisma.voucher.update = vi.fn()
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/merchant/vouchers/v1',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { imageUrl: null },
      })
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_EDITABLE')
      expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    })
  })
})
