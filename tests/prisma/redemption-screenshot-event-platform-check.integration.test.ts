import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * PR-1 hardening (deferred-followups §AG3) — defensive CHECK constraint
 * on `RedemptionScreenshotEvent.platform`.
 *
 * The column is enforced as `'ios' | 'android'` at the customer-API
 * Zod boundary, but a future direct-DB writer (admin tool, ad-hoc
 * support action, manual migration) could insert arbitrary strings.
 * Migration `20260510033746_redemption_screenshot_event_platform_check`
 * adds the DB-level CHECK as defence-in-depth.
 *
 * This test pins the constraint behaviour against the real DB:
 *
 *   1. Allowed values ('ios', 'android') succeed.
 *   2. Disallowed values ('web', '', uppercase, arbitrary strings) are
 *      rejected by Postgres with a CHECK-violation error referencing
 *      the constraint name.
 *
 * Mirrors the test pattern from `tests/prisma/merchant-highlight-cap.test.ts`
 * — real PrismaClient + PrismaPg adapter + cleanup in afterAll.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

let testUserId:       string
let testRedemptionId: string

beforeAll(async () => {
  // Throwaway user + voucher + redemption.  Real seeds are not used
  // — these rows live for the test then get cleaned up.  Cycle-state
  // and subscription are skipped (they're not on the FK path that the
  // CHECK constraint cares about; the redemption table only requires
  // a valid userId + voucherId + branchId).
  const merchant = await prisma.merchant.create({
    data: {
      businessName: 'TEST §AG3 platform-check merchant — auto-generated',
      status:       'ACTIVE',
    },
  })
  const branch = await prisma.branch.create({
    data: {
      merchantId:  merchant.id,
      name:        'TEST §AG3 branch',
      addressLine1:'Test',
      city:        'Test',
      postcode:    'TE1 1ST',
      country:     'United Kingdom',
      isMainBranch: true,
    },
  })
  const voucher = await prisma.voucher.create({
    data: {
      merchantId:      merchant.id,
      code:            `TEST-AG3-${Date.now()}`,
      title:           'TEST §AG3 voucher',
      description:     'Auto-generated for the platform-check constraint test',
      type:            'FREEBIE',
      estimatedSaving: 0,
      status:          'ACTIVE',
      approvalStatus:  'APPROVED',
    },
  })
  const user = await prisma.user.create({
    data: {
      email:        `test-ag3-${Date.now()}@example.com`,
      passwordHash: 'placeholder',
      firstName:    'Test',
      lastName:     'AG3',
    },
  })
  const redemption = await prisma.voucherRedemption.create({
    data: {
      userId:          user.id,
      voucherId:       voucher.id,
      branchId:        branch.id,
      redemptionCode:  `AG3-${Date.now().toString(36).toUpperCase().slice(-8).padEnd(8, 'X').replace(/[^A-Z0-9]/g, 'X')}`,
      estimatedSaving: 0,
    },
  })
  testUserId       = user.id
  testRedemptionId = redemption.id
})

afterAll(async () => {
  if (testRedemptionId) {
    // Cascade-clean: events first, then redemption, then voucher,
    // then branch, then user, then merchant.
    await prisma.redemptionScreenshotEvent.deleteMany({ where: { redemptionId: testRedemptionId } })
    const r = await prisma.voucherRedemption.findUnique({ where: { id: testRedemptionId }, select: { voucherId: true, branchId: true, userId: true } })
    await prisma.voucherRedemption.delete({ where: { id: testRedemptionId } })
    if (r) {
      const v = await prisma.voucher.findUnique({ where: { id: r.voucherId }, select: { merchantId: true } })
      await prisma.voucher.delete({ where: { id: r.voucherId } })
      const b = await prisma.branch.findUnique({ where: { id: r.branchId }, select: { merchantId: true } })
      await prisma.branch.delete({ where: { id: r.branchId } })
      await prisma.user.delete({ where: { id: r.userId } })
      if (v) await prisma.merchant.delete({ where: { id: v.merchantId } }).catch(() => {})
      else if (b) await prisma.merchant.delete({ where: { id: b.merchantId } }).catch(() => {})
    }
  }
  await prisma.$disconnect()
})

describe('RedemptionScreenshotEvent.platform CHECK constraint (§AG3)', () => {
  it('accepts platform="ios"', async () => {
    const row = await prisma.redemptionScreenshotEvent.create({
      data: { userId: testUserId, redemptionId: testRedemptionId, platform: 'ios' },
    })
    expect(row.platform).toBe('ios')
    await prisma.redemptionScreenshotEvent.delete({ where: { id: row.id } })
  })

  it('accepts platform="android"', async () => {
    const row = await prisma.redemptionScreenshotEvent.create({
      data: { userId: testUserId, redemptionId: testRedemptionId, platform: 'android' },
    })
    expect(row.platform).toBe('android')
    await prisma.redemptionScreenshotEvent.delete({ where: { id: row.id } })
  })

  it('rejects platform="web" with a CHECK-constraint violation', async () => {
    await expect(
      prisma.redemptionScreenshotEvent.create({
        data: { userId: testUserId, redemptionId: testRedemptionId, platform: 'web' as any },
      }),
    ).rejects.toThrow(/RedemptionScreenshotEvent_platform_check|check constraint/i)
  })

  it('rejects platform="IOS" (uppercase variant — the constraint is case-sensitive)', async () => {
    await expect(
      prisma.redemptionScreenshotEvent.create({
        data: { userId: testUserId, redemptionId: testRedemptionId, platform: 'IOS' as any },
      }),
    ).rejects.toThrow(/RedemptionScreenshotEvent_platform_check|check constraint/i)
  })

  it('rejects platform="" (empty string)', async () => {
    await expect(
      prisma.redemptionScreenshotEvent.create({
        data: { userId: testUserId, redemptionId: testRedemptionId, platform: '' as any },
      }),
    ).rejects.toThrow(/RedemptionScreenshotEvent_platform_check|check constraint/i)
  })

  it('rejects arbitrary strings ("unknown", "windows", "linux")', async () => {
    for (const bad of ['unknown', 'windows', 'linux']) {
      await expect(
        prisma.redemptionScreenshotEvent.create({
          data: { userId: testUserId, redemptionId: testRedemptionId, platform: bad as any },
        }),
      ).rejects.toThrow(/RedemptionScreenshotEvent_platform_check|check constraint/i)
    }
  })
})
