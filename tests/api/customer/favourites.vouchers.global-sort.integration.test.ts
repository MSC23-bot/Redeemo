// Real-DB pins for the locked v1.1 Smart 7-bucket global sort on
// listFavouriteVouchers (spec §6.3 + §9.3).
//
// We deliberately favourite each fixture-voucher with an INVERTED
// timestamp: bucket 1 (urgent — should appear first globally) gets the
// OLDEST `favouritedAt`; bucket 7 (expired — should appear last) gets
// the NEWEST.  If the sort regressed to client/server `favouritedAt
// desc only`, bucket 1 would end up on the LAST page and bucket 7 on
// page 1.  The pin asserts the opposite — urgent first, expired last —
// across pages, which is the regression catch the spec §6.3 v1.1
// amendment exists to enforce.
//
// Fixture prefix: GSORT-FAV-VCH- so we don't collide with the routes
// test or the branches.service test.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus, VoucherType,
} from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { listFavouriteVouchers } from '../../../src/api/customer/favourites/service'
import { getLondonClock } from '../../../src/api/shared/londonClock'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const USER_EMAIL_PREFIX = 'GSORT-FAV-VCH-'
const MERCHANT_NAME_PREFIX = 'GSORT-FAV-VCH-'

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`
  await sweepFixtures()
})

afterAll(async () => {
  await sweepFixtures()
  await prisma.$disconnect()
})

async function sweepFixtures(): Promise<void> {
  // FK order: voucherRedemption / userVoucherCycleState / favouriteVoucher
  // first, THEN availabilityWindow, then voucher, then subscription, then
  // user, then branch+merchant.
  const tryDelete = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try { await fn() } catch (err) { console.warn(`[gsort sweep ${label}]`, err) }
  }
  await tryDelete('redemption', () => prisma.voucherRedemption.deleteMany({
    where: { user: { email: { startsWith: USER_EMAIL_PREFIX } } },
  }))
  await tryDelete('cycleState', () => prisma.userVoucherCycleState.deleteMany({
    where: { user: { email: { startsWith: USER_EMAIL_PREFIX } } },
  }))
  await tryDelete('favouriteVoucher', () => prisma.favouriteVoucher.deleteMany({
    where: { user: { email: { startsWith: USER_EMAIL_PREFIX } } },
  }))
  await tryDelete('availabilityWindow', () => prisma.voucherAvailabilityWindow.deleteMany({
    where: { voucher: { merchant: { businessName: { startsWith: MERCHANT_NAME_PREFIX } } } },
  }))
  await tryDelete('voucher', () => prisma.voucher.deleteMany({
    where: { merchant: { businessName: { startsWith: MERCHANT_NAME_PREFIX } } },
  }))
  await tryDelete('subscription', () => prisma.subscription.deleteMany({
    where: { user: { email: { startsWith: USER_EMAIL_PREFIX } } },
  }))
  await tryDelete('user', () => prisma.user.deleteMany({
    where: { email: { startsWith: USER_EMAIL_PREFIX } },
  }))
  await tryDelete('branch', () => prisma.branch.deleteMany({
    where: { merchant: { businessName: { startsWith: MERCHANT_NAME_PREFIX } } },
  }))
  await tryDelete('merchant', () => prisma.merchant.deleteMany({
    where: { businessName: { startsWith: MERCHANT_NAME_PREFIX } },
  }))
  await tryDelete('subscriptionPlan', () => prisma.subscriptionPlan.deleteMany({
    where: { name: { startsWith: MERCHANT_NAME_PREFIX } },
  }))
}

interface FixtureVoucher {
  id: string
  code: string
  type: VoucherType
  status?: VoucherStatus
  approvalStatus?: ApprovalStatus
  expiryDate?: Date | null
  cooldownSeconds?: number | null
  availabilityWindows?: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>
}

describe('listFavouriteVouchers — Smart 7-bucket global sort (spec §6.3 + §9.3)', () => {
  it('orders pages globally by priority bucket regardless of favouritedAt', async () => {
    // Single user + a single merchant for "active" buckets + a second
    // INACTIVE merchant for bucket 6 (unavailable).  One voucher per
    // bucket = 7 vouchers total.  Page size 3 → page 1 = [b1,b2,b3],
    // page 2 = [b4,b5,b6], page 3 = [b7].
    const user = await prisma.user.create({
      data: { email: `${USER_EMAIL_PREFIX}user@x.test` },
      select: { id: true },
    })

    // Subscription cycle anchor — required for bucket-4 (redeemed-this-
    // cycle) detection via getCurrentCycleWindow.  A throwaway plan is
    // created upstream because Subscription.planId is non-null FK.
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name:            `${MERCHANT_NAME_PREFIX}plan`,
        priceGbp:        6.99,
        billingInterval: 'MONTHLY',
        stripePriceId:   `${MERCHANT_NAME_PREFIX}stripePrice`,
      },
      select: { id: true },
    })
    await prisma.subscription.create({
      data: {
        userId:             user.id,
        planId:             plan.id,
        status:             'ACTIVE',
        cycleAnchorDate:    new Date('2026-05-01T00:00:00Z'),
        currentPeriodStart: new Date('2026-05-01T00:00:00Z'),
        currentPeriodEnd:   new Date('2026-06-01T00:00:00Z'),
      },
    })

    const activeMerchant = await prisma.merchant.create({
      data: { businessName: `${MERCHANT_NAME_PREFIX}active`, status: MerchantStatus.ACTIVE },
      select: { id: true },
    })
    const inactiveMerchant = await prisma.merchant.create({
      data: { businessName: `${MERCHANT_NAME_PREFIX}inactive`, status: MerchantStatus.INACTIVE },
      select: { id: true },
    })

    // Pin `now` to a known mid-afternoon UK time so the TL window math
    // never drifts across CI clock-of-day. 2026-05-15T14:00:00Z is
    // 15:00 London (BST = UTC+1 in May).  London dayOfWeek + minutes
    // derived via the helper so the test stays robust regardless of
    // BST/GMT transitions.
    const now = new Date('2026-05-15T14:00:00Z')
    const { dayOfWeek, minutes: nowMinutes } = getLondonClock(now)
    const pad = (n: number): string => n.toString().padStart(2, '0')
    const minutesToHHmm = (m: number): string => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
    // Window covers a sizeable slice of the same day so b1 + b2 both
    // satisfy "currentWindow IS live at now". The closeTime drives the
    // urgent vs active classification.
    const openHHmm = minutesToHHmm(Math.max(0, nowMinutes - 60))
    const b1CloseHHmm = minutesToHHmm(nowMinutes + 5)    // 5 min remaining → urgent (bucket 1)
    const b2CloseHHmm = minutesToHHmm(nowMinutes + 180)  // 3h remaining → active (bucket 2)

    // CREATE all 7 vouchers.
    const createVoucher = async (
      merchantId: string,
      suffix: string,
      v: FixtureVoucher,
    ): Promise<{ id: string }> => {
      const voucher = await prisma.voucher.create({
        data: {
          merchantId,
          code:           `${MERCHANT_NAME_PREFIX}${suffix}`,
          type:           v.type,
          title:          `Test ${suffix}`,
          estimatedSaving: 10,
          status:         v.status ?? VoucherStatus.ACTIVE,
          approvalStatus: v.approvalStatus ?? ApprovalStatus.APPROVED,
          expiryDate:     v.expiryDate ?? null,
          cooldownSeconds: v.cooldownSeconds ?? null,
        },
        select: { id: true },
      })
      if (v.availabilityWindows && v.availabilityWindows.length > 0) {
        await prisma.voucherAvailabilityWindow.createMany({
          data: v.availabilityWindows.map(w => ({
            voucherId: voucher.id,
            dayOfWeek: w.dayOfWeek,
            openTime:  w.openTime,
            closeTime: w.closeTime,
          })),
        })
      }
      return voucher
    }

    const b1 = await createVoucher(activeMerchant.id, 'b1-urgent', {
      id: '', code: '',
      type: VoucherType.TIME_LIMITED,
      availabilityWindows: [{ dayOfWeek, openTime: openHHmm, closeTime: b1CloseHHmm }],
    })
    const b2 = await createVoucher(activeMerchant.id, 'b2-active-tl', {
      id: '', code: '',
      type: VoucherType.TIME_LIMITED,
      availabilityWindows: [{ dayOfWeek, openTime: openHHmm, closeTime: b2CloseHHmm }],
    })
    const b3 = await createVoucher(activeMerchant.id, 'b3-reusable-cooldown', {
      id: '', code: '',
      type: VoucherType.REUSABLE,
      cooldownSeconds: 3 * 60 * 60, // 3-hour cooldown, redeemed 1h ago → still in cooldown
    })
    const b4 = await createVoucher(activeMerchant.id, 'b4-redeemed-cycle', {
      id: '', code: '',
      type: VoucherType.DISCOUNT_FIXED,
    })
    const b5 = await createVoucher(activeMerchant.id, 'b5-tl-outside', {
      id: '', code: '',
      type: VoucherType.TIME_LIMITED,
      // Window on yesterday only — guaranteed not "currentWindow now".
      availabilityWindows: [{ dayOfWeek: (dayOfWeek + 6) % 7, openTime: '09:00', closeTime: '17:00' }],
    })
    const b6 = await createVoucher(inactiveMerchant.id, 'b6-unavailable', {
      id: '', code: '',
      type: VoucherType.DISCOUNT_FIXED,
    })
    const b7 = await createVoucher(activeMerchant.id, 'b7-expired', {
      id: '', code: '',
      type: VoucherType.DISCOUNT_FIXED,
      expiryDate: new Date(now.getTime() - 24 * 60 * 60_000),
    })

    // Need a Branch for bucket-3 REUSABLE redemption (FK).
    const branch = await prisma.branch.create({
      data: {
        merchantId:    activeMerchant.id,
        name:          `${MERCHANT_NAME_PREFIX}br`,
        addressLine1:  '1 Test St',
        city:          'Testtown',
        postcode:      'TT1 1TT',
        isActive:      true,
        isMainBranch:  true,
      },
      select: { id: true },
    })

    // Drive bucket 3: REUSABLE has a recent redemption inside cooldown.
    // Redemption is 1h before `now`; 3h cooldown → still in cooldown.
    await prisma.voucherRedemption.create({
      data: {
        userId:          user.id,
        voucherId:       b3.id,
        branchId:        branch.id,
        redemptionCode:  `${MERCHANT_NAME_PREFIX}b3rdmp`,
        estimatedSaving: 10,
        redeemedAt:      new Date(now.getTime() - 60 * 60_000),
      },
    })
    // Drive bucket 4: non-TL non-REUSABLE has cycleState.isRedeemed=true.
    await prisma.userVoucherCycleState.create({
      data: {
        userId:                   user.id,
        voucherId:                b4.id,
        cycleStartDate:           new Date('2026-05-01T00:00:00Z'),
        isRedeemedInCurrentCycle: true,
      },
    })

    // INVERTED favouritedAt:
    //   b1 (urgent, sort first)  → OLDEST (Jan 1 2026)
    //   b2                       → Feb 1
    //   b3                       → Mar 1
    //   b4                       → Apr 1
    //   b5                       → May 1
    //   b6                       → Jun 1
    //   b7 (expired, sort last)  → NEWEST (Jul 1)
    const favouritedAt = [
      { id: b1.id, createdAt: new Date('2026-01-01T00:00:00Z') },
      { id: b2.id, createdAt: new Date('2026-02-01T00:00:00Z') },
      { id: b3.id, createdAt: new Date('2026-03-01T00:00:00Z') },
      { id: b4.id, createdAt: new Date('2026-04-01T00:00:00Z') },
      { id: b5.id, createdAt: new Date('2026-05-01T00:00:00Z') },
      { id: b6.id, createdAt: new Date('2026-06-01T00:00:00Z') },
      { id: b7.id, createdAt: new Date('2026-07-01T00:00:00Z') },
    ]
    for (const f of favouritedAt) {
      await prisma.favouriteVoucher.create({
        data: { userId: user.id, voucherId: f.id, createdAt: f.createdAt },
      })
    }

    // PAGE 1 — first 3 should be b1, b2, b3 (urgent + active + cooldown)
    const page1 = await listFavouriteVouchers(prisma, user.id, { page: 1, limit: 3, now })
    expect(page1.total).toBe(7)
    expect(page1.items.map(i => i.id)).toEqual([b1.id, b2.id, b3.id])
    expect(page1.items.map(i => i.priorityBucket)).toEqual([1, 2, 3])

    // PAGE 2 — b4, b5, b6
    const page2 = await listFavouriteVouchers(prisma, user.id, { page: 2, limit: 3, now })
    expect(page2.items.map(i => i.id)).toEqual([b4.id, b5.id, b6.id])
    expect(page2.items.map(i => i.priorityBucket)).toEqual([4, 5, 6])

    // PAGE 3 — b7 only
    const page3 = await listFavouriteVouchers(prisma, user.id, { page: 3, limit: 3, now })
    expect(page3.items.map(i => i.id)).toEqual([b7.id])
    expect(page3.items.map(i => i.priorityBucket)).toEqual([7])
  }, 30000)
})
