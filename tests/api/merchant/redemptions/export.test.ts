import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import {
  getMerchantRedemptionsForExport,
  redemptionsToCsv,
  buildRedemptionWhere,
} from '../../../../src/api/merchant/redemptions/service'
import { toMerchantRedemptionRow } from '../../../../src/api/merchant/redemptions/format'

function dbRow(overrides: Record<string, unknown> = {}) {
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

describe('getMerchantRedemptionsForExport (cap + truncation)', () => {
  it('reuses buildRedemptionWhere (same filters as B1) and fetches CAP+1 to detect truncation', async () => {
    const findMany = vi.fn().mockResolvedValue([dbRow()])
    const prisma: any = { voucherRedemption: { findMany } }
    await getMerchantRedemptionsForExport(prisma, 'm1', { status: 'validated' })
    const arg = findMany.mock.calls[0][0]
    // status=validated must shape isValidated=true (filter parity with B1).
    expect(arg.where).toMatchObject({ branch: { merchantId: 'm1' }, isTestData: false, isValidated: true })
    expect(arg.orderBy).toEqual({ redeemedAt: 'desc' })
    // CAP+1 = 50001 (the +1 detects truncation).
    expect(arg.take).toBe(50001)
  })

  it('not truncated when rows <= cap', async () => {
    const findMany = vi.fn().mockResolvedValue([dbRow(), dbRow({ id: 'r2' })])
    const prisma: any = { voucherRedemption: { findMany } }
    const { rows, truncated } = await getMerchantRedemptionsForExport(prisma, 'm1', {})
    expect(truncated).toBe(false)
    expect(rows).toHaveLength(2)
    expect(rows[0].customerName).toBe('Sarah K.')
  })

  it('truncated=true and rows sliced to the cap when the +1 row is returned', async () => {
    // Build CAP+1 minimal rows to trip the boundary.
    const CAP = 50000
    const many = Array.from({ length: CAP + 1 }, (_, i) => dbRow({ id: `r${i}` }))
    const findMany = vi.fn().mockResolvedValue(many)
    const prisma: any = { voucherRedemption: { findMany } }
    const { rows, truncated } = await getMerchantRedemptionsForExport(prisma, 'm1', {})
    expect(truncated).toBe(true)
    expect(rows).toHaveLength(CAP)
  })
})

describe('redemptionsToCsv (privacy-safe columns)', () => {
  const row = toMerchantRedemptionRow(dbRow())

  it('emits the privacy-safe header (no email/phone/PIN/raw-id headers)', () => {
    const csv = redemptionsToCsv([row], false)
    const header = csv.split('\r\n')[0]
    expect(header).toBe('"Redemption code","Voucher","Type","Branch","Customer","Redeemed at","Status","Validated at","Method","Saving (GBP)"')
    expect(header.toLowerCase()).not.toContain('email')
    expect(header.toLowerCase()).not.toContain('phone')
    expect(header.toLowerCase()).not.toContain('pin')
  })

  it('emits one quote-escaped data row with first + last initial (never a full surname)', () => {
    const csv = redemptionsToCsv([row], false)
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('"A7K2P9X4","Half-price pizza","BOGO","Main Branch","Sarah K.","2026-06-21T10:00:00.000Z","AWAITING_VALIDATION","","","12.50"')
    expect(csv).not.toContain('Khan')
  })

  it('quote-escapes embedded quotes and commas in cell values', () => {
    const tricky = toMerchantRedemptionRow(dbRow({
      voucher: { id: 'v2', title: 'Buy "one", get one', type: 'BOGO' },
      branch: { id: 'b2', name: 'High St, Unit 4' },
    }))
    const csv = redemptionsToCsv([tricky], false)
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine).toContain('"Buy ""one"", get one"')
    expect(dataLine).toContain('"High St, Unit 4"')
  })

  it('renders validated rows with the validatedAt + method columns populated', () => {
    const validated = toMerchantRedemptionRow(dbRow({
      isValidated: true,
      validatedAt: new Date('2026-06-21T11:00:00.000Z'),
      validationMethod: 'MANUAL',
      validatedBy: null,
    }))
    const dataLine = redemptionsToCsv([validated], false).split('\r\n')[1]
    expect(dataLine).toContain('"VALIDATED"')
    expect(dataLine).toContain('"2026-06-21T11:00:00.000Z"')
    expect(dataLine).toContain('"MANUAL"')
  })

  it('appends a truncation note row when truncated', () => {
    const csv = redemptionsToCsv([row], true)
    const lines = csv.split('\r\n')
    expect(lines[lines.length - 1]).toBe('"Export truncated at 50000 rows. Narrow the filters for a complete export."')
  })

  it('does NOT append a truncation note when not truncated', () => {
    const csv = redemptionsToCsv([row], false)
    expect(csv).not.toContain('truncated')
  })

  it('saving column is fixed to 2dp (GBP)', () => {
    const r = toMerchantRedemptionRow(dbRow({ estimatedSaving: 7 }))
    const dataLine = redemptionsToCsv([r], false).split('\r\n')[1]
    expect(dataLine.endsWith('"7.00"')).toBe(true)
  })
})

// buildRedemptionWhere is shared by B1 and B4: a direct parity pin.
describe('buildRedemptionWhere (B1/B4 filter parity)', () => {
  it('always scopes to branch.merchantId + isTestData:false', () => {
    expect(buildRedemptionWhere('m1', {})).toEqual({ branch: { merchantId: 'm1' }, isTestData: false })
  })
  it('status=validated -> isValidated:true', () => {
    expect(buildRedemptionWhere('m1', { status: 'validated' }).isValidated).toBe(true)
  })
})

describe('GET /api/v1/merchant/redemptions/export.csv (route)', () => {
  let app: FastifyInstance
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'ACTIVE', businessName: 'Acme' } }) },
      voucherRedemption: { findMany: vi.fn().mockResolvedValue([dbRow()]), count: vi.fn(), findUnique: vi.fn() },
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

  it('returns a text/csv attachment with the privacy-safe header + data row', async () => {
    const res = await get('/api/v1/merchant/redemptions/export.csv')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.headers['content-disposition']).toContain('redemptions.csv')
    expect(res.body.split('\r\n')[0]).toContain('Redemption code')
    expect(res.body).toContain('Sarah K.')
    expect(res.body).not.toContain('Khan')
    expect(res.body).not.toContain('redemptionPin')
  })

  it('honours the B1 filters (status=validated shapes the where)', async () => {
    await get('/api/v1/merchant/redemptions/export.csv?status=validated')
    const arg = (app.prisma.voucherRedemption.findMany as any).mock.calls[0][0]
    expect(arg.where.isValidated).toBe(true)
    // export has NO pagination.
    expect(arg.skip).toBeUndefined()
  })

  it('a suspended merchant gets MERCHANT_SUSPENDED on export', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue({
      id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'SUSPENDED', businessName: 'Acme' },
    })
    const res = await get('/api/v1/merchant/redemptions/export.csv')
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
  })
})
