import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Backend payload-contract tests for getCustomerVoucher REUSABLE deltas.
//
// Spec: docs/superpowers/specs/2026-05-12-reusable-voucher-design.md
//   §6.1 — payload deltas (effectiveCooldownSeconds, availableAgainAt,
//          isRedeemedThisCycle: false always, lastRedemption gated on
//          the 2h presentation window only)
//   §6.3 — two-clock independence lock between presentation window (2h)
//          and cooldown window
//   §7.1 — state 4: cooldown elapsed + presentation alive distinguisher
//          (active Redeem CTA + persisted RedemptionDetailsCard)
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

// REUSABLE-branch query layout after the PR #72 review polish:
//   (a) cooldown-clock: SOURCED FROM `lastRedemptionMap` (populated via
//       `batchLastRedemptionsByVoucher`, which runs `groupBy`). No
//       redundant `findFirst` fires for cooldown computation anymore —
//       see the dedicated regression test below.
//   (b) presentation-window: where { userId, voucherId, redeemedAt:
//       { gte: PRESENTATION_START } }, ordered desc, full row shape
//       (redemptionCode, branch, isValidated, validatedAt) — still a
//       `findFirst` (full row data the groupBy doesn't carry).
// This helper mocks BOTH the groupBy (cooldown source) AND the
// presentation-window findFirst (return-visit source) consistently.
function mockReusableRedemption(
  prisma: any,
  redeemedAt: Date,
  opts: {
    code?: string
    branch?: { id: string; name: string }
    isValidated?: boolean
    validatedAt?: Date | null
    voucherId?: string
  } = {},
) {
  const fullRow = {
    redeemedAt,
    redemptionCode: opts.code ?? 'TESTCODE',
    branch: opts.branch ?? { id: 'b-1', name: 'Main Branch' },
    isValidated: opts.isValidated ?? false,
    validatedAt: opts.validatedAt ?? null,
  }
  // groupBy drives the cooldown clock (lastRedemptionMap).
  prisma.voucherRedemption.groupBy.mockResolvedValue([
    { voucherId: opts.voucherId ?? VOUCHER_ID, _max: { redeemedAt } },
  ])
  // findFirst handles the cycle-gated + presentation-window branches.
  prisma.voucherRedemption.findFirst.mockImplementation((args: any) => {
    const where = args?.where ?? {}
    // Cycle-gated branch: has `redeemedAt: { gte, lt }`. Returns null —
    // REUSABLE bypasses this branch (isRedeemedThisCycle stays false).
    if (where.redeemedAt && 'lt' in where.redeemedAt) {
      return Promise.resolve(null)
    }
    // Presentation-window branch: only `redeemedAt: { gte }` (no `lt`).
    // Returns the full row when the redemption is inside the 2h window.
    if (where.redeemedAt && 'gte' in where.redeemedAt && !('lt' in where.redeemedAt)) {
      const since = where.redeemedAt.gte instanceof Date
        ? where.redeemedAt.gte.getTime()
        : new Date(where.redeemedAt.gte).getTime()
      if (redeemedAt.getTime() >= since) {
        return Promise.resolve(fullRow)
      }
      return Promise.resolve(null)
    }
    // Any other shape — no longer expected for the REUSABLE cooldown
    // branch after PR #72 review polish (now sourced from groupBy).
    return Promise.resolve(null)
  })
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
    // Last redemption 1h ago — still inside cooldown. Sourced via
    // groupBy (PR #72 review polish — lastRedemptionMap), not findFirst.
    prisma.voucherRedemption.groupBy.mockResolvedValue([
      { voucherId: VOUCHER_ID, _max: { redeemedAt: new Date(TEST_NOW.getTime() - 60 * 60 * 1000) } },
    ])

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
    // Sourced via groupBy (PR #72 review polish — lastRedemptionMap),
    // not findFirst.
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 60 * 60 * 1000)
    prisma.voucherRedemption.groupBy.mockResolvedValue([
      { voucherId: VOUCHER_ID, _max: { redeemedAt: lastRedeemedAt } },
    ])

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
    // Redemption 5h ago, 4h cooldown → cooldown expired 1h ago. Sourced
    // via groupBy (PR #72 review polish — lastRedemptionMap), not
    // findFirst.
    prisma.voucherRedemption.groupBy.mockResolvedValue([
      { voucherId: VOUCHER_ID, _max: { redeemedAt: new Date(TEST_NOW.getTime() - 5 * 60 * 60 * 1000) } },
    ])

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.availableAgainAt).toBeNull()
  })

  // ── lastRedemption — 2h presentation window only (D14, §6.3) ─────────
  //
  // The locked invariant: REUSABLE has its OWN lastRedemption fetch
  // gated on the 2h presentation window from redeemedAt — independent
  // of cycle state and independent of the cooldown clock (spec §6.1 +
  // §6.3 + §7.1 state 4). REUSABLE does NOT participate in the
  // cycle-state gate (D13 → isRedeemedThisCycle stays false), so the
  // existing cycle-gated lastRedemption branch never fires for
  // REUSABLE; the REUSABLE-specific presentation-window branch carries
  // persisted return-visit data instead.
  //
  // Four-state truth table (spec §6.3):
  //   state 2: redeemedAt <2h ago, cooldown active   → lastRedemption present, availableAgainAt present
  //   state 3: redeemedAt >2h ago, cooldown active   → lastRedemption null,    availableAgainAt present
  //   state 4: redeemedAt <2h ago, cooldown elapsed  → lastRedemption present, availableAgainAt null
  //   late:    redeemedAt >2h ago, cooldown elapsed  → lastRedemption null,    availableAgainAt null

  it('§6.3 state 2 — presentation alive AND cooldown active: lastRedemption populated + availableAgainAt set', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 14400 }))
    mockActiveSubscription(prisma)
    // Redemption 30min ago, 4h cooldown → presentation alive (<2h) +
    // cooldown active. lastRedemption populates (M3 §AE window),
    // availableAgainAt populates (cooldown clock).
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 30 * 60 * 1000)
    mockReusableRedemption(prisma, lastRedeemedAt, {
      code: 'REUSAB01',
      branch: { id: 'b-cafe', name: 'Cafe Loop · Camden' },
      isValidated: false,
      validatedAt: null,
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.availableAgainAt).toBe(
      new Date(lastRedeemedAt.getTime() + 14400 * 1000).toISOString(),
    )
    expect(result.lastRedemption).toEqual({
      code:        'REUSAB01',
      redeemedAt:  lastRedeemedAt.toISOString(),
      branch:      { id: 'b-cafe', name: 'Cafe Loop · Camden' },
      isValidated: false,
      validatedAt: null,
    })
  })

  it('§6.3 state 3 — presentation EXPIRED AND cooldown active: lastRedemption null, availableAgainAt still set', async () => {
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 14400 }))
    mockActiveSubscription(prisma)
    // Redemption 3h ago, 4h cooldown → presentation expired (>2h) +
    // cooldown still active. lastRedemption null (2h window closed);
    // availableAgainAt still set (cooldown not elapsed).
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 3 * 60 * 60 * 1000)
    mockReusableRedemption(prisma, lastRedeemedAt)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.lastRedemption).toBeNull()
    expect(result.availableAgainAt).toBe(
      new Date(lastRedeemedAt.getTime() + 14400 * 1000).toISOString(),
    )
  })

  it('§6.3 state 4 — cooldown ELAPSED + presentation ALIVE: lastRedemption populated, availableAgainAt = null (REUSABLE distinguisher)', async () => {
    // This is the genuine REUSABLE state-4 case from spec §6.3 / §7.1.
    // Last redemption 35min ago, 30min cooldown → cooldown elapsed
    // 5min ago, but the presentation window is still alive (<2h).
    // Customer-app routes off (lastRedemption present AND
    // availableAgainAt = null) to show ACTIVE Redeem CTA + persisted
    // card together — both must come through the payload (not just
    // the in-memory mutation response, since this state is reachable
    // on cold-open without a fresh redemption mutation).
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 1800 }))
    mockActiveSubscription(prisma)
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 35 * 60 * 1000)
    mockReusableRedemption(prisma, lastRedeemedAt, {
      code: 'STATE4CD',
      branch: { id: 'b-2', name: 'State 4 Branch' },
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.availableAgainAt).toBeNull()
    expect(result.lastRedemption).toEqual({
      code:        'STATE4CD',
      redeemedAt:  lastRedeemedAt.toISOString(),
      branch:      { id: 'b-2', name: 'State 4 Branch' },
      isValidated: false,
      validatedAt: null,
    })
    expect(result.isRedeemedThisCycle).toBe(false)
  })

  it('§6.3 state late — cooldown ELAPSED AND presentation EXPIRED: both null', async () => {
    // Long after redemption: both clocks have elapsed.
    // 4h-ago redemption with a 30min cooldown → cooldown done 3.5h ago,
    // presentation window expired 2h ago. Payload returns both null —
    // this is the steady-state "fully reset" REUSABLE configuration.
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 1800 }))
    mockActiveSubscription(prisma)
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 4 * 60 * 60 * 1000)
    mockReusableRedemption(prisma, lastRedeemedAt)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.availableAgainAt).toBeNull()
    expect(result.lastRedemption).toBeNull()
    expect(result.isRedeemedThisCycle).toBe(false)
  })

  // ── REUSABLE doesn't touch the cycle-state gate ─────────────────────
  //
  // PR #72 review polish (2026-05-12): the REUSABLE cooldown clock is
  // sourced from `lastRedemptionMap` (populated by
  // `batchLastRedemptionsByVoucher` → `prisma.voucherRedemption.groupBy`),
  // NOT from a separate `findFirst` call. The earlier implementation
  // fired BOTH a `findFirst` for cooldown computation AND a separate
  // `findFirst` for the 2h presentation-window full-row fetch — the
  // first was redundant since the same lastRedeemedAt data is already
  // batched into `lastRedemptionMap` (which is then reused by the
  // TIME_LIMITED helper anyway).

  it('PR #72 polish — cooldown clock sources from lastRedemptionMap (groupBy), no redundant findFirst', async () => {
    // Setup the "in cooldown" scenario via groupBy (the new source).
    // Redemption 1h ago, 4h cooldown → availableAgainAt 3h from now.
    const prisma = makePrisma()
    prisma.voucher.findUnique.mockResolvedValue(makeReusableVoucher({ cooldownSeconds: 14400 }))
    mockActiveSubscription(prisma)
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 60 * 60 * 1000)
    prisma.voucherRedemption.groupBy.mockResolvedValue([
      { voucherId: VOUCHER_ID, _max: { redeemedAt: lastRedeemedAt } },
    ])
    // findFirst still returns the full row for the presentation-window
    // branch (redeemedAt within the 2h gate trips the cycle-gated check
    // shape filter inside mockReusableRedemption — but for this test
    // we mock it directly for clarity).
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    // Cooldown clock was computed correctly from the groupBy source.
    const expected = new Date(lastRedeemedAt.getTime() + 14400 * 1000).toISOString()
    expect(result.availableAgainAt).toBe(expected)

    // The batched groupBy fired exactly once (single-key map for the
    // single-voucher getCustomerVoucher path).
    expect(prisma.voucherRedemption.groupBy).toHaveBeenCalledTimes(1)

    // Critical regression pin: findFirst is called AT MOST ONCE for the
    // REUSABLE path — the presentation-window full-row fetch. The
    // redundant cooldown-clock findFirst is GONE. (Two calls would
    // signal the regression has been reintroduced.)
    expect(prisma.voucherRedemption.findFirst.mock.calls.length).toBeLessThanOrEqual(1)

    // No findFirst call should have a bare `where: { userId, voucherId }`
    // shape (no redeemedAt filter) — that was the redundant cooldown-clock
    // query shape that the polish removed.
    const calls = prisma.voucherRedemption.findFirst.mock.calls
    const bareCooldownCall = calls.find((c: any[]) => {
      const where = c[0]?.where ?? {}
      return where.userId === USER_ID
        && where.voucherId === VOUCHER_ID
        && where.redeemedAt === undefined
    })
    expect(bareCooldownCall).toBeUndefined()
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
