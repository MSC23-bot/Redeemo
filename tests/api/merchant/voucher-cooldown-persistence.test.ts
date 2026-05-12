import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

/**
 * Merchant voucher service — cooldownSeconds persistence (M5 Task 12.5,
 * spec §4, §4.4).
 *
 * Closes a v1 limitation surfaced during Task 12 verification: the field
 * was Zod-validated at API ingress (Task 12), had DB CHECK constraints
 * (Task 1), and had a runtime clamp via `effectiveCooldownSeconds()`
 * (Task 2) — but the merchant voucher service silently DROPPED the field
 * at `prisma.voucher.create()` / `update()`.
 *
 * These tests pin the persistence path on both create + update. Assertions
 * are made against the Prisma `create` / `update` spy call args — the
 * mock `prisma` returns the same fixture object whatever's passed in,
 * so the only thing under test here is "what did the service hand to
 * Prisma?".
 *
 * Five owner-locked cases (see plan task 12.5.2):
 *
 *   1. REUSABLE + cooldownSeconds: 1800 → 1800 reaches Prisma create.
 *   2. REUSABLE + cooldownSeconds: null → null reaches Prisma create.
 *   3. non-REUSABLE + cooldownSeconds: null → null reaches Prisma create.
 *   4. PATCH REUSABLE replaces cooldownSeconds (1800 → 7200; also → null).
 *   5. PATCH non-REUSABLE with non-null cooldownSeconds is rejected at
 *      Zod ingress (Task 12 contract) and never reaches the service. We
 *      pin the negative-shape on the spy here as defence-in-depth.
 */
describe('merchant voucher service — cooldownSeconds persistence (M5 Task 12.5)', () => {
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
    cooldownSeconds: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      voucher: {
        findMany:  vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ ...mockVoucher }),
        create:    vi.fn().mockResolvedValue({ ...mockVoucher }),
        update:    vi.fn().mockResolvedValue({ ...mockVoucher }),
        delete:    vi.fn(),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null) } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    merchantToken = jwtAny.merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  // ── Case 1: REUSABLE + cooldownSeconds: 1800 persists ──────────────────
  it('CREATE REUSABLE persists cooldownSeconds: 1800 through to Prisma', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'REUSABLE',
        title: 'REUSABLE with 30min cooldown',
        estimatedSaving: 5.0,
        cooldownSeconds: 1800,
      },
    })
    expect(res.statusCode).toBe(201)
    expect(app.prisma.voucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'REUSABLE',
          cooldownSeconds: 1800,
        }),
      })
    )
  })

  // ── Case 1b: REUSABLE + cooldownSeconds: 7200 persists ─────────────────
  it('CREATE REUSABLE persists cooldownSeconds: 7200 through to Prisma', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'REUSABLE',
        title: 'REUSABLE with 2h cooldown',
        estimatedSaving: 5.0,
        cooldownSeconds: 7200,
      },
    })
    expect(res.statusCode).toBe(201)
    expect(app.prisma.voucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'REUSABLE',
          cooldownSeconds: 7200,
        }),
      })
    )
  })

  // ── Case 2: REUSABLE + cooldownSeconds: null persists as null ──────────
  it('CREATE REUSABLE persists cooldownSeconds: null through to Prisma', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'REUSABLE',
        title: 'REUSABLE no cooldown',
        estimatedSaving: 5.0,
        cooldownSeconds: null,
      },
    })
    expect(res.statusCode).toBe(201)
    expect(app.prisma.voucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'REUSABLE',
          cooldownSeconds: null,
        }),
      })
    )
  })

  // ── Case 3: non-REUSABLE + cooldownSeconds: null persists as null ──────
  it('CREATE BOGO with explicit cooldownSeconds: null persists as null', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'BOGO',
        title: 'BOGO offer',
        estimatedSaving: 5.0,
        cooldownSeconds: null,
      },
    })
    expect(res.statusCode).toBe(201)
    expect(app.prisma.voucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'BOGO',
          cooldownSeconds: null,
        }),
      })
    )
  })

  // ── Case 3b: non-REUSABLE with omitted cooldownSeconds persists as null
  // The Zod default is "undefined" for omitted; the service must coerce
  // that to "null" at the Prisma layer (or pass undefined which Prisma
  // treats as "do nothing" — the column default is null per schema). The
  // assertion below allows either undefined OR null in the create call:
  // both map to a null column value.
  it('CREATE BOGO with omitted cooldownSeconds reaches Prisma as null or undefined', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        type: 'BOGO',
        title: 'BOGO offer (no cooldown field)',
        estimatedSaving: 5.0,
      },
    })
    expect(res.statusCode).toBe(201)
    const createCall = (app.prisma.voucher.create as any).mock.calls[0][0]
    // cooldownSeconds should be absent OR explicitly null — never set to
    // a non-null number when the type is not REUSABLE.
    expect(createCall.data.cooldownSeconds ?? null).toBeNull()
  })

  // ── Case 4: PATCH replace cooldownSeconds for REUSABLE ─────────────────
  // PATCH must include `type: 'REUSABLE'` alongside a non-null
  // cooldownSeconds (Task 12 contract — the Zod partial refine rejects
  // non-null cooldownSeconds when `type` is omitted, as it can't verify
  // type/cooldown coherence without it).
  it('PATCH REUSABLE updates cooldownSeconds (1800 → 7200)', async () => {
    // Existing voucher returned by findFirst is REUSABLE with 1800.
    app.prisma.voucher.findFirst = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, type: 'REUSABLE', cooldownSeconds: 1800 })
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { type: 'REUSABLE', cooldownSeconds: 7200 },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1' },
        data: expect.objectContaining({
          cooldownSeconds: 7200,
        }),
      })
    )
  })

  // ── Case 4b: PATCH REUSABLE updates cooldownSeconds to null ────────────
  // null is allowed regardless of whether `type` is included; the Zod
  // partial refine only rejects NON-null cooldownSeconds when `type` is
  // omitted. Include `type` here for symmetry with 4a.
  it('PATCH REUSABLE updates cooldownSeconds (1800 → null)', async () => {
    app.prisma.voucher.findFirst = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, type: 'REUSABLE', cooldownSeconds: 1800 })
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { type: 'REUSABLE', cooldownSeconds: null },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1' },
        data: expect.objectContaining({
          cooldownSeconds: null,
        }),
      })
    )
  })

  // ── Case 4c: PATCH with no cooldownSeconds field does NOT touch the
  // column (Zod produces no `cooldownSeconds` key; the service must not
  // synthesise one).
  it('PATCH without cooldownSeconds field leaves the column untouched', async () => {
    app.prisma.voucher.findFirst = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, type: 'REUSABLE', cooldownSeconds: 1800 })
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { title: 'New title only' },
    })
    expect(res.statusCode).toBe(200)
    const updateCall = (app.prisma.voucher.update as any).mock.calls[0][0]
    expect('cooldownSeconds' in updateCall.data).toBe(false)
  })

  // ── Case 5: PATCH non-REUSABLE rejects non-null cooldownSeconds (Zod
  // ingress) — defence-in-depth pin on the spy. The Zod refine for
  // updates is in routes.ts; this test re-confirms the service is never
  // reached.
  it('PATCH BOGO with non-null cooldownSeconds is rejected by Zod, never reaches service', async () => {
    app.prisma.voucher.findFirst = vi
      .fn()
      .mockResolvedValue({ ...mockVoucher, type: 'BOGO', cooldownSeconds: null })
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { type: 'BOGO', cooldownSeconds: 3600 },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })
})
