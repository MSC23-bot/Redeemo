import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getCustomerVoucher } from '../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

let merchantId: string
let branchId:   string
let userId:     string
let timeLimitedVoucherId: string
let regularVoucherId:     string

// All tests in this file use vi.useFakeTimers + vi.setSystemTime so window-
// state assertions are deterministic across CI runs and developer clocks.
// Pin `now` to a Monday 13:00 BST inside the lunch window:
//   2026-05-11 13:00 BST = 2026-05-11 12:00 UTC
const TEST_NOW = new Date('2026-05-11T12:00:00.000Z')

beforeAll(async () => {
  const merchant = await prisma.merchant.create({
    data: { businessName: 'TEST §M4a-4 merchant', status: 'ACTIVE' },
  })
  merchantId = merchant.id

  const branch = await prisma.branch.create({
    data: {
      merchantId, name: 'TEST §M4a-4 branch', addressLine1: 'X', city: 'X',
      postcode: 'X1 1XX', country: 'United Kingdom', isMainBranch: true,
    },
  })
  branchId = branch.id

  const user = await prisma.user.create({
    data: {
      email: `m4a4-${Date.now()}@example.com`,
      passwordHash: 'placeholder', firstName: 'Test', lastName: 'M4a4',
    },
  })
  userId = user.id

  // TIME_LIMITED voucher with a Mon-Fri 11-3 window
  const tl = await prisma.voucher.create({
    data: {
      merchantId,
      code: `M4A4-TL-${Date.now()}`,
      title: 'M4a-4 lunch BOGO',
      type: 'TIME_LIMITED',
      estimatedSaving: 8.50,
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      availabilityWindows: {
        create: [1, 2, 3, 4, 5].map(d => ({
          dayOfWeek: d, openTime: '11:00', closeTime: '15:00',
        })),
      },
    },
  })
  timeLimitedVoucherId = tl.id

  // Regular FREEBIE for the negative pin
  const reg = await prisma.voucher.create({
    data: {
      merchantId, code: `M4A4-REG-${Date.now()}`, title: 'M4a-4 regular',
      type: 'FREEBIE', estimatedSaving: 5, status: 'ACTIVE', approvalStatus: 'APPROVED',
    },
  })
  regularVoucherId = reg.id
})

afterAll(async () => {
  await prisma.voucherRedemption.deleteMany({ where: { userId } })
  await prisma.voucherAvailabilityWindow.deleteMany({ where: { voucherId: timeLimitedVoucherId } })
  await prisma.voucher.deleteMany({ where: { id: { in: [timeLimitedVoucherId, regularVoucherId] } } })
  await prisma.branch.delete({ where: { id: branchId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.merchant.delete({ where: { id: merchantId } })
  await prisma.$disconnect()
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TEST_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getCustomerVoucher — TIME_LIMITED payload extensions (M4a-4)', () => {
  it('TIME_LIMITED voucher returns availabilityWindows array', async () => {
    const v = await getCustomerVoucher(prisma, timeLimitedVoucherId, userId)
    expect(v.availabilityWindows).toHaveLength(5)
    expect(v.availabilityWindows[0]).toMatchObject({
      dayOfWeek: expect.any(Number),
      openTime: '11:00',
      closeTime: '15:00',
    })
  })

  it('TIME_LIMITED voucher at TEST_NOW=Mon 13:00 BST returns deterministic currentWindow / nextWindow', async () => {
    const v = await getCustomerVoucher(prisma, timeLimitedVoucherId, userId)
    // Mon-Fri 11:00-15:00 BST → currentWindow is Mon 11:00-15:00 BST = 10:00-14:00 UTC.
    expect(v.currentWindow).toEqual({
      startsAt: '2026-05-11T10:00:00.000Z',
      endsAt:   '2026-05-11T14:00:00.000Z',
    })
    // nextWindow is Tue 11:00-15:00 BST = Tue 10:00-14:00 UTC.
    expect(v.nextWindow).toEqual({
      startsAt: '2026-05-12T10:00:00.000Z',
      endsAt:   '2026-05-12T14:00:00.000Z',
    })
  })

  it('TIME_LIMITED voucher returns redeemedWindow as { startsAt, endsAt } | null shape (NOT boolean)', async () => {
    const v = await getCustomerVoucher(prisma, timeLimitedVoucherId, userId)
    expect(v).toHaveProperty('redeemedWindow')
    expect(typeof v.redeemedWindow).not.toBe('boolean')
    if (v.redeemedWindow !== null) {
      expect(v.redeemedWindow).toHaveProperty('startsAt')
      expect(v.redeemedWindow).toHaveProperty('endsAt')
    }
  })

  it('TIME_LIMITED voucher: availableAgainAt is null (NOT overloaded)', async () => {
    const v = await getCustomerVoucher(prisma, timeLimitedVoucherId, userId)
    expect(v.availableAgainAt).toBeNull()
  })

  it('TIME_LIMITED voucher: isRedeemedThisCycle is always false (cycle-state bypassed)', async () => {
    const v = await getCustomerVoucher(prisma, timeLimitedVoucherId, userId)
    expect(v.isRedeemedThisCycle).toBe(false)
  })

  it('non-TIME_LIMITED voucher: availabilityWindows is []; currentWindow/nextWindow/redeemedWindow are null', async () => {
    const v = await getCustomerVoucher(prisma, regularVoucherId, userId)
    expect(v.availabilityWindows).toEqual([])
    expect(v.currentWindow).toBeNull()
    expect(v.nextWindow).toBeNull()
    expect(v.redeemedWindow).toBeNull()
  })

  it('redeemedWindow exercises getMostRecentlyClosedWindowOccurrence: redemption inside last-closed window surfaces correct startsAt/endsAt', async () => {
    // Insert a VoucherRedemption inside the most-recently-closed window
    // (last Friday 12:00 BST = 2026-05-08 11:00 UTC, inside the Fri 11-15 BST occurrence).
    // Then move TEST_NOW forward to Saturday 13:00 BST so currentWindow is null
    // but the prior Friday occurrence anchors the redeemedWindow.
    vi.setSystemTime(new Date('2026-05-16T12:00:00.000Z'))  // Sat 13:00 BST
    await prisma.voucherRedemption.create({
      data: {
        userId, voucherId: timeLimitedVoucherId, branchId,
        redemptionCode: 'TLREDEEM',
        redeemedAt: new Date('2026-05-15T11:00:00.000Z'),  // Fri 12:00 BST inside window
        estimatedSaving: 8.50,
      },
    })

    const v = await getCustomerVoucher(prisma, timeLimitedVoucherId, userId)
    expect(v.currentWindow).toBeNull()  // Sat — no active window
    expect(v.redeemedWindow).toEqual({
      startsAt: '2026-05-15T10:00:00.000Z',  // Fri 11:00 BST
      endsAt:   '2026-05-15T14:00:00.000Z',  // Fri 15:00 BST
    })

    // Cleanup for next test
    await prisma.voucherRedemption.deleteMany({ where: { voucherId: timeLimitedVoucherId } })
  })
})
