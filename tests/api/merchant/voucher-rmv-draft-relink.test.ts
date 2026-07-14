import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// ─────────────────────────────────────────────────────────────────────────────
// S5 item 2 (2026-07-14): DRAFT-TIME RELINKING (draft-type honesty).
//
// When updateRmvVoucherCore saves a bag whose discountKind implies the OTHER
// discount mechanic, the voucher's type + rmvTemplateId are re-linked ATOMICALLY
// with the bag write (one voucher.update inside the transaction: the bag write and
// the relink succeed or fail together). Resolution is FAIL-CLOSED: an unresolvable
// ACTIVE sibling (row missing/inactive, or the voucher's own template link
// unreadable) rejects with the typed 422 RMV_TEMPLATE_UNAVAILABLE and writes
// nothing. The submit-time relink stays as defence-in-depth (voucher-bridge suite).
//
// Draft honesty consequence: the Option B admin reads (co-build listAdminRmvVouchers
// + the review read) are per-request pass-throughs of voucher.type / the template's
// allowedFields, so a toggled draft shows the truthful mechanic immediately
// (see the truthful-read test in tests/api/admin/admin-merchant-rmv-routes.test.ts).
// After a relink, subsequent edits validate keys against the SIBLING template's
// allowedFields (the voucher now links to it).
// ─────────────────────────────────────────────────────────────────────────────

