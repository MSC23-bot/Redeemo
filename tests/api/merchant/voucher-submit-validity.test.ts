import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import {
  SUBMIT_LANES,
  BAG_SHAPES,
  BASE_TYPES,
  PICKER_ID,
  COMPLETE_MECHANICS,
  MECHANIC_FAIL_CASES,
  ALT_VALID_CASES,
  UNIVERSAL_CASES,
  WRAPPER_CASES,
  LEGACY_CASES,
  type BagShape,
  type SubmitLane,
  type Draft,
} from '../../fixtures/voucher-submit-validity-cases'

// ─────────────────────────────────────────────────────────────────────────────
// S5: voucher submission validity (owner requirement 2026-07-13).
//
// SUBMIT FOR REVIEW must FAIL CLOSED until every field needed to DEFINE the offer
// and CALCULATE an honest saving is present + valid. DRAFT saving stays permissive;
// only submit is gated. The advisory score is NON-GATING (complete-but-weak submits).
//
// This suite DRIVES from the canonical shared fixture
// tests/fixtures/voucher-submit-validity-cases.ts (item 4): the same case list the
// merchant-web client-gate jest suite consumes, so the two layers cannot drift on
// WHICH cases exist. It runs the full cross-product: every structured type x
// { complete submits 200; each missing/invalid/inconsistent field rejects 400
// VOUCHER_INCOMPLETE with the right { field, code } } for BOTH submit paths
// (custom submitVoucher + flagship submitRmvVoucherCore) AND BOTH canonical stored
// bag shapes (plan S5.2), plus the wrapper cases, the legacy/opaque-bag
// compatibility cases, the resubmission path, and (inline, backend-resolver
// specific) shape confusion + precedence.
// ─────────────────────────────────────────────────────────────────────────────

// Build the stored Voucher.merchantFields bag for a base type in the given shape.
function bagFor(shape: BagShape, type: string, mechanic: Draft): Draft {
  const builderType = PICKER_ID[type]
  if (shape === 'nested') {
    return { merchantFields: { builderType, ...mechanic } }
  }
  return {
    askHelp: false,
    builderType,
    draftFields: { type: builderType, ...mechanic },
    selectedClauseIds: ['tell_staff'],
    customTerms: [],
  }
}

// Build the stored bag for a wrapper (TIME_LIMITED / REUSABLE) in the given shape.
// single = the REAL custom write (builderType 'time'/'reusable' + baseMechanic);
// nested = the fallback shape a direct API caller could store (builderType IS the
// mechanic id inside the nested bag). A null baseMechanic = marker-only bag (the
// merchant never completed Step 1; single shape only).
function wrapperBagFor(shape: BagShape, pickerId: 'time' | 'reusable', baseMechanic: string | null, mechanic: Draft | null): Draft {
  if (baseMechanic === null || mechanic === null) {
    return { askHelp: false, builderType: pickerId }
  }
  if (shape === 'nested') {
    return { merchantFields: { builderType: baseMechanic, ...mechanic } }
  }
  return {
    askHelp: false,
    builderType: pickerId,
    baseMechanic,
    draftFields: { type: baseMechanic, ...mechanic },
    selectedClauseIds: ['tell_staff'],
    customTerms: [],
  }
}

function without(draft: Draft, key: string): Draft {
  const c = { ...draft }
  delete c[key]
  return c
}

// ── shared prisma mock ────────────────────────────────────────────────────────

function makePrisma() {
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
      findMany: vi.fn().mockResolvedValue([
        { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] },
      ]),
    },
    voucher: {
      findFirst: vi.fn(),
      update: vi.fn().mockImplementation(async (a: any) => ({ id: a.where.id, ...a.data })),
    },
    rmvTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
    adminApproval: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'appr1' }),
      update: vi.fn().mockResolvedValue({ id: 'appr1' }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
  return prismaMock
}

