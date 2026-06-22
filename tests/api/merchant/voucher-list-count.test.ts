import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import { listVouchers, listRmvVouchers, getVoucher } from '../../../src/api/merchant/voucher/service'

// Day-2 Vouchers A2: per-voucher redemption count + curated selects.
//
// listVouchers (customs, the new Vouchers-module consumer) uses a curated select
// + _count:{ select:{ redemptions:true } } and maps redemptionCount. listRmvVouchers
// (consumed by the existing onboarding flagship UI) keeps include:{ rmvTemplate:true }
// and ADDS the _count additively (NOT switched to a restrictive select, which would
// drop rmvTemplate and break onboarding). getVoucher (the detail page) keeps all
// scalars incl merchantFields and adds redemptionCount additively.

describe('A2: voucher list + detail redemptionCount', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'ACTIVE', businessName: 'Acme' } }) },
      voucher: { findMany: vi.fn(), findFirst: vi.fn() },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
  })

  it('listVouchers uses a curated select + _count redemptions and maps redemptionCount', async () => {
    app.prisma.voucher.findMany = vi.fn().mockResolvedValue([
      {
        id: 'v1', title: 'T', type: 'BOGO', status: 'ACTIVE', approvalStatus: 'APPROVED',
        estimatedSaving: 5, description: null, terms: null, isRmv: false,
        publishedAt: new Date(), expiryDate: null, createdAt: new Date(),
        merchantFields: { askHelp: true }, approvalComment: null, approvedAt: null, cooldownSeconds: null,
        _count: { redemptions: 3 },
      },
    ])
    const rows = await listVouchers(app.prisma as any, 'ma1')
    const arg = (app.prisma.voucher.findMany as any).mock.calls[0][0]
    // Curated select (no blind findMany); _count requested.
    expect(arg.select).toBeDefined()
    expect(arg.select._count).toEqual({ select: { redemptions: true } })
    // Scoped to merchant customs.
    expect(arg.where).toEqual({ merchantId: 'm1', isRmv: false })
    // redemptionCount derived; the internal _count is not surfaced.
    expect(rows[0].redemptionCount).toBe(3)
    expect((rows[0] as any)._count).toBeUndefined()
  })

  it('listRmvVouchers keeps rmvTemplate include and ADDS _count redemptions (additive, not a restrictive select)', async () => {
    app.prisma.voucher.findMany = vi.fn().mockResolvedValue([
      {
        id: 'rmv1', title: 'Flagship', type: 'DISCOUNT_PERCENT', status: 'ACTIVE',
        approvalStatus: 'APPROVED', isRmv: true, rmvTemplate: { id: 't1', allowedFields: ['title'] },
        merchantFields: {}, _count: { redemptions: 7 },
      },
    ])
    const rows = await listRmvVouchers(app.prisma as any, 'ma1')
    const arg = (app.prisma.voucher.findMany as any).mock.calls[0][0]
    // rmvTemplate stays included (onboarding depends on it); NO restrictive select.
    expect(arg.include.rmvTemplate).toBe(true)
    expect(arg.include._count).toEqual({ select: { redemptions: true } })
    expect(arg.select).toBeUndefined()
    expect(rows[0].redemptionCount).toBe(7)
    // rmvTemplate is preserved on the row.
    expect((rows[0] as any).rmvTemplate).toEqual({ id: 't1', allowedFields: ['title'] })
  })

  it('getVoucher keeps all scalars incl merchantFields, includes availabilityWindows, and adds redemptionCount', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({
      id: 'v1', merchantId: 'm1', title: 'T', type: 'TIME_LIMITED', status: 'DRAFT',
      approvalStatus: 'PENDING', isRmv: false, estimatedSaving: 5,
      merchantFields: { askHelp: true, adminProposed: { title: 'Better' } },
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      _count: { redemptions: 2 },
    })
    const v = await getVoucher(app.prisma as any, 'ma1', 'v1')
    const arg = (app.prisma.voucher.findFirst as any).mock.calls[0][0]
    // Additive include (all scalars kept; merchantFields survives).
    expect(arg.include._count).toEqual({ select: { redemptions: true } })
    // PR-B review fix: availabilityWindows is a RELATION and MUST be included, else a
    // TIME_LIMITED edit-save would wipe the windows (data loss). Pin the include.
    expect(arg.include.availabilityWindows).toEqual({ select: { dayOfWeek: true, openTime: true, closeTime: true } })
    expect(arg.where).toEqual({ id: 'v1', merchantId: 'm1', isRmv: false })
    expect(v.redemptionCount).toBe(2)
    // merchantFields (incl adminProposed) survives for the concierge diff.
    expect((v as any).merchantFields).toEqual({ askHelp: true, adminProposed: { title: 'Better' } })
    // The TIME_LIMITED windows round-trip so the builder can rehydrate them on edit/duplicate.
    expect((v as any).availabilityWindows).toEqual([{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }])
    expect((v as any)._count).toBeUndefined()
  })
})
