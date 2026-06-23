import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Merchant-wide redemptions list (B1). Mirrors the voucher-rmv harness:
// resolveAdminMerchant -> merchantMembership.findFirst gives merchantId AND
// enforces the SEC-M2 live suspend block. The route Zod-parses the query into a
// `where` and pages the curated select.

describe('GET /api/v1/merchant/redemptions (B1 list)', () => {
  let app: FastifyInstance
  let merchantToken: string

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'r1',
      redemptionCode: 'A7K2P9X4',
      redeemedAt: new Date('2026-06-21T10:00:00.000Z'),
      isValidated: false,
      validatedAt: null,
      validationMethod: null,
      estimatedSaving: 12.5,
      voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO' },
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
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'ACTIVE', businessName: 'Acme' } }),
        // Staff & Access PR-B: redemptions routes resolve via resolveMerchantContext
        // (getActiveMembership -> findMany). OWNER + allBranches -> all-branches read.
        findMany: vi.fn().mockResolvedValue([{ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] }]),
      },
      voucherRedemption: { findMany: vi.fn().mockResolvedValue([row()]), count: vi.fn().mockResolvedValue(1), findUnique: vi.fn() },
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

  // Read the `where` arg of the findMany call.
  function findManyArg() { return (app.prisma.voucherRedemption.findMany as any).mock.calls[0][0] }
  function countArg() { return (app.prisma.voucherRedemption.count as any).mock.calls[0][0] }

  it('returns the paginated merchant-safe envelope', async () => {
    const res = await get('/api/v1/merchant/redemptions')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({ total: 1, limit: 25, offset: 0 })
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      id: 'r1',
      redemptionCode: 'A7K2P9X4',
      customerName: 'Sarah K.',
      status: 'AWAITING_VALIDATION',
      estimatedSaving: 12.5,
      voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO' },
      branch: { id: 'b1', name: 'Main Branch' },
    })
  })

  it('formats customerName as first + last initial, never a full surname / email / phone', async () => {
    const res = await get('/api/v1/merchant/redemptions')
    const body = JSON.parse(res.body)
    expect(body.items[0].customerName).toBe('Sarah K.')
    expect(res.body).not.toContain('Khan')
    expect(res.body).not.toContain('email')
    expect(res.body).not.toContain('phone')
  })

  it('scopes the where to branch.merchantId (IDOR boundary) and excludes isTestData by default', async () => {
    await get('/api/v1/merchant/redemptions')
    const where = findManyArg().where
    expect(where).toMatchObject({ branch: { merchantId: 'm1' }, isTestData: false })
    // count must share the SAME where (so the total matches the page).
    expect(countArg().where).toMatchObject({ branch: { merchantId: 'm1' }, isTestData: false })
  })

  it('uses the curated select with NO redemptionPin; branch select is {id,name}', async () => {
    await get('/api/v1/merchant/redemptions')
    const select = findManyArg().select
    const json = JSON.stringify(select)
    expect(json).not.toContain('redemptionPin')
    expect(select.branch.select).toEqual({ id: true, name: true })
    expect(select.user.select).toEqual({ firstName: true, lastName: true })
    expect(json).not.toContain('email')
    expect(json).not.toContain('phone')
  })

  it('orders by redeemedAt desc and honours limit/offset', async () => {
    await get('/api/v1/merchant/redemptions?limit=10&offset=20')
    const arg = findManyArg()
    expect(arg.orderBy).toEqual({ redeemedAt: 'desc' })
    expect(arg.take).toBe(10)
    expect(arg.skip).toBe(20)
  })

  it('status=awaiting filter sets isValidated=false', async () => {
    await get('/api/v1/merchant/redemptions?status=awaiting')
    expect(findManyArg().where.isValidated).toBe(false)
  })

  it('status=validated filter sets isValidated=true', async () => {
    await get('/api/v1/merchant/redemptions?status=validated')
    expect(findManyArg().where.isValidated).toBe(true)
  })

  it('branchId filter is applied (AND branch.merchantId so a cross-tenant branchId yields empty)', async () => {
    await get('/api/v1/merchant/redemptions?branchId=b9')
    const where = findManyArg().where
    expect(where.branchId).toBe('b9')
    expect(where.branch).toEqual({ merchantId: 'm1' })
  })

  it('from/to filters shape redeemedAt with gte/lte', async () => {
    await get('/api/v1/merchant/redemptions?from=2026-06-01T00:00:00.000Z&to=2026-06-30T00:00:00.000Z')
    const where = findManyArg().where
    expect(where.redeemedAt.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'))
    expect(where.redeemedAt.lte).toEqual(new Date('2026-06-30T00:00:00.000Z'))
  })

  it('voucherType filter shapes voucher.is.type', async () => {
    await get('/api/v1/merchant/redemptions?voucherType=BOGO')
    expect(findManyArg().where.voucher).toEqual({ is: { type: 'BOGO' } })
  })

  it('an invalid voucherType is rejected with a clean 400 (never reaches Prisma as a 500)', async () => {
    const res = await get('/api/v1/merchant/redemptions?voucherType=NONSENSE')
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
    expect(app.prisma.voucherRedemption.findMany).not.toHaveBeenCalled()
  })

  it('code filter prefixes the normalised redemptionCode', async () => {
    await get('/api/v1/merchant/redemptions?code=a7k2')
    expect(findManyArg().where.redemptionCode).toEqual({ startsWith: 'A7K2' })
  })

  // Day-2 Vouchers A1: voucherId filter (additive). Scopes to that voucher AND
  // keeps the branch.merchantId IDOR boundary, so a cross-tenant voucher yields empty.
  it('voucherId filter scopes to that voucher (AND branch.merchantId)', async () => {
    await get('/api/v1/merchant/redemptions?voucherId=v1')
    const where = findManyArg().where
    expect(where.voucherId).toBe('v1')
    expect(where.branch).toEqual({ merchantId: 'm1' })
  })

  it('a non-RMV (REUSABLE) redemption row renders through the same path (voucher-type-generic)', async () => {
    app.prisma.voucherRedemption.findMany = vi.fn().mockResolvedValue([
      row({ voucher: { id: 'v9', title: 'Coffee club', type: 'REUSABLE' } }),
    ])
    const res = await get('/api/v1/merchant/redemptions')
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).items[0].voucher.type).toBe('REUSABLE')
  })

  it('a suspended merchant (resolveMerchantContext throws) returns MERCHANT_SUSPENDED', async () => {
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue([{
      id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'SUSPENDED', businessName: 'Acme' }, branches: [],
    }])
    const res = await get('/api/v1/merchant/redemptions')
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
  })
})
