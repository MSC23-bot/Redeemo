import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant onboarding routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      merchantContract: { findUnique: vi.fn(), create: vi.fn() },
      branch: { count: vi.fn() },
      voucher: { count: vi.fn() },
      adminApproval: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/onboarding/checklist returns computed state', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'NOT_SIGNED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)
    app.prisma.voucher.count = vi.fn().mockResolvedValue(0)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/onboarding/checklist',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.branch_created).toBe(true)
    expect(body.contract_signed).toBe(false)
    expect(body.rmv_configured).toBe(false)
    expect(body.all_complete).toBe(false)
  })

  it('GET /api/v1/merchant/onboarding/contract returns contract text and version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/onboarding/contract',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.version).toBe('1.0')
    expect(typeof body.text).toBe('string')
    expect(body.text.length).toBeGreaterThan(10)
  })

  it('POST /api/v1/merchant/onboarding/contract/accept records acceptance', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'NOT_SIGNED' })
    app.prisma.merchantContract.create = vi.fn().mockResolvedValue({})
    app.prisma.merchant.update = vi.fn().mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/contract/accept',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { version: '1.0' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchantContract.create).toHaveBeenCalled()
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contractStatus: 'SIGNED' }) })
    )
  })

  it('POST /api/v1/merchant/onboarding/contract/accept returns 409 if already signed', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'SIGNED' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/contract/accept',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { version: '1.0' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('CONTRACT_ALREADY_SIGNED')
  })

  it('POST /api/v1/merchant/onboarding/submit returns 409 when gates incomplete', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'NOT_SIGNED', status: 'REGISTERED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(0)
    app.prisma.voucher.count = vi.fn().mockResolvedValue(0)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('ONBOARDING_GATES_INCOMPLETE')
  })

  it('POST /api/v1/merchant/onboarding/submit succeeds when all gates pass', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'SIGNED', status: 'REGISTERED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)
    app.prisma.voucher.count = vi.fn().mockResolvedValue(2)
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' }) })
    )
    expect(app.prisma.adminApproval.create).toHaveBeenCalled()
  })
})
