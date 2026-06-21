import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// B2 lookup-by-code preview. Read-only: never writes. Cross-tenant codes are
// masked as REDEMPTION_NOT_FOUND so existence is never leaked. The code is
// normalised (uppercase + strip spaces) before the unique lookup.

describe('GET /api/v1/merchant/redemptions/lookup (B2 preview)', () => {
  let app: FastifyInstance
  let merchantToken: string

  function dbRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'r1',
      redemptionCode: 'A7K2P9X4',
      redeemedAt: new Date('2026-06-21T10:00:00.000Z'),
      isValidated: false,
      validatedAt: null,
      validationMethod: null,
      estimatedSaving: 12.5,
      voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO', merchantId: 'm1' },
      branch: { id: 'b1', name: 'Main Branch' },
      user: { firstName: 'Sarah', lastName: 'Khan' },
      validatedBy: null,
      ...overrides,
    }
  }

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'ACTIVE', businessName: 'Acme' } }) },
      voucherRedemption: { findUnique: vi.fn().mockResolvedValue(dbRow()), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    }
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  function get(url: string) {
    return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${merchantToken}` } })
  }
  function findUniqueArg() { return (app.prisma.voucherRedemption.findUnique as any).mock.calls[0][0] }

  it('returns the merchant-safe preview row for a valid code', async () => {
    const res = await get('/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({
      id: 'r1',
      redemptionCode: 'A7K2P9X4',
      customerName: 'Sarah K.',
      status: 'AWAITING_VALIDATION',
      voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO' },
      branch: { id: 'b1', name: 'Main Branch' },
    })
  })

  it('includes the validation details when already validated', async () => {
    app.prisma.voucherRedemption.findUnique = vi.fn().mockResolvedValue(dbRow({
      isValidated: true,
      validatedAt: new Date('2026-06-21T11:00:00.000Z'),
      validationMethod: 'MANUAL',
      validatedBy: null,
    }))
    const res = await get('/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('VALIDATED')
    expect(body.validatedAt).toBe('2026-06-21T11:00:00.000Z')
    expect(body.validationMethod).toBe('MANUAL')
    expect(body.validatedByLabel).toBe('Validated in the portal')
  })

  it('never leaks merchantId / redemptionPin / customer contact in the preview', async () => {
    const res = await get('/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    expect(res.body).not.toContain('merchantId')
    expect(res.body).not.toContain('redemptionPin')
    expect(res.body).not.toContain('email')
    expect(res.body).not.toContain('phone')
    expect(res.body).not.toContain('Khan')
  })

  it('normalises the code (lowercase + spaces) before the unique lookup', async () => {
    await get('/api/v1/merchant/redemptions/lookup?code=a7k2%20p9x4')
    expect(findUniqueArg().where).toEqual({ redemptionCode: 'A7K2P9X4' })
  })

  it('is read-only: never calls update', async () => {
    await get('/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    expect(app.prisma.voucherRedemption.update).not.toHaveBeenCalled()
  })

  it('an unknown code returns REDEMPTION_NOT_FOUND', async () => {
    app.prisma.voucherRedemption.findUnique = vi.fn().mockResolvedValue(null)
    const res = await get('/api/v1/merchant/redemptions/lookup?code=ZZZZZZZZ')
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('REDEMPTION_NOT_FOUND')
  })

  it('a code belonging to ANOTHER merchant is masked as REDEMPTION_NOT_FOUND (cross-tenant)', async () => {
    app.prisma.voucherRedemption.findUnique = vi.fn().mockResolvedValue(dbRow({
      voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO', merchantId: 'm-other' },
    }))
    const res = await get('/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('REDEMPTION_NOT_FOUND')
    // Masked, not a different/leaky code.
    expect(JSON.parse(res.body).error.code).not.toBe('MERCHANT_MISMATCH')
  })

  it('uses the curated select WITH merchantId (for the ownership check) but no redemptionPin', async () => {
    await get('/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    const select = findUniqueArg().select
    expect(select.voucher.select).toMatchObject({ merchantId: true, id: true, title: true, type: true })
    expect(JSON.stringify(select)).not.toContain('redemptionPin')
  })

  it('a suspended merchant gets MERCHANT_SUSPENDED on the preview (live DB)', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue({
      id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'SUSPENDED', businessName: 'Acme' },
    })
    const res = await get('/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
  })
})
