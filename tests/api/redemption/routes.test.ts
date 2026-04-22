import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import { AppError } from '../../../src/api/shared/errors'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/redemption/service', () => ({
  createRedemption:       vi.fn(),
  verifyRedemption:       vi.fn(),
  listMyRedemptions:      vi.fn(),
  getMyRedemption:        vi.fn(),
  listBranchRedemptions:  vi.fn(),
}))

import {
  createRedemption,
  verifyRedemption,
  listMyRedemptions,
  getMyRedemption,
  listBranchRedemptions,
} from '../../../src/api/redemption/service'

describe('redemption routes', () => {
  let app: FastifyInstance
  let customerToken: string
  let branchToken: string
  let merchantToken: string

  const BRANCH_USER_ID  = 'branch-user-1'
  const MERCHANT_ADMIN_ID = 'merchant-admin-1'
  const BRANCH_ID       = 'branch-1'
  const MERCHANT_ID     = 'merchant-1'

  beforeEach(async () => {
    app = await buildApp()

    app.decorate('prisma', {
      voucherRedemption: {
        create:     vi.fn(),
        findUnique: vi.fn(),
        findMany:   vi.fn(),
        update:     vi.fn(),
        count:      vi.fn(),
      },
      subscription:          { findUnique: vi.fn() },
      voucher:               { findUnique: vi.fn() },
      branch:                { findUnique: vi.fn() },
      userVoucherCycleState: { findUnique: vi.fn(), upsert: vi.fn() },
      auditLog:              { create: vi.fn().mockResolvedValue({}) },
      $transaction:          vi.fn(),
    } as any)

    // Redis returns branch session for BRANCH_USER_ID and merchant session for MERCHANT_ADMIN_ID
    app.decorate('redis', {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === `auth:branch:${BRANCH_USER_ID}`) {
          return Promise.resolve(JSON.stringify({ branchId: BRANCH_ID, merchantId: MERCHANT_ID, isActive: true }))
        }
        if (key === `auth:merchant:${MERCHANT_ADMIN_ID}`) {
          return Promise.resolve(JSON.stringify({ merchantId: MERCHANT_ID, approvalStatus: 'APPROVED', isSuspended: false }))
        }
        return Promise.resolve(null)
      }),
      set:    vi.fn().mockResolvedValue('OK'),
      del:    vi.fn().mockResolvedValue(1),
      incr:   vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    } as any)

    await app.ready()

    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
    branchToken = jwtAny.branch.sign(
      { sub: BRANCH_USER_ID, role: 'branch_staff', deviceId: 'd2', sessionId: 's2' },
      { expiresIn: '1h' }
    )
    merchantToken = jwtAny.merchant.sign(
      { sub: MERCHANT_ADMIN_ID, role: 'merchant', deviceId: 'd3', sessionId: 's3' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  // ------------------------------------------------------------------ //
  // POST /api/v1/redemption — customer creates a redemption
  // ------------------------------------------------------------------ //

  it('POST /api/v1/redemption returns 201 on success (customer token)', async () => {
    const mockRedemption = {
      id: 'r1', redemptionCode: 'ABCDE12345', isValidated: false, redeemedAt: new Date().toISOString(),
    }
    vi.mocked(createRedemption).mockResolvedValue(mockRedemption as any)

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { voucherId: 'v1', branchId: BRANCH_ID, pin: '1234' },
    })

    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).redemptionCode).toBe('ABCDE12345')
    expect(createRedemption).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'user-1',
      { voucherId: 'v1', branchId: BRANCH_ID, pin: '1234' },
      expect.objectContaining({ ipAddress: expect.any(String) })
    )
  })

  it('POST /api/v1/redemption returns 401 without token', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption',
      payload: { voucherId: 'v1', branchId: BRANCH_ID, pin: '1234' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('POST /api/v1/redemption returns 400 when body missing required fields', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { voucherId: 'v1' }, // missing branchId and pin
    })

    expect(res.statusCode).toBe(400)
  })

  it('POST /api/v1/redemption returns 400 when pin is not 4 digits', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { voucherId: 'v1', branchId: BRANCH_ID, pin: '12' },
    })

    expect(res.statusCode).toBe(400)
  })

  // ------------------------------------------------------------------ //
  // GET /api/v1/redemption/my
  // ------------------------------------------------------------------ //

  it('GET /api/v1/redemption/my returns 200 list (customer token)', async () => {
    const mockList = [
      { id: 'r1', redemptionCode: 'AAA', voucher: { id: 'v1', title: 'Test' }, branch: { id: BRANCH_ID, name: 'HQ' } },
    ]
    vi.mocked(listMyRedemptions).mockResolvedValue(mockList as any)

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/redemption/my',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
  })

  it('GET /api/v1/redemption/my returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/redemption/my' })
    expect(res.statusCode).toBe(401)
  })

  // ------------------------------------------------------------------ //
  // GET /api/v1/redemption/my/:id
  // ------------------------------------------------------------------ //

  it('GET /api/v1/redemption/my/:id returns 200 for own redemption', async () => {
    const mockRedemption = {
      id: 'r1', redemptionCode: 'AAA', isValidated: false,
      voucher: { id: 'v1', title: 'Test', terms: 'T&C', merchant: { businessName: 'Biz' } },
      branch:  { id: BRANCH_ID, name: 'HQ', addressLine1: '1 St', city: 'London', postcode: 'SW1A' },
    }
    vi.mocked(getMyRedemption).mockResolvedValue(mockRedemption as any)

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/redemption/my/r1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).id).toBe('r1')
    expect(getMyRedemption).toHaveBeenCalledWith(expect.anything(), 'user-1', 'r1')
  })

  // ------------------------------------------------------------------ //
  // POST /api/v1/redemption/verify
  // ------------------------------------------------------------------ //

  it('POST /api/v1/redemption/verify returns 200 for branch_staff (branch token)', async () => {
    const mockResult = {
      id: 'r1', isValidated: true, validatedAt: new Date().toISOString(),
      validationMethod: 'MANUAL', customer: { name: 'John Smith' },
    }
    vi.mocked(verifyRedemption).mockResolvedValue(mockResult as any)

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${branchToken}` },
      payload: { code: 'ABCDE12345', method: 'MANUAL', branchId: BRANCH_ID },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.isValidated).toBe(true)
    expect(verifyRedemption).toHaveBeenCalledWith(
      expect.anything(),
      'ABCDE12345',
      'MANUAL',
      expect.objectContaining({ role: 'branch', branchId: BRANCH_ID, merchantId: MERCHANT_ID }),
      expect.objectContaining({ ipAddress: expect.any(String) })
    )
  })

  it('POST /api/v1/redemption/verify returns 200 for merchant admin (merchant token)', async () => {
    const mockResult = {
      id: 'r1', isValidated: true, validatedAt: new Date().toISOString(),
      validationMethod: 'QR_SCAN', customer: { name: 'Jane Doe' },
    }
    vi.mocked(verifyRedemption).mockResolvedValue(mockResult as any)
    vi.mocked(app.prisma.branch.findUnique as any).mockResolvedValue({ merchantId: MERCHANT_ID })

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { code: 'XYZ123', method: 'QR_SCAN', branchId: BRANCH_ID },
    })

    expect(res.statusCode).toBe(200)
    expect(verifyRedemption).toHaveBeenCalledWith(
      expect.anything(),
      'XYZ123',
      'QR_SCAN',
      expect.objectContaining({ role: 'merchant', branchId: BRANCH_ID, merchantId: MERCHANT_ID }),
      expect.any(Object)
    )
  })

  it('POST /api/v1/redemption/verify returns 403 for customer role (customer token rejected)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { code: 'ABCDE12345', method: 'MANUAL', branchId: BRANCH_ID },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_ACCESS_DENIED')
  })

  it('POST /api/v1/redemption/verify returns 403 without any token', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      payload: { code: 'ABCDE12345', method: 'MANUAL', branchId: BRANCH_ID },
    })

    expect(res.statusCode).toBe(403)
  })

  it('verify route: requires branchId in body', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${branchToken}` },
      payload: { code: 'ABCDE12345', method: 'MANUAL' }, // missing branchId
    })

    expect(res.statusCode).toBe(400)
  })

  it('verify route: branch staff rejected when body branchId does not match session branchId', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${branchToken}` },
      payload: { code: 'ABCDE12345', method: 'MANUAL', branchId: 'wrong-branch-id' },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_ACCESS_DENIED')
  })

  it('verify route: merchant admin must supply branchId belonging to their merchant', async () => {
    vi.mocked(app.prisma.branch.findUnique as any).mockResolvedValue({ merchantId: 'other-merchant-id' })

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { code: 'XYZ123', method: 'QR_SCAN', branchId: 'branch-owned-by-other' },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_ACCESS_DENIED')
  })

  // ------------------------------------------------------------------ //
  // GET /api/v1/branch/:branchId/redemptions
  // ------------------------------------------------------------------ //

  it('GET /api/v1/branch/:branchId/redemptions returns 200 for branch_staff accessing own branch', async () => {
    const mockResult = { total: 1, items: [{ id: 'r1', redemptionCode: 'AAA' }] }
    vi.mocked(listBranchRedemptions).mockResolvedValue(mockResult as any)

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/branch/${BRANCH_ID}/redemptions`,
      headers: { authorization: `Bearer ${branchToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.total).toBe(1)
    expect(listBranchRedemptions).toHaveBeenCalledWith(expect.anything(), BRANCH_ID, expect.objectContaining({ limit: 10, offset: 0 }))
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 403 when staff accesses wrong branch', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/branch/wrong-branch-id/redemptions',
      headers: { authorization: `Bearer ${branchToken}` },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_ACCESS_DENIED')
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 200 for merchant admin (branch owned by same merchant)', async () => {
    const mockResult = { total: 2, items: [] }
    vi.mocked(listBranchRedemptions).mockResolvedValue(mockResult as any)
    vi.mocked(app.prisma.branch.findUnique as any).mockResolvedValue({ merchantId: MERCHANT_ID })

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/branch/${BRANCH_ID}/redemptions`,
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).total).toBe(2)
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 403 for merchant admin accessing branch owned by different merchant', async () => {
    vi.mocked(app.prisma.branch.findUnique as any).mockResolvedValue({ merchantId: 'other-merchant-id' })

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/branch/${BRANCH_ID}/redemptions`,
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_ACCESS_DENIED')
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 403 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/branch/${BRANCH_ID}/redemptions`,
    })

    expect(res.statusCode).toBe(403)
  })

  // ------------------------------------------------------------------ //
  // POST /api/v1/redemption/verify — staff verify rate limit
  // ------------------------------------------------------------------ //

  it('verify route: enforces 20-failure-per-5min rate limit per (actorId, branchId)', async () => {
    // Seed the rate limit counter at the limit for this actor+branch
    const rateKey = `verify:fail:${BRANCH_USER_ID}:${BRANCH_ID}`
    vi.mocked(app.redis.get as any).mockImplementation((key: string) => {
      if (key === `auth:branch:${BRANCH_USER_ID}`) {
        return Promise.resolve(JSON.stringify({ branchId: BRANCH_ID, merchantId: MERCHANT_ID, isActive: true }))
      }
      if (key === rateKey) {
        return Promise.resolve('20')
      }
      return Promise.resolve(null)
    })

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${branchToken}` },
      payload: { code: 'ABCDE12345', method: 'MANUAL', branchId: BRANCH_ID },
    })

    expect(res.statusCode).toBe(429)
    expect(JSON.parse(res.body).error.code).toBe('STAFF_VERIFY_RATE_LIMIT_EXCEEDED')
  })

  it('verify route: increments counter on failure, does NOT increment on success', async () => {
    // First call: invalid code → verifyRedemption throws AppError → counter incremented
    vi.mocked(verifyRedemption).mockRejectedValueOnce(new AppError('REDEMPTION_NOT_FOUND'))

    const res1 = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${branchToken}` },
      payload: { code: 'BADCODE', method: 'MANUAL', branchId: BRANCH_ID },
    })
    expect(res1.statusCode).toBe(404)
    expect(app.redis.incr).toHaveBeenCalledTimes(1)

    // Second call: valid code → counter NOT incremented again
    vi.mocked(verifyRedemption).mockResolvedValueOnce({
      id: 'r1', isValidated: true, validatedAt: new Date().toISOString(),
      validationMethod: 'MANUAL', customer: { name: 'John Smith' },
    } as any)

    const incrCallsBefore = vi.mocked(app.redis.incr).mock.calls.length
    const res2 = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${branchToken}` },
      payload: { code: 'ABCDE12345', method: 'MANUAL', branchId: BRANCH_ID },
    })
    expect(res2.statusCode).toBe(200)
    expect(vi.mocked(app.redis.incr).mock.calls.length).toBe(incrCallsBefore)
  })
})
