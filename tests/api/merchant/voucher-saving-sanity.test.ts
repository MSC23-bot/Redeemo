import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createVoucher, updateVoucher } from '../../../src/api/merchant/voucher/service'

/**
 * M2 B4 (D8b): advisory present/positive saving sanity on the merchant voucher
 * SAVE paths that write a TOP-LEVEL estimatedSaving value. Zero / negative /
 * absent are rejected with SAVING_INVALID (400); a below-ideal-floor BUT positive
 * value (e.g. GBP 1) is ACCEPTED (advisory only; there is NO hard server floor
 * and NO use of RmvTemplate.minimumSaving as a gate). The check is service-layer
 * defense-in-depth (the route Zod also guards), so a direct service call is the
 * cleanest place to pin it.
 */
const baseCtx = { ipAddress: '1.2.3.4', userAgent: 'test' }

function mockPrisma() {
  return {
    // resolveAdminMerchant resolves via MerchantMembership (default OWNER of m1).
    merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
    voucher: {
      findFirst: vi.fn(),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'v1', ...data })),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'v1', ...data })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  } as any
}

describe('createVoucher saving sanity (M2 B4 / D8b)', () => {
  let prisma: any
  beforeEach(() => { prisma = mockPrisma() })

  it('rejects a zero estimatedSaving with SAVING_INVALID', async () => {
    await expect(createVoucher(prisma, 'ma1', {
      type: 'BOGO', title: 'Test', estimatedSaving: 0,
    }, baseCtx)).rejects.toThrow('SAVING_INVALID')
    expect(prisma.voucher.create).not.toHaveBeenCalled()
  })

  it('rejects a negative estimatedSaving with SAVING_INVALID', async () => {
    await expect(createVoucher(prisma, 'ma1', {
      type: 'BOGO', title: 'Test', estimatedSaving: -5,
    }, baseCtx)).rejects.toThrow('SAVING_INVALID')
    expect(prisma.voucher.create).not.toHaveBeenCalled()
  })

  it('rejects an absent estimatedSaving with SAVING_INVALID', async () => {
    await expect(createVoucher(prisma, 'ma1', {
      type: 'BOGO', title: 'Test',
    } as any, baseCtx)).rejects.toThrow('SAVING_INVALID')
    expect(prisma.voucher.create).not.toHaveBeenCalled()
  })

  it('ACCEPTS a below-ideal-floor but positive estimatedSaving (advisory only, no hard floor)', async () => {
    const result = await createVoucher(prisma, 'ma1', {
      type: 'BOGO', title: 'Test', estimatedSaving: 1,
    }, baseCtx)
    expect(prisma.voucher.create).toHaveBeenCalledTimes(1)
    expect(result.estimatedSaving).toBe(1)
  })

  it('ACCEPTS a normal positive estimatedSaving', async () => {
    await createVoucher(prisma, 'ma1', {
      type: 'BOGO', title: 'Test', estimatedSaving: 15,
    }, baseCtx)
    expect(prisma.voucher.create).toHaveBeenCalledTimes(1)
  })
})

describe('updateVoucher saving sanity (M2 B4 / D8b)', () => {
  let prisma: any
  beforeEach(() => {
    prisma = mockPrisma()
    prisma.voucher.findFirst = vi.fn().mockResolvedValue({
      id: 'v1', merchantId: 'm1', isRmv: false, status: 'DRAFT', type: 'BOGO', availabilityWindows: [],
    })
  })

  it('rejects a zero estimatedSaving on update with SAVING_INVALID', async () => {
    await expect(updateVoucher(prisma, 'ma1', 'v1', { estimatedSaving: 0 }, baseCtx))
      .rejects.toThrow('SAVING_INVALID')
    expect(prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('rejects a negative estimatedSaving on update with SAVING_INVALID', async () => {
    await expect(updateVoucher(prisma, 'ma1', 'v1', { estimatedSaving: -2 }, baseCtx))
      .rejects.toThrow('SAVING_INVALID')
    expect(prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('ACCEPTS a below-ideal-floor but positive estimatedSaving on update', async () => {
    await updateVoucher(prisma, 'ma1', 'v1', { estimatedSaving: 1 }, baseCtx)
    expect(prisma.voucher.update).toHaveBeenCalledTimes(1)
  })

  it('does NOT require estimatedSaving when the field is absent from the patch', async () => {
    // A PATCH that only edits other fields must not trip the saving sanity (the
    // check only fires when a top-level estimatedSaving value is actually written).
    await updateVoucher(prisma, 'ma1', 'v1', { title: 'New title' }, baseCtx)
    expect(prisma.voucher.update).toHaveBeenCalledTimes(1)
  })
})
