import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Backend payload-contract tests for getCustomerVoucher REUSABLE deltas.
//
// Spec: docs/superpowers/specs/2026-05-12-reusable-voucher-design.md
//   §6.1 — payload deltas (effectiveCooldownSeconds, availableAgainAt,
//          isRedeemedThisCycle: false always, lastRedemption unchanged)
//   §6.3 — two-clock independence lock between presentation window (2h)
//          and cooldown window
//   §7.4 — D44 expiry-before-available-again is computed on the FRONTEND
//          from existing payload fields; no new backend metadata.
//
// Locked decisions exercised here:
//   D13 — isRedeemedThisCycle is ALWAYS false for REUSABLE
//   D14 — lastRedemption is gated by the 2h presentation window ONLY
//         (independent of cooldown duration)
//   D16 — availableAgainAt is reused with type-specific semantics
//   D19 — raw Voucher.cooldownSeconds is NEVER exposed to the client;
//         only effectiveCooldownSeconds (server-clamped) is surfaced.
//
// Test fixture pattern mirrors discovery.voucher-last-redemption.test.ts
// (mocked Prisma via vi.mock).

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {
    constructor(_opts: { connectionString: string }) {}
  },
}))

vi.mock('../../../generated/prisma/client', () => {
  class PrismaClient {
    voucher                 = { findUnique: vi.fn() }
    subscription            = { findUnique: vi.fn() }
    userVoucherCycleState   = { findUnique: vi.fn() }
    favouriteVoucher        = { findUnique: vi.fn() }
    // For REUSABLE the service does an extra findFirst keyed by
    // (userId, voucherId) ordered by redeemedAt desc to compute
    // availableAgainAt. The shared lastRedemption findFirst (cycle-
    // gated) is also covered here; default returns null so REUSABLE
    // calls don't trip the cycle-gate branch.
    voucherRedemption       = {
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy:   vi.fn().mockResolvedValue([]),
    }
    constructor(_opts?: any) {}
  }
  return {
    PrismaClient,
    MerchantStatus:  { ACTIVE: 'ACTIVE' },
    VoucherStatus:   { ACTIVE: 'ACTIVE' },
    ApprovalStatus:  { APPROVED: 'APPROVED' },
  }
})

import { getCustomerVoucher } from '../../../src/api/customer/discovery/service'
import { PrismaClient } from '../../../generated/prisma/client'

const VOUCHER_ID = 'v-reusable-1'
const USER_ID    = 'u-reusable-1'

// Fixed test clock — picked to make all the cooldown arithmetic obvious.
const TEST_NOW = new Date('2026-05-15T12:00:00.000Z')

function makeReusableVoucher(opts: { cooldownSeconds?: number | null } = {}) {
  return {
    id: VOUCHER_ID,
    title: 'Free coffee refill',
    type: 'REUSABLE',
    description: null,
    terms: null,
    imageUrl: null,
    estimatedSaving: 3.0,
    expiryDate: null,
    code: null,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    cooldownSeconds: opts.cooldownSeconds ?? null,
    merchant: {
      id: 'm-reusable',
      businessName: 'Cafe Loop',
      tradingName: null,
      logoUrl: null,
      status: 'ACTIVE',
    },
    availabilityWindows: [],
  }
}

function makeNonReusableVoucher() {
  return {
    id: VOUCHER_ID,
    title: 'Buy one get one',
    type: 'BOGO',
    description: null,
    terms: null,
    imageUrl: null,
    estimatedSaving: 8.0,
    expiryDate: null,
    code: null,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    cooldownSeconds: null,
    merchant: {
      id: 'm-bogo',
      businessName: 'Pizza Palace',
      tradingName: null,
      logoUrl: null,
      status: 'ACTIVE',
    },
    availabilityWindows: [],
  }
}

function makePrisma() {
  const prisma = new PrismaClient({} as any) as any
  prisma.favouriteVoucher.findUnique.mockResolvedValue(null)
  return prisma
}

// Active subscription with anchor on 2026-05-05; current cycle is
// 2026-05-05 → 2026-06-05. All the REUSABLE-state mocks below keep
// the user inside that window so the subscription-gate branch fires.
function mockActiveSubscription(prisma: any) {
  prisma.subscription.findUnique.mockResolvedValue({
    status: 'ACTIVE',
    cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
  })
  prisma.userVoucherCycleState.findUnique.mockResolvedValue(null)
}