// Build a DRAFT voucher fixture for the lane with a prebuilt merchantFields bag.
function buildVoucher(
  lane: SubmitLane,
  opts: { type: string; title?: unknown; estimatedSaving?: unknown; bag: unknown; approvalStatus?: string; windows?: unknown[]; cooldownSeconds?: number | null },
) {
  const common = {
    type: opts.type,
    title: opts.title === undefined ? 'A voucher title' : opts.title,
    estimatedSaving: opts.estimatedSaving === undefined ? 5 : opts.estimatedSaving,
    status: 'DRAFT',
    approvalStatus: opts.approvalStatus ?? 'PENDING',
    merchantFields: opts.bag,
    publishedAt: null,
  }
  if (lane === 'custom') {
    return {
      id: 'v1', merchantId: 'm1', code: 'RCV-ABC12345', isRmv: false, isMandatory: false,
      rmvTemplateId: null, availabilityWindows: opts.windows ?? [], cooldownSeconds: opts.cooldownSeconds ?? null,
      ...common,
    }
  }
  return {
    id: 'rmv1', merchantId: 'm1', code: 'RMV-ABC12345', isRmv: true, isMandatory: true,
    rmvTemplateId: 'tmpl1',
    rmvTemplate: { id: 'tmpl1', categoryId: 'cat1', voucherType: opts.type, allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl'] },
    ...common,
  }
}

function submitUrl(lane: SubmitLane): string {
  return lane === 'custom' ? '/api/v1/merchant/vouchers/v1/submit' : '/api/v1/merchant/vouchers/rmv/rmv1/submit'
}

const WINDOW = { dayOfWeek: 2, openTime: '17:00', closeTime: '21:00' }

// ── lane x shape cross-product (fixture-driven) ────────────────────────────────

for (const lane of SUBMIT_LANES) {
  for (const shape of BAG_SHAPES) {
    describe(`S5 ${lane} lane, ${shape} bag shape: fail-closed matrix (fixture-driven)`, () => {
      let app: FastifyInstance
      let token: string

      beforeEach(async () => {
        app = await buildApp()
        app.decorate('prisma', makePrisma() as any)
        app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
        await app.ready()
        token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
      })
      afterEach(async () => { await app.close() })

      const submit = (voucher: any) => {
        app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(voucher)
        return app.inject({ method: 'POST', url: submitUrl(lane), headers: { authorization: `Bearer ${token}` } })
      }

      for (const type of BASE_TYPES) {
        it(`${type}: a complete voucher submits (200)`, async () => {
          const res = await submit(buildVoucher(lane, { type, bag: bagFor(shape, type, COMPLETE_MECHANICS[type]) }))
          expect(res.statusCode).toBe(200)
          expect(app.prisma.voucher.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL' }) }),
          )
        })

        it.each(MECHANIC_FAIL_CASES[type])(`${type}: rejects "$name" with VOUCHER_INCOMPLETE`, async ({ mechanic, expect: exp }) => {
          const res = await submit(buildVoucher(lane, { type, bag: bagFor(shape, type, mechanic) }))
          expect(res.statusCode).toBe(400)
          const body = JSON.parse(res.body)
          expect(body.error.code).toBe('VOUCHER_INCOMPLETE')
          expect(body.error.fields).toEqual(expect.arrayContaining([expect.objectContaining(exp)]))
          // Fail closed: no status flip, no approval row written.
          expect(app.prisma.voucher.update).not.toHaveBeenCalled()
        })
      }

      // Alternative valid shapes (positive cases that must NOT be blocked).
      it.each(ALT_VALID_CASES)('$name', async ({ type, mechanic }) => {
        const res = await submit(buildVoucher(lane, { type, bag: bagFor(shape, type, mechanic) }))
        expect(res.statusCode).toBe(200)
      })

      // Universal invariants (checked regardless of the structured bag).
      it.each(UNIVERSAL_CASES)('rejects "$name" (universal invariant)', async ({ type, voucherPatch, expect: exp }) => {
        const res = await submit(buildVoucher(lane, { type, ...voucherPatch, bag: bagFor(shape, type, COMPLETE_MECHANICS[type]) }))
        expect(res.statusCode).toBe(400)
        const body = JSON.parse(res.body)
        expect(body.error.code).toBe('VOUCHER_INCOMPLETE')
        expect(body.error.fields).toEqual(expect.arrayContaining([expect.objectContaining(exp)]))
      })
    })
  }
}

// ── wrappers (custom-only), fixture-driven across shapes ──────────────────────

describe('S5 wrappers (TIME_LIMITED + REUSABLE, custom lane, fixture-driven)', () => {
  let app: FastifyInstance
  let token: string
  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma() as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  })
  afterEach(async () => { await app.close() })

  const submit = (voucher: any) => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(voucher)
    return app.inject({ method: 'POST', url: '/api/v1/merchant/vouchers/v1/submit', headers: { authorization: `Bearer ${token}` } })
  }

  for (const shape of BAG_SHAPES) {
    const cases = WRAPPER_CASES.filter((c) => (c.shapes ?? BAG_SHAPES).includes(shape))
    describe(`${shape} bag shape`, () => {
      it.each(cases)('$name', async (c) => {
        const bag = wrapperBagFor(shape, c.pickerId, c.baseMechanic, c.mechanic)
        const voucher = buildVoucher('custom', {
          type: c.wrapper,
          bag,
          windows: Array.from({ length: c.windowCount }, () => WINDOW),
          cooldownSeconds: c.cooldownSeconds,
        })
        const res = await submit(voucher)
        if (c.outcome === 'SUBMITS') {
          expect(res.statusCode).toBe(200)
          return
        }
        expect(res.statusCode).toBe(400)
        const body = JSON.parse(res.body)
        if (c.outcome === 'WINDOW_GATE') {
          expect(body.error.code).toBe('TIME_LIMITED_REQUIRES_WINDOW')
          return
        }
        expect(body.error.code).toBe('VOUCHER_INCOMPLETE')
        expect(body.error.fields).toEqual(expect.arrayContaining([expect.objectContaining(c.outcome)]))
        expect(app.prisma.voucher.update).not.toHaveBeenCalled()
      })
    })
  }
})

