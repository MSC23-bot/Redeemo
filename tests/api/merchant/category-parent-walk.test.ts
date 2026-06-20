import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import { resolveTopLevelCategoryId } from '../../../src/api/merchant/shared'
import { setMerchantCategoryCore } from '../../../src/api/merchant/profile/service'

/**
 * M2 B2: the parent-walk helper + the B2/B3 auto-provisioning coordination.
 *
 * The parent-walk resolves a subcategory id to its top-level parent (parentId),
 * and a top-level id to itself. The identity write now stores primaryCategoryId =
 * the SUBCATEGORY id, but RMV templates are seeded at the TOP-LEVEL. So the
 * first-time-set auto-provisioning in setMerchantCategoryCore (and the category
 * CHANGE path) MUST query templates against the resolved TOP-LEVEL parent, or it
 * would find zero templates and throw NO_RMV_TEMPLATE. B2 keeps auto-provisioning
 * working via the parent-walk; B3 later replaces it with the choose-type flow.
 */
describe('category parent-walk helper (M2 B2)', () => {
  it('resolves a subcategory id to its top-level parent id', async () => {
    const prisma: any = {
      category: { findUnique: vi.fn().mockResolvedValue({ parentId: 'cat-food' }) },
    }
    const top = await resolveTopLevelCategoryId(prisma, 'sub-restaurant')
    expect(top).toBe('cat-food')
    expect(prisma.category.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub-restaurant' } })
    )
  })

  it('resolves a top-level id to itself (parentId is null)', async () => {
    const prisma: any = {
      category: { findUnique: vi.fn().mockResolvedValue({ parentId: null }) },
    }
    const top = await resolveTopLevelCategoryId(prisma, 'cat-food')
    expect(top).toBe('cat-food')
  })

  it('falls back to the passed id when the category row is missing (lenient, defensive)', async () => {
    // Defensive: a missing/unmockable Category row must NOT crash provisioning.
    // The real guard is the subsequent NO_RMV_TEMPLATE check on the resolved id.
    // This also keeps existing admin-path tests (which pass a top-level id and do
    // NOT mock category.findUnique) green.
    const prisma: any = {
      category: { findUnique: vi.fn().mockResolvedValue(null) },
    }
    const top = await resolveTopLevelCategoryId(prisma, 'cat-food')
    expect(top).toBe('cat-food')
  })

  it('falls back to the passed id when the category accessor is unavailable (bare mock)', async () => {
    // Mirrors the existing admin-route unit test, which does not mock prisma.category
    // at all. resolveTopLevelCategoryId must tolerate that and return the id.
    const prisma: any = {}
    const top = await resolveTopLevelCategoryId(prisma, 'cat-new')
    expect(top).toBe('cat-new')
  })
})

describe('auto-provisioning uses the parent-walk after B2 (M2 B2/B3 coordination)', () => {
  let app: FastifyInstance
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      category: { findUnique: vi.fn() },
      voucher: { findMany: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'v1' }) },
      rmvTemplate: { findMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prismaMock))
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('first-time category set with a SUBCATEGORY id provisions RMVs against the TOP-LEVEL parent template', async () => {
    // No primaryCategoryId yet -> first-time set path in setMerchantCategoryCore.
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: null })
    // The chosen id is a SUBCATEGORY whose top-level parent is 'cat-food'.
    app.prisma.category.findUnique = vi.fn().mockResolvedValue({ parentId: 'cat-food' })
    // Templates live at the TOP-LEVEL ('cat-food'); a query on the subcategory id
    // would return [] and throw NO_RMV_TEMPLATE. The parent-walk fixes that.
    app.prisma.rmvTemplate.findMany = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where?.categoryId === 'cat-food') {
        return [
          { id: 't1', voucherType: 'BOGO', title: 'BOGO', description: 'd', minimumSaving: 5, allowedFields: ['terms'] },
          { id: 't2', voucherType: 'DISCOUNT', title: 'Disc', description: 'd', minimumSaving: 5, allowedFields: ['terms'] },
        ]
      }
      return []
    })
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: 'sub-restaurant' })

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { primaryCategoryId: 'sub-restaurant' },
    })

    expect(res.statusCode).toBe(200)
    // primaryCategoryId stored as the SUBCATEGORY id (descriptor composes correctly).
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ primaryCategoryId: 'sub-restaurant' }) })
    )
    // Templates queried against the resolved TOP-LEVEL parent, not the subcategory.
    expect(app.prisma.rmvTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat-food' }) })
    )
    // Two RMVs provisioned (auto-provisioning preserved in B2).
    expect(app.prisma.voucher.create).toHaveBeenCalledTimes(2)
  })

  it('first-time category set with a TOP-LEVEL id provisions against that same top-level template (parent-walk returns itself)', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: null })
    // A top-level id resolves to itself via the parent-walk.
    app.prisma.category.findUnique = vi.fn().mockResolvedValue({ parentId: null })
    app.prisma.rmvTemplate.findMany = vi.fn().mockResolvedValue([
      { id: 't1', voucherType: 'BOGO', title: 'BOGO', description: 'd', minimumSaving: 5, allowedFields: ['terms'] },
      { id: 't2', voucherType: 'DISCOUNT', title: 'Disc', description: 'd', minimumSaving: 5, allowedFields: ['terms'] },
    ])
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: 'cat-food' })

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { primaryCategoryId: 'cat-food' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.rmvTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat-food' }) })
    )
    expect(app.prisma.voucher.create).toHaveBeenCalledTimes(2)
  })

  it('admin setMerchantCategoryCore first-set path still provisions with a bare mock (no category accessor)', async () => {
    // Regression: mirror the admin-route unit-test mock shape exactly — prisma has
    // NO `category` accessor. The parent-walk must tolerate this (lenient fallback
    // to the passed id) so the admin category path keeps provisioning unchanged.
    const prisma: any = {
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb(prisma)),
      merchant: {
        findUnique: vi.fn().mockResolvedValue({ primaryCategoryId: null }),
        update: vi.fn().mockResolvedValue({ id: 'm1' }),
      },
      rmvTemplate: {
        findMany: vi.fn().mockResolvedValue([
          { id: 't1', voucherType: 'DISCOUNT_FIXED', title: 'A', description: 'd', minimumSaving: 5 },
          { id: 't2', voucherType: 'DISCOUNT_FIXED', title: 'B', description: 'd', minimumSaving: 5 },
        ]),
      },
      voucher: { create: vi.fn().mockResolvedValue({ id: 'v1' }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    const ctx = { ipAddress: '127.0.0.1', userAgent: 'test' }
    const result = await setMerchantCategoryCore(
      prisma,
      { merchantId: 'm1', actor: { type: 'ADMIN', id: 'admin-1', reason: 'onboarding correction' } },
      'cat-new',
      false,
      ctx,
    )
    expect(result).toEqual({ provisioned: true })
    expect(prisma.rmvTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat-new' }) })
    )
    expect(prisma.voucher.create).toHaveBeenCalledTimes(2)
  })
})