describe('getCustomerVoucher — REUSABLE deltas (spec §6.1, §6.3, D13-D16, D19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(TEST_NOW)
  })

  // ── effectiveCooldownSeconds — D19 clamp + null exposure ────────────

  it('effectiveCooldownSeconds = 14400 when Voucher.cooldownSeconds is null (platform default)', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: null }))
    mockActiveSubscription(prisma)
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.effectiveCooldownSeconds).toBe(14400)
  })

  it('effectiveCooldownSeconds = merchant value when set above the floor', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 3600 }))
    mockActiveSubscription(prisma)
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.effectiveCooldownSeconds).toBe(3600)
  })

  it('effectiveCooldownSeconds is clamped to the 1800 floor (defense in depth)', async () => {
    // Should never get here via Zod/DB-CHECK, but Math.max in
    // effectiveCooldownSeconds() must still clamp at runtime.
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 60 }))
    mockActiveSubscription(prisma)
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.effectiveCooldownSeconds).toBe(1800)
  })

  it('effectiveCooldownSeconds = null for non-REUSABLE voucher (BOGO)', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeNonReusableVoucher())
    mockActiveSubscription(prisma)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.effectiveCooldownSeconds).toBeNull()
  })

  it('D19 — raw voucher.cooldownSeconds is NEVER exposed on the customer payload', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 3600 }))
    mockActiveSubscription(prisma)
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    // The customer-facing field MUST be `effectiveCooldownSeconds` only.
    // Raw `cooldownSeconds` from the row stays server-side and must not
    // leak through the response object.
    expect((result as any).cooldownSeconds).toBeUndefined()
    expect(result.effectiveCooldownSeconds).toBe(3600)
  })

  // ── isRedeemedThisCycle — D13 lock ───────────────────────────────────

  it('D13 — isRedeemedThisCycle is ALWAYS false for REUSABLE (no recent redemption)', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher())
    mockActiveSubscription(prisma)
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.isRedeemedThisCycle).toBe(false)
  })

  it('D13 — isRedeemedThisCycle is ALWAYS false for REUSABLE (even with a redemption 1h ago)', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 14400 }))
    mockActiveSubscription(prisma)
    // Last redemption 1h ago — still inside cooldown.
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      redeemedAt: new Date(TEST_NOW.getTime() - 60 * 60 * 1000),
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    // Even with a fresh redemption, REUSABLE never enters the
    // cycle-redeemed terminal state. Frontend routes off `voucher.type`.
    expect(result.isRedeemedThisCycle).toBe(false)
  })

  it('D13 — isRedeemedThisCycle is ALWAYS false for REUSABLE (cycle-state row present from another voucher would not flip it)', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher())
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    // Cycle-state row says redeemed-in-current-cycle (would normally
    // flip isRedeemedThisCycle to true for cycle vouchers). REUSABLE
    // must hard-override to false regardless.
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.isRedeemedThisCycle).toBe(false)
  })

  // ── availableAgainAt — cooldown clock semantics (D16) ────────────────

  it('availableAgainAt = null when no prior redemption', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 14400 }))
    mockActiveSubscription(prisma)
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.availableAgainAt).toBeNull()
  })

  it('availableAgainAt = ISO of lastRedeemedAt + effectiveCooldownMs when in cooldown', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 14400 }))
    mockActiveSubscription(prisma)
    // Redemption 1h ago, 4h cooldown → availableAgainAt 3h from now.
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 60 * 60 * 1000)
    prisma.voucherRedemption.findFirst.mockResolvedValue({ redeemedAt: lastRedeemedAt })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    const expected = new Date(lastRedeemedAt.getTime() + 14400 * 1000).toISOString()
    expect(result.availableAgainAt).toBe(expected)
    // Sanity — that's 3h after TEST_NOW.
    expect(result.availableAgainAt).toBe(new Date('2026-05-15T15:00:00.000Z').toISOString())
  })

  it('availableAgainAt = null when cooldown elapsed (computed instant is in the past)', async () => {
    // Convention: surface only future instants; <= now → null so the
    // customer-app can use truthiness checks without time math.
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 14400 }))
    mockActiveSubscription(prisma)
    // Redemption 5h ago, 4h cooldown → cooldown expired 1h ago.
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      redeemedAt: new Date(TEST_NOW.getTime() - 5 * 60 * 60 * 1000),
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.availableAgainAt).toBeNull()
  })

  // ── lastRedemption — 2h presentation window only (D14, §6.3) ─────────
  //
  // The locked invariant: lastRedemption gating is the M3 contract,
  // unchanged for REUSABLE. The block is populated ONLY when the
  // cycle-window gate is open (cycle vouchers) — REUSABLE skips that
  // gate entirely (D13 → isRedeemedThisCycle stays false), so the
  // existing cycle-gated lastRedemption branch DOESN'T fire for
  // REUSABLE. M3's RedemptionDetailsCard for REUSABLE is rendered from
  // the redemption-mutation response (in-memory lastRedemption) — see
  // spec §6.2. The persisted return-visit `lastRedemption` block for
  // REUSABLE is part of a future task (Q5 §P2 follow-up) and
  // intentionally null in v1.
  //
  // These tests pin "stays null and DOES NOT fire the cycle-gated
  // findFirst" — same scenarios listed by the owner so the two-clock
  // independence semantics are encoded.

  it('§6.3 — presentation window alive AND cooldown active: REUSABLE response keeps lastRedemption null (cycle-gate skipped)', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 14400 }))
    mockActiveSubscription(prisma)
    // Redemption 30min ago, 4h cooldown → presentation alive (<2h) +
    // cooldown active.
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 30 * 60 * 1000)
    prisma.voucherRedemption.findFirst.mockResolvedValue({ redeemedAt: lastRedeemedAt })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.availableAgainAt).toBe(
      new Date(lastRedeemedAt.getTime() + 14400 * 1000).toISOString(),
    )
    // REUSABLE bypasses the cycle-state gate, so the cycle-gated
    // lastRedemption findFirst NEVER fires; the field stays null.
    // Frontend's just-redeemed RedemptionDetailsCard is driven by the
    // in-memory mutation response, not by this payload field.
    expect(result.lastRedemption).toBeNull()
  })

  it('§6.3 — presentation expired AND cooldown active: lastRedemption stays null, availableAgainAt still set', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 14400 }))
    mockActiveSubscription(prisma)
    // Redemption 3h ago, 4h cooldown → presentation expired + still in cooldown.
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 3 * 60 * 60 * 1000)
    prisma.voucherRedemption.findFirst.mockResolvedValue({ redeemedAt: lastRedeemedAt })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.lastRedemption).toBeNull()
    expect(result.availableAgainAt).toBe(
      new Date(lastRedeemedAt.getTime() + 14400 * 1000).toISOString(),
    )
  })

  it('§6.3 state 4 — cooldown ELAPSED + presentation alive: availableAgainAt = null, REUSABLE distinguisher', async () => {
    // This is the genuine REUSABLE state-4 case from spec §6.3 / §7.1.
    // Last redemption 35min ago, 30min cooldown → cooldown elapsed
    // 5min ago, but the presentation window is still alive (<2h).
    // Customer-app routes off (lastRedemption present AND
    // availableAgainAt = null) to show ACTIVE Redeem CTA + persisted
    // card together. Payload: availableAgainAt must be null
    // (cooldown done), and lastRedemption is null at the payload
    // level (cycle-gate bypassed); the in-memory mutation response
    // carries the just-redeemed lastRedemption for the live session.
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 1800 }))
    mockActiveSubscription(prisma)
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 35 * 60 * 1000)
    prisma.voucherRedemption.findFirst.mockResolvedValue({ redeemedAt: lastRedeemedAt })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.availableAgainAt).toBeNull()
    expect(result.lastRedemption).toBeNull()
    expect(result.isRedeemedThisCycle).toBe(false)
  })

  // ── REUSABLE doesn't touch the cycle-state gate ─────────────────────

  it('REUSABLE branch fires a (userId, voucherId) findFirst keyed for availableAgainAt only', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 14400 }))
    mockActiveSubscription(prisma)
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      redeemedAt: new Date(TEST_NOW.getTime() - 60 * 60 * 1000),
    })

    await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    // The REUSABLE branch queries the latest (userId, voucherId)
    // redemption regardless of cycle window — no `redeemedAt: { gte,
    // lt }` clause (which is what the cycle-gated lastRedemption
    // branch uses).
    const calls = prisma.voucherRedemption.findFirst.mock.calls
    const reusableCall = calls.find((c: any[]) => {
      const where = c[0]?.where ?? {}
      return where.userId === USER_ID
        && where.voucherId === VOUCHER_ID
        && where.redeemedAt === undefined
    })
    expect(reusableCall).toBeDefined()
  })

  // ── Subscription-gate behaviour (§6.5) — cooldown info data-only ─────

  it('no subscription — REUSABLE payload still surfaces effectiveCooldownSeconds (data-only)', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 3600 }))
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.userVoucherCycleState.findUnique.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.effectiveCooldownSeconds).toBe(3600)
    // No subscription → no recent-redemption query fires → no cooldown
    // countdown surfaces.
    expect(result.availableAgainAt).toBeNull()
    expect(result.isRedeemedThisCycle).toBe(false)
  })

  it('guest (userId = null) — REUSABLE payload still surfaces effectiveCooldownSeconds', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: null }))

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, null)

    expect(result.effectiveCooldownSeconds).toBe(14400)
    expect(result.availableAgainAt).toBeNull()
    expect(result.isRedeemedThisCycle).toBe(false)
    // Guest path should not touch any user-scoped queries.
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled()
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
  })
})
