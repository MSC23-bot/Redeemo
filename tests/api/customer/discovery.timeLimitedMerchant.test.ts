import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getCustomerMerchant } from '../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter, log: [{ emit: 'event', level: 'query' }] })

let merchantId: string
let userId: string
let tlVoucherId: string
let regVoucherId: string

const TEST_NOW = new Date('2026-05-11T12:00:00.000Z') // Mon 13:00 BST

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { businessName: 'TEST §M4a-5', status: 'ACTIVE' },
  })
  merchantId = m.id
  await prisma.branch.create({
    data: {
      merchantId, name: 'TEST §M4a-5 branch', addressLine1: 'X',
      city: 'X', postcode: 'X1 1XX', country: 'United Kingdom', isMainBranch: true,
    },
  })
  const u = await prisma.user.create({
    data: {
      email: `m4a5-${Date.now()}@example.com`, passwordHash: 'p',
      firstName: 'T', lastName: 'M4a5',
    },
  })
  userId = u.id

  const tl = await prisma.voucher.create({
    data: {
      merchantId, code: `M4A5-TL-${Date.now()}`, title: 'M4a-5 lunch BOGO',
      type: 'TIME_LIMITED', estimatedSaving: 8.5, status: 'ACTIVE', approvalStatus: 'APPROVED',
      availabilityWindows: {
        create: [1, 2, 3, 4, 5].map(d => ({ dayOfWeek: d, openTime: '11:00', closeTime: '15:00' })),
      },
    },
  })
  tlVoucherId = tl.id

  const reg = await prisma.voucher.create({
    data: {
      merchantId, code: `M4A5-REG-${Date.now()}`, title: 'M4a-5 regular',
      type: 'FREEBIE', estimatedSaving: 5, status: 'ACTIVE', approvalStatus: 'APPROVED',
    },
  })
  regVoucherId = reg.id
})

afterAll(async () => {
  await prisma.voucherAvailabilityWindow.deleteMany({ where: { voucher: { merchantId } } })
  await prisma.voucherRedemption.deleteMany({ where: { userId } })
  await prisma.voucher.deleteMany({ where: { merchantId } })
  await prisma.branch.deleteMany({ where: { merchantId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.merchant.delete({ where: { id: merchantId } })
  await prisma.$disconnect()
})

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(TEST_NOW) })
afterEach(()  => { vi.useRealTimers() })

describe('getCustomerMerchant — TIME_LIMITED voucher rows (M4a-5)', () => {
  it('voucher rows carry availabilityWindows / currentWindow / nextWindow / redeemedWindow', async () => {
    const merchant = await getCustomerMerchant(prisma, merchantId, userId, {})
    const tlRow  = merchant.vouchers.find(v => v.id === tlVoucherId)!
    const regRow = merchant.vouchers.find(v => v.id === regVoucherId)!

    expect(tlRow.availabilityWindows).toHaveLength(5)
    expect(tlRow.currentWindow).toEqual({
      startsAt: '2026-05-11T10:00:00.000Z',
      endsAt:   '2026-05-11T14:00:00.000Z',
    })
    expect(tlRow.nextWindow).toEqual({
      startsAt: '2026-05-12T10:00:00.000Z',
      endsAt:   '2026-05-12T14:00:00.000Z',
    })
    expect(tlRow).toHaveProperty('redeemedWindow')
    expect(typeof tlRow.redeemedWindow).not.toBe('boolean')

    expect(regRow.availabilityWindows).toEqual([])
    expect(regRow.currentWindow).toBeNull()
    expect(regRow.nextWindow).toBeNull()
    expect(regRow.redeemedWindow).toBeNull()
  })

  it('payload size is reasonable for a merchant with multiple TIME_LIMITED vouchers', async () => {
    const merchant = await getCustomerMerchant(prisma, merchantId, userId, {})
    const sizeBytes = JSON.stringify(merchant).length
    expect(sizeBytes).toBeLessThan(50_000)
  })

  it('NOT N+1 — merchant-profile fetch issues exactly ONE redemption query (groupBy) regardless of voucher count', async () => {
    // The shared beforeEach installs fake timers; Prisma's PgPool timeouts
    // hang on fake timers.  Use real timers for the DB-heavy section, then
    // restore fake (cleared via afterEach).
    vi.useRealTimers()

    // Create 8 additional TIME_LIMITED vouchers so the merchant has 9 TL + 1 regular = 10 total.
    const extraIds: string[] = []
    for (let i = 0; i < 8; i++) {
      const v = await prisma.voucher.create({
        data: {
          merchantId, code: `M4A5-N-${i}-${Date.now()}`, title: `M4a-5 batch ${i}`,
          type: 'TIME_LIMITED', estimatedSaving: 5, status: 'ACTIVE', approvalStatus: 'APPROVED',
          availabilityWindows: { create: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }] },
        },
      })
      extraIds.push(v.id)
    }

    let voucherRedemptionQueryCount = 0
    const handler = (e: any) => {
      const query: string | undefined = e?.query
      if (typeof query === 'string'
          && /from\s+"VoucherRedemption"|"public"\."VoucherRedemption"/i.test(query)) {
        voucherRedemptionQueryCount++
      }
    }
    prisma.$on('query' as any, handler)

    await getCustomerMerchant(prisma, merchantId, userId, {})

    // Locked contract: ONE groupBy redemption query for the entire voucher list.
    expect(voucherRedemptionQueryCount).toBe(1)

    // Cleanup
    await prisma.voucherAvailabilityWindow.deleteMany({ where: { voucherId: { in: extraIds } } })
    await prisma.voucher.deleteMany({ where: { id: { in: extraIds } } })
  }, 30_000)
})