// ── shape confusion + precedence (backend-resolver specific, inline) ──────────

describe('S5 shape handling (confusion keys, precedence)', () => {
  let app: FastifyInstance
  let token: string
  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma() as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  })
  afterEach(async () => { await app.close() })

  const submit = (voucher: any) => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(voucher)
    return app.inject({ method: 'POST', url: '/api/v1/merchant/vouchers/v1/submit', headers: { authorization: `Bearer ${token}` } })
  }

  it('a custom bag with unrelated keys (askHelp/selectedClauseIds/customTerms/edited flags) still validates the mechanic and submits (200)', async () => {
    const bag = {
      askHelp: true,
      builderType: 'bogo',
      draftFields: { type: 'bogo', ...COMPLETE_MECHANICS.BOGO },
      selectedClauseIds: ['tell_staff', 'no_combine'],
      customTerms: [{ text: 'One per table', tier: 'fair' }],
      titleEdited: true,
      descEdited: false,
    }
    const res = await submit(buildVoucher('custom', { type: 'BOGO', bag }))
    expect(res.statusCode).toBe(200)
  })

  it('a custom bag with unrelated keys and an incomplete mechanic still rejects (unrelated keys never satisfy the matrix)', async () => {
    const bag = {
      askHelp: true,
      builderType: 'bogo',
      draftFields: { type: 'bogo', ...without(COMPLETE_MECHANICS.BOGO, 'bogoFree') },
      selectedClauseIds: ['tell_staff'],
      customTerms: [],
    }
    const res = await submit(buildVoucher('custom', { type: 'BOGO', bag }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'bogoFree', code: 'REQUIRED' })]))
  })

  it('when both shapes are somehow present, the nested flagship shape wins', async () => {
    // Nested bag is COMPLETE; the single-level markers describe an incomplete draft.
    // If precedence were wrong this would reject; nested-wins means it submits.
    const bag = {
      builderType: 'bogo',
      draftFields: { type: 'bogo' }, // incomplete on the single-level reading
      merchantFields: { builderType: 'bogo', ...COMPLETE_MECHANICS.BOGO }, // complete nested
    }
    const res = await submit(buildVoucher('custom', { type: 'BOGO', bag }))
    expect(res.statusCode).toBe(200)
  })

  it('a poisoned draftFields (non-object) degrades safely: markers alone, mechanic fields absent, rejects cleanly (no 500)', async () => {
    const bag = { askHelp: false, builderType: 'bogo', draftFields: 'garbage' }
    const res = await submit(buildVoucher('custom', { type: 'BOGO', bag }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_INCOMPLETE')
  })
})

