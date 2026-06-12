import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createVoucher, updateVoucher, submitVoucher } from '../../../src/api/merchant/voucher/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

let merchantId: string
let merchantAdminUserId: string

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { businessName: 'TEST §M4a-7', status: 'ACTIVE' },
  })
  merchantId = m.id
  const admin = await prisma.merchantAdmin.create({
    data: {
      email: `m4a7-${Date.now()}@example.com`, passwordHash: 'p',
      firstName: 'T', lastName: 'M4a7',
    },
  })
  merchantAdminUserId = admin.id
  // Phase 2 Slice 1 M1: resolveAdminMerchant now resolves via MerchantMembership.
  await prisma.merchantMembership.create({
    data: { merchantId, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })
})

afterAll(async () => {
  await prisma.voucherAvailabilityWindow.deleteMany({ where: { voucher: { merchantId } } })
  await prisma.voucher.deleteMany({ where: { merchantId } })
  const adminIds = (await prisma.merchantMembership.findMany({ where: { merchantId }, select: { merchantAdminId: true } })).map((r) => r.merchantAdminId)
  await prisma.merchantMembership.deleteMany({ where: { merchantId } })
  await prisma.merchantAdmin.deleteMany({ where: { id: { in: adminIds } } })
  await prisma.merchant.delete({ where: { id: merchantId } })
  await prisma.$disconnect()
})

const auditCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }

describe('Merchant voucher CRUD — TIME_LIMITED windows (M4a-7)', () => {
  describe('Rule 1: each row = one window-occurrence; split-day allowed', () => {
    it('accepts a voucher with split-day windows (Mon lunch + Mon dinner)', async () => {
      const v: any = await createVoucher(prisma, merchantAdminUserId, {
        type: 'TIME_LIMITED', title: 'Split-day test', estimatedSaving: 5,
        availabilityWindows: [
          { dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' },
          { dayOfWeek: 1, openTime: '18:00', closeTime: '22:00' },
        ],
      }, auditCtx)
      expect(v.availabilityWindows).toHaveLength(2)
    })
  })

  describe('Rule 2: half-open ranges (boundary semantics)', () => {
    it('accepts back-to-back non-overlapping windows (11:00-15:00 + 15:00-18:00)', async () => {
      const v: any = await createVoucher(prisma, merchantAdminUserId, {
        type: 'TIME_LIMITED', title: 'Back-to-back', estimatedSaving: 5,
        availabilityWindows: [
          { dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' },
          { dayOfWeek: 1, openTime: '15:00', closeTime: '18:00' },
        ],
      }, auditCtx)
      expect(v.availabilityWindows).toHaveLength(2)
    })
  })

  describe('Rule 3: no cross-midnight in single row; 24:00 sentinel allowed for closeTime only', () => {
    it('accepts "24:00" as closeTime', async () => {
      const v: any = await createVoucher(prisma, merchantAdminUserId, {
        type: 'TIME_LIMITED', title: 'Late night', estimatedSaving: 5,
        availabilityWindows: [
          { dayOfWeek: 5, openTime: '22:00', closeTime: '24:00' },
          { dayOfWeek: 6, openTime: '00:00', closeTime: '02:00' },
        ],
      }, auditCtx)
      expect(v.availabilityWindows).toHaveLength(2)
    })

    it('REJECTS "24:00" as openTime', async () => {
      await expect(
        createVoucher(prisma, merchantAdminUserId, {
          type: 'TIME_LIMITED', title: 'Bad open', estimatedSaving: 5,
          availabilityWindows: [
            { dayOfWeek: 1, openTime: '24:00', closeTime: '02:00' },
          ],
        }, auditCtx)
      ).rejects.toMatchObject({ code: 'INVALID_AVAILABILITY_WINDOWS' })
    })

    it('REJECTS closeTime <= openTime (cross-midnight in single row)', async () => {
      await expect(
        createVoucher(prisma, merchantAdminUserId, {
          type: 'TIME_LIMITED', title: 'Cross-mid', estimatedSaving: 5,
          availabilityWindows: [
            { dayOfWeek: 5, openTime: '22:00', closeTime: '02:00' },
          ],
        }, auditCtx)
      ).rejects.toMatchObject({ code: 'INVALID_AVAILABILITY_WINDOWS' })
    })

    it('REJECTS malformed time strings (25:00, 11:60, "xx", "9:00", "9am")', async () => {
      for (const bad of ['25:00', '11:60', 'xx', '9:00', '9am']) {
        await expect(
          createVoucher(prisma, merchantAdminUserId, {
            type: 'TIME_LIMITED', title: `Malformed ${bad}`, estimatedSaving: 5,
            availabilityWindows: [{ dayOfWeek: 1, openTime: bad, closeTime: '15:00' }],
          }, auditCtx)
        ).rejects.toThrow()
      }
    })
  })

  describe('Rule 4: no overlapping windows for same (voucherId, dayOfWeek)', () => {
    it('REJECTS overlapping Monday windows (11:00-15:00 + 14:00-18:00)', async () => {
      await expect(
        createVoucher(prisma, merchantAdminUserId, {
          type: 'TIME_LIMITED', title: 'Overlap', estimatedSaving: 5,
          availabilityWindows: [
            { dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' },
            { dayOfWeek: 1, openTime: '14:00', closeTime: '18:00' },
          ],
        }, auditCtx)
      ).rejects.toMatchObject({ code: 'INVALID_AVAILABILITY_WINDOWS' })
    })

    it('accepts overlapping windows on DIFFERENT days (Mon 11-15 + Tue 14-18)', async () => {
      const v: any = await createVoucher(prisma, merchantAdminUserId, {
        type: 'TIME_LIMITED', title: 'Different days', estimatedSaving: 5,
        availabilityWindows: [
          { dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' },
          { dayOfWeek: 2, openTime: '14:00', closeTime: '18:00' },
        ],
      }, auditCtx)
      expect(v.availabilityWindows).toHaveLength(2)
    })
  })

  describe('Type-attachment validation (D2 lock)', () => {
    it('REJECTS availabilityWindows on a non-TIME_LIMITED voucher', async () => {
      await expect(
        createVoucher(prisma, merchantAdminUserId, {
          type: 'BOGO', title: 'BOGO with windows', estimatedSaving: 5,
          availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
        }, auditCtx)
      ).rejects.toMatchObject({ code: 'INVALID_AVAILABILITY_WINDOWS' })
    })

    it('TIME_LIMITED voucher CAN be created in DRAFT with zero windows', async () => {
      const v: any = await createVoucher(prisma, merchantAdminUserId, {
        type: 'TIME_LIMITED', title: 'Draft no windows', estimatedSaving: 5,
        availabilityWindows: [],
      }, auditCtx)
      expect(v.status).toBe('DRAFT')
      expect(v.availabilityWindows ?? []).toEqual([])
    })
  })

  describe('Rule 7: at least one window required to submit/publish', () => {
    it('REJECTS submitVoucher for TIME_LIMITED with zero windows', async () => {
      const v = await createVoucher(prisma, merchantAdminUserId, {
        type: 'TIME_LIMITED', title: 'No windows', estimatedSaving: 5,
        availabilityWindows: [],
      }, auditCtx)
      await expect(
        submitVoucher(prisma, merchantAdminUserId, v.id, auditCtx)
      ).rejects.toMatchObject({ code: 'TIME_LIMITED_REQUIRES_WINDOW' })
    })

    it('accepts submitVoucher for TIME_LIMITED with at least one window', async () => {
      const v = await createVoucher(prisma, merchantAdminUserId, {
        type: 'TIME_LIMITED', title: 'Has window', estimatedSaving: 5,
        availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      }, auditCtx)
      const submitted = await submitVoucher(prisma, merchantAdminUserId, v.id, auditCtx)
      expect(submitted.status).toBe('PENDING_APPROVAL')
    })
  })

  describe('updateVoucher: window replacement', () => {
    it('replaces existing windows wholesale on update (idempotent)', async () => {
      const v = await createVoucher(prisma, merchantAdminUserId, {
        type: 'TIME_LIMITED', title: 'Update test', estimatedSaving: 5,
        availabilityWindows: [
          { dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' },
          { dayOfWeek: 2, openTime: '11:00', closeTime: '15:00' },
        ],
      }, auditCtx)

      const updated: any = await updateVoucher(prisma, merchantAdminUserId, v.id, {
        availabilityWindows: [
          { dayOfWeek: 3, openTime: '18:00', closeTime: '22:00' },
        ],
      }, auditCtx)
      expect(updated.availabilityWindows).toHaveLength(1)
      expect(updated.availabilityWindows[0]).toMatchObject({
        dayOfWeek: 3, openTime: '18:00', closeTime: '22:00',
      })
    })

    it('REJECTS type change from TIME_LIMITED → BOGO when windows still attached', async () => {
      const v = await createVoucher(prisma, merchantAdminUserId, {
        type: 'TIME_LIMITED', title: 'Type change', estimatedSaving: 5,
        availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      }, auditCtx)

      await expect(
        updateVoucher(prisma, merchantAdminUserId, v.id, {
          type: 'BOGO',
        }, auditCtx)
      ).rejects.toMatchObject({ code: 'INVALID_AVAILABILITY_WINDOWS' })
    })
  })

  describe('Cross-midnight integration: no gap, no overlap at midnight boundary', () => {
    it('Friday 22:00-24:00 + Saturday 00:00-02:00 windows have boundary continuity', async () => {
      const v: any = await createVoucher(prisma, merchantAdminUserId, {
        type: 'TIME_LIMITED', title: 'Cross-midnight integration', estimatedSaving: 5,
        availabilityWindows: [
          { dayOfWeek: 5, openTime: '22:00', closeTime: '24:00' },
          { dayOfWeek: 6, openTime: '00:00', closeTime: '02:00' },
        ],
      }, auditCtx)
      expect(v.availabilityWindows).toHaveLength(2)
      // The unit tests in voucherAvailability.test.ts verify the
      // window-occurrence math; this test just confirms the schema accepts it.
    })
  })
})
