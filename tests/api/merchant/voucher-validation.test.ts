import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

/**
 * Merchant voucher create/update — Zod ingress validation for REUSABLE
 * `cooldownSeconds` (M5 Task 12, spec §4.4).
 *
 * Three-layer validation contract:
 *   1. Zod ingress (this test file) — outermost shell; rejects bad input
 *      cleanly with 400 + VALIDATION_ERROR.
 *   2. Runtime clamp via `effectiveCooldownSeconds()` (Task 2) — handles
 *      null defaults + below-floor at read time.
 *   3. DB CHECK constraints (Task 1) — defence-in-depth at persistence.
 *
 * Owner-locked cases (5):
 *   1. Rejects cooldownSeconds < 1800 on REUSABLE (e.g. 1799 → 400).
 *   2. Rejects non-null cooldownSeconds on non-REUSABLE (e.g. BOGO + 3600).
 *   3. Accepts cooldownSeconds = 1800 on REUSABLE (floor inclusive).
 *   4. Accepts null cooldownSeconds on REUSABLE.
 *   5. Accepts null cooldownSeconds on non-REUSABLE (existing default).
 */
describe('merchant voucher routes — cooldownSeconds Zod validation (M5 Task 12)', () => {
  let app: FastifyInstance
  let merchantToken: string

  const mockVoucher = {
    id: 'v1',
    merchantId: 'm1',
    code: 'RCV-ABC12345',
    isRmv: false,
    type: 'REUSABLE',
    title: 'Reusable test',
    description: null,
    terms: null,
    imageUrl: null,
    estimatedSaving: 5.0,
    expiryDate: null,
    status: 'DRAFT',
    approvalStatus: 'PENDING',
    isMandatory: false,
    rmvTemplateId: null,
    merchantFields: null,
    publishedAt: null,
    approvalComment: null,
    approvedAt: null,
    approvedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
        // Staff & Access PR-B: voucher service resolves via resolveMerchantContext (OWNER row -> voucher power by role).
        findMany: vi.fn().mockResolvedValue([{ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] }]),
      },
      voucher: {
        findMany:  vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ ...mockVoucher }),
        create:    vi.fn().mockResolvedValue({ ...mockVoucher }),
        update:    vi.fn().mockResolvedValue({ ...mockVoucher }),
        delete:    vi.fn(),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    merchantToken = jwtAny.merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  // ── Case 1: < 1800 on REUSABLE rejected ────────────────────────────────
  it('REJECTS cooldownSeconds < 1800 on REUSABLE (1799 → 400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'REUSABLE',
        title: 'Too short cooldown',
        estimatedSaving: 5,
        cooldownSeconds: 1799,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
    expect(app.prisma.voucher.create).not.toHaveBeenCalled()
  })

  // ── Case 2: non-null on non-REUSABLE rejected ──────────────────────────
  it('REJECTS non-null cooldownSeconds on non-REUSABLE (BOGO + 3600 → 400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'BOGO',
        title: 'BOGO with cooldown',
        estimatedSaving: 5,
        cooldownSeconds: 3600,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
    expect(app.prisma.voucher.create).not.toHaveBeenCalled()
  })

  // ── Case 3: floor-inclusive 1800 on REUSABLE accepted ──────────────────
  it('ACCEPTS cooldownSeconds = 1800 on REUSABLE (floor inclusive)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'REUSABLE',
        title: 'Floor-exact cooldown',
        estimatedSaving: 5,
        cooldownSeconds: 1800,
      },
    })
    expect(res.statusCode).toBe(201)
  })

  // ── Case 4: null cooldownSeconds on REUSABLE accepted ──────────────────
  it('ACCEPTS null cooldownSeconds on REUSABLE (defaults applied via runtime clamp)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'REUSABLE',
        title: 'No cooldown',
        estimatedSaving: 5,
        cooldownSeconds: null,
      },
    })
    expect(res.statusCode).toBe(201)
  })

  // ── Case 5: null cooldownSeconds on non-REUSABLE accepted (default) ────
  it('ACCEPTS null cooldownSeconds on non-REUSABLE (existing default behaviour)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'BOGO',
        title: 'BOGO no cooldown',
        estimatedSaving: 5,
        cooldownSeconds: null,
      },
    })
    expect(res.statusCode).toBe(201)
  })

  // ── Additional defence: omitted cooldownSeconds accepted everywhere ────
  it('ACCEPTS omitted cooldownSeconds on REUSABLE (existing default behaviour)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'REUSABLE',
        title: 'Omitted cooldown',
        estimatedSaving: 5,
      },
    })
    expect(res.statusCode).toBe(201)
  })

  it('ACCEPTS omitted cooldownSeconds on non-REUSABLE (existing default behaviour)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'DISCOUNT_PERCENT',
        title: '10% off',
        estimatedSaving: 5,
      },
    })
    expect(res.statusCode).toBe(201)
  })

  // ── PATCH (update) — same refine applies via .partial() ─────────────────
  it('PATCH REJECTS cooldownSeconds < 1800 on REUSABLE update', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { type: 'REUSABLE', cooldownSeconds: 1799 },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('PATCH REJECTS non-null cooldownSeconds on a BOGO update', async () => {
    // PR #72 pre-merge review fix (Finding 2, 2026-05-12): the
    // cross-field "non-null cooldownSeconds requires REUSABLE type" rule
    // moved from Zod (updateVoucherSchema refine) to the service layer
    // (updateVoucher). Status code is still 400, but the error code is
    // now COOLDOWN_REUSABLE_ONLY instead of VALIDATION_ERROR — the
    // failure is functionally identical, surfaced from the service tier
    // after Zod accepts the partial-field shape. `findFirst` returns a
    // REUSABLE existing voucher by default; the PATCH explicitly sends
    // `type: 'BOGO'`, so `effectiveType === 'BOGO'` and the service
    // rejects.
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { type: 'BOGO', cooldownSeconds: 3600 },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('COOLDOWN_REUSABLE_ONLY')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('PATCH ACCEPTS cooldownSeconds = 1800 on REUSABLE update', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { type: 'REUSABLE', cooldownSeconds: 1800 },
    })
    expect(res.statusCode).toBe(200)
  })

  // ── PR #72 pre-merge review fix (Finding 2, 2026-05-12): PATCH
  //    cooldownSeconds alone now passes Zod validation on an existing
  //    REUSABLE voucher. The cross-field refine on updateVoucherSchema
  //    was relaxed; the service-layer check (against effectiveType =
  //    data.type ?? existing.type) carries the cross-field rule.
  it('PATCH ACCEPTS cooldownSeconds alone on existing REUSABLE (type omitted)', async () => {
    // Default mockVoucher.findFirst returns a REUSABLE row, so the
    // service-layer check resolves effectiveType to REUSABLE and the
    // PATCH succeeds without an explicit type field in the payload.
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { cooldownSeconds: 7200 },                        // type OMITTED
    })
    expect(res.statusCode).toBe(200)
  })

  it('PATCH STILL REJECTS cooldownSeconds < 1800 (floor preserved) even when type is omitted', async () => {
    // Field-level Zod validation (min 1800, integer) must still run on
    // partial updates — only the cross-field type check moved to the
    // service layer.
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { cooldownSeconds: 1799 },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })
})