describe('S5 item 2: RMV draft-time discount relink (updateRmvVoucherCore)', () => {
  let app: FastifyInstance
  let merchantToken: string

  const ALLOWED = ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl', 'merchantFields']

  const percentTemplate = {
    id: 'tmpl-pct', categoryId: 'cat1', voucherType: 'DISCOUNT_PERCENT',
    title: 'Percentage Discount', allowedFields: ALLOWED, minimumSaving: 5.0, isActive: true,
  }
  const fixedTemplate = {
    id: 'tmpl-fixed', categoryId: 'cat1', voucherType: 'DISCOUNT_FIXED',
    title: 'Fixed Discount', allowedFields: ALLOWED, minimumSaving: 5.0, isActive: true,
  }

  function draftRmv(overrides: Record<string, unknown> = {}) {
    return {
      id: 'rmv1', merchantId: 'm1', code: 'RMV-ABC12345', isRmv: true,
      rmvTemplateId: 'tmpl-pct', type: 'DISCOUNT_PERCENT',
      title: 'Percentage Discount', estimatedSaving: 5.0,
      status: 'DRAFT', approvalStatus: 'PENDING', isMandatory: true,
      merchantFields: {}, rmvTemplate: percentTemplate, publishedAt: null,
      ...overrides,
    }
  }

  // A builder save body flipping the kind to FIXED (complete mechanic).
  const fixedFlipBody = {
    title: 'A Tenner Off',
    estimatedSaving: 10,
    merchantFields: { builderType: 'discount', discountKind: 'fixed', discAmount: 10 },
  }

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] },
        ]),
      },
      voucher: { findFirst: vi.fn(), update: vi.fn().mockImplementation(async (a: any) => ({ id: a.where.id, ...a.data })) },
      rmvTemplate: { findFirst: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  })
  afterEach(async () => { await app.close() })

  const patch = (payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH', url: '/api/v1/merchant/vouchers/rmv/rmv1',
      headers: { authorization: `Bearer ${merchantToken}` }, payload,
    })

  it('percent -> fixed: a toggled save relinks type + rmvTemplateId ATOMICALLY with the bag write', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(draftRmv())
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue(fixedTemplate)

    const res = await patch(fixedFlipBody)
    expect(res.statusCode).toBe(200)
    // Sibling lookup for the same top-level category.
    expect(app.prisma.rmvTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat1', voucherType: 'DISCOUNT_FIXED', isActive: true }) }),
    )
    // ONE voucher.update carrying BOTH the merged bag AND the relink.
    expect(app.prisma.voucher.update).toHaveBeenCalledTimes(1)
    const upd = (app.prisma.voucher.update as any).mock.calls[0][0]
    expect(upd.data.type).toBe('DISCOUNT_FIXED')
    expect(upd.data.rmvTemplateId).toBe('tmpl-fixed')
    expect(upd.data.merchantFields).toMatchObject({
      title: 'A Tenner Off',
      merchantFields: expect.objectContaining({ discountKind: 'fixed', discAmount: 10 }),
    })
  })

  it('fixed -> percent: the reverse toggle relinks the other way', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ type: 'DISCOUNT_FIXED', rmvTemplateId: 'tmpl-fixed', rmvTemplate: fixedTemplate }),
    )
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue(percentTemplate)

    const res = await patch({
      title: 'Twenty Percent Off',
      merchantFields: { builderType: 'discount', discountKind: 'percent', discPercent: 20, discMin: 40 },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.rmvTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat1', voucherType: 'DISCOUNT_PERCENT', isActive: true }) }),
    )
    const upd = (app.prisma.voucher.update as any).mock.calls[0][0]
    expect(upd.data.type).toBe('DISCOUNT_PERCENT')
    expect(upd.data.rmvTemplateId).toBe('tmpl-pct')
  })

  it('fails closed (422 RMV_TEMPLATE_UNAVAILABLE, zero writes) when the sibling is unresolvable at save', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(draftRmv())
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue(null) // missing or inactive

    const res = await patch(fixedFlipBody)
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.body).error.code).toBe('RMV_TEMPLATE_UNAVAILABLE')
    // No partial write: neither the bag nor the relink landed, and no audit.
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    expect(app.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('fails closed (422) when a flip is implied but the voucher template link is unreadable', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      // allowedFields validation needs a template; simulate an unreadable link by a
      // template row with no categoryId (data fault), which cannot resolve a sibling.
      draftRmv({ rmvTemplate: { ...percentTemplate, categoryId: undefined } }),
    )

    const res = await patch(fixedFlipBody)
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.body).error.code).toBe('RMV_TEMPLATE_UNAVAILABLE')
    expect(app.prisma.rmvTemplate.findFirst).not.toHaveBeenCalled()
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('no flip implied (kind matches the stored type): no sibling lookup, no type write', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(draftRmv())

    const res = await patch({
      title: 'Still Percent',
      merchantFields: { builderType: 'discount', discountKind: 'percent', discPercent: 20, discMin: 40 },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.rmvTemplate.findFirst).not.toHaveBeenCalled()
    const upd = (app.prisma.voucher.update as any).mock.calls[0][0]
    expect('type' in upd.data).toBe(false)
    expect('rmvTemplateId' in upd.data).toBe(false)
  })

  it('non-discount voucher: discountKind in the bag never triggers a relink', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ type: 'BOGO', rmvTemplateId: 'tmpl-bogo', rmvTemplate: { ...percentTemplate, id: 'tmpl-bogo', voucherType: 'BOGO' } }),
    )

    const res = await patch({
      merchantFields: { builderType: 'bogo', discountKind: 'fixed', bogoBuy: 'A main', bogoFree: 'A side', bogoFreePrice: 5 },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.rmvTemplate.findFirst).not.toHaveBeenCalled()
    const upd = (app.prisma.voucher.update as any).mock.calls[0][0]
    expect('type' in upd.data).toBe(false)
  })

  it('allowedFields govern from the SIBLING template after a relink (subsequent edit)', async () => {
    // After the percent->fixed relink the voucher links to a fixed template whose
    // allowedFields are NARROWER (no imageUrl). A subsequent PATCH proposing imageUrl
    // must be rejected against the sibling's list, proving the new template governs.
    const narrowFixed = { ...fixedTemplate, allowedFields: ['title', 'terms', 'merchantFields'] }
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ type: 'DISCOUNT_FIXED', rmvTemplateId: 'tmpl-fixed', rmvTemplate: narrowFixed }),
    )

    const rejected = await patch({ imageUrl: 'https://cdn.example/x.jpg' })
    expect(rejected.statusCode).toBe(400)
    expect(JSON.parse(rejected.body).error.code).toBe('RMV_FIELD_NOT_ALLOWED')

    // A key the sibling allows passes.
    const accepted = await patch({ title: 'Allowed by sibling' })
    expect(accepted.statusCode).toBe(200)
  })

  // ── Round-2 ordering seam: the DESTINATION template governs the SAME save ──────
  //
  // The blocker: proposed keys were validated against the CURRENT template BEFORE the
  // relink resolved the destination. A flip-and-save could therefore persist a field
  // the destination FORBIDS. These pin the fix: the effective (destination) template's
  // allowedFields govern the same save, with ZERO writes on rejection.

  // Source (percent) is WIDE (allows imageUrl); destination (fixed) is NARROW (no imageUrl).
  const wideAllowed = ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl', 'merchantFields']
  const narrowAllowed = ['title', 'description', 'estimatedSaving', 'terms', 'merchantFields'] // no imageUrl

  it('percent -> fixed flip REJECTS a field allowed by SOURCE but forbidden by DESTINATION (zero writes)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ rmvTemplate: { ...percentTemplate, allowedFields: wideAllowed } }),
    )
    // The sibling (fixed) forbids imageUrl.
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue({ ...fixedTemplate, allowedFields: narrowAllowed })

    // imageUrl is allowed by the source (percent) template but NOT the destination (fixed).
    const res = await patch({
      imageUrl: 'https://cdn.example/x.jpg',
      merchantFields: { builderType: 'discount', discountKind: 'fixed', discAmount: 10 },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('RMV_FIELD_NOT_ALLOWED')
    // Destination resolved BEFORE the write boundary: nothing persisted, no audit.
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    expect(app.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('fixed -> percent flip REJECTS a field allowed by SOURCE but forbidden by DESTINATION (zero writes)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ type: 'DISCOUNT_FIXED', rmvTemplateId: 'tmpl-fixed', rmvTemplate: { ...fixedTemplate, allowedFields: wideAllowed } }),
    )
    // The sibling (percent) forbids imageUrl.
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue({ ...percentTemplate, allowedFields: narrowAllowed })

    const res = await patch({
      imageUrl: 'https://cdn.example/x.jpg',
      merchantFields: { builderType: 'discount', discountKind: 'percent', discPercent: 20, discMin: 40 },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('RMV_FIELD_NOT_ALLOWED')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    expect(app.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('flip SUCCEEDS + relinks when the proposed field IS allowed by the destination template', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ rmvTemplate: { ...percentTemplate, allowedFields: wideAllowed } }),
    )
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue({ ...fixedTemplate, allowedFields: narrowAllowed })

    // title is allowed by BOTH; the flip proceeds and relinks.
    const res = await patch({
      title: 'A Tenner Off',
      merchantFields: { builderType: 'discount', discountKind: 'fixed', discAmount: 10 },
    })
    expect(res.statusCode).toBe(200)
    const upd = (app.prisma.voucher.update as any).mock.calls[0][0]
    expect(upd.data.type).toBe('DISCOUNT_FIXED')
    expect(upd.data.rmvTemplateId).toBe('tmpl-fixed')
  })
})