// ── resubmission after NEEDS_CHANGES ─────────────────────────────────────────

describe('S5 resubmission (after NEEDS_CHANGES) is gated identically', () => {
  let app: FastifyInstance
  let token: string
  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma() as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  })
  afterEach(async () => { await app.close() })

  const submit = (voucher: any) => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(voucher)
    // Simulate an existing (CHANGES_REQUESTED) approval row so the reopen path runs.
    app.prisma.adminApproval.findFirst = vi.fn().mockResolvedValue({ id: 'appr-existing', status: 'CHANGES_REQUESTED' })
    return app.inject({ method: 'POST', url: '/api/v1/merchant/vouchers/v1/submit', headers: { authorization: `Bearer ${token}` } })
  }

  it('a still-incomplete resubmission is blocked (VOUCHER_INCOMPLETE, no reopen)', async () => {
    const bag = bagFor('single', 'BOGO', without(COMPLETE_MECHANICS.BOGO, 'bogoFreePrice'))
    const res = await submit(buildVoucher('custom', { type: 'BOGO', approvalStatus: 'CHANGES_REQUESTED', bag }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_INCOMPLETE')
    expect(app.prisma.adminApproval.update).not.toHaveBeenCalled()
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('a now-complete resubmission reopens the approval and submits (200)', async () => {
    const bag = bagFor('single', 'BOGO', COMPLETE_MECHANICS.BOGO)
    const res = await submit(buildVoucher('custom', { type: 'BOGO', approvalStatus: 'CHANGES_REQUESTED', bag }))
    expect(res.statusCode).toBe(200)
    expect(app.prisma.adminApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'appr-existing' }, data: expect.objectContaining({ status: 'PENDING' }) }),
    )
  })
})

// ── legacy / opaque-bag compatibility (fixture-driven) ────────────────────────

describe('S5 legacy compatibility (fixture-driven; non-structured bags validate on universal invariants only)', () => {
  let app: FastifyInstance
  let token: string
  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma() as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  })
  afterEach(async () => { await app.close() })

  const submit = (voucher: any) => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(voucher)
    return app.inject({ method: 'POST', url: '/api/v1/merchant/vouchers/v1/submit', headers: { authorization: `Bearer ${token}` } })
  }

  it.each(LEGACY_CASES)('$name', async (c) => {
    const voucher = buildVoucher('custom', {
      type: 'BOGO',
      bag: c.bag,
      ...(c.estimatedSaving !== undefined ? { estimatedSaving: c.estimatedSaving } : {}),
    })
    const res = await submit(voucher)
    if (c.outcome === 'SUBMITS') {
      expect(res.statusCode).toBe(200)
      return
    }
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('VOUCHER_INCOMPLETE')
    expect(body.error.fields).toEqual(expect.arrayContaining([expect.objectContaining(c.outcome)]))
  })
})
