import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Backend payload-contract tests for getCustomerMerchant per-card
// REUSABLE state.
//
// Spec: docs/superpowers/specs/2026-05-12-reusable-voucher-design.md
//   §6.4 — getCustomerMerchant per-card payload deltas for REUSABLE.
//     - voucher.reusableState = { availableAgainAt: ISO | null } for REUSABLE.
//     - reusableState is omitted/null for non-REUSABLE rows.
//     - isRedeemedThisCycle is ALWAYS false for REUSABLE rows (mirrors
//       D13 in getCustomerVoucher).
//   §7.1 state-matrix — cooldown-clock semantics: surface only future
//     availableAgainAt instants (truthiness convention).
//
// Locked decisions exercised here:
//   D13 — isRedeemedThisCycle is ALWAYS false for REUSABLE
//   D16 — availableAgainAt is reused with type-specific semantics
//   D17 — merchant card pill state on Voucher Detail drives off
//         reusableState
//   D19 — raw Voucher.cooldownSeconds is NEVER exposed; only the
//         derived ISO instant surfaces
//
// Test fixture pattern mirrors discovery.voucher-reusable-payload.test.ts
// (mocked Prisma via vi.mock), but targets getCustomerMerchant which
// emits the voucher list shape via a single batched groupBy query (see
// batchLastRedemptionsByVoucher) — the REUSABLE-specific reusableState
// MUST be derived from the same batched map, NOT a per-card findFirst,
// to preserve the "exactly ONE redemption query" N+1 contract locked
// in discovery.timeLimitedMerchant.test.ts (M4a-5).

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {
    constructor(_opts: { connectionString: string }) {}
  },
}))

vi.mock('../../../generated/prisma/client', () => {
  class PrismaClient {
    // SEC-C3 (Gate-PR-4b): getCustomerMerchant resolves the merchant via
    // `merchant.findFirst` (NOT findUnique) so the non-unique isTestData
    // security filter can gate the query. Mock must expose findFirst.
    merchant                = { findFirst: vi.fn() }
    review                  = { groupBy: vi.fn(), findFirst: vi.fn() }
    favouriteMerchant       = { findUnique: vi.fn() }
    // Phase 3C.1g (PR #137): getCustomerMerchant bulk-loads branch-level
    // and voucher-level favourites. favouriteVoucher.findMany IS reached
    // here (fixtures set userId + non-empty vouchers); favouriteBranch
    // .findMany is gated out by the empty `branches: []` fixture but is
    // part of the same enrichment contract — both default to [] (no
    // favourites) so isFavourited resolves false without affecting the
    // reusableState / cooldown assertions below.
    favouriteBranch         = { findMany: vi.fn().mockResolvedValue([]) }
    favouriteVoucher        = { findMany: vi.fn().mockResolvedValue([]) }
    redundantHighlight      = { findMany: vi.fn() }
    subscription            = { findUnique: vi.fn() }
    userVoucherCycleState   = { findMany: vi.fn() }
    voucherRedemption       = {
      // Default to an empty batched groupBy — individual tests override
      // via mockResolvedValueOnce. The whole point of Task 6 is that
      // reusableState pulls from this same single query, not a per-card
      // findFirst.
      groupBy:   vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
    }
    constructor(_opts?: any) {}
  }
  return {
    PrismaClient,
    MerchantStatus:  { ACTIVE: 'ACTIVE' },
    VoucherStatus:   { ACTIVE: 'ACTIVE' },
    ApprovalStatus:  { APPROVED: 'APPROVED' },
    MerchantSuggestedTagStatus: { APPROVED: 'APPROVED' },
    CampaignStatus:  { ACTIVE: 'ACTIVE' },
  }
})

import { getCustomerMerchant } from '../../../src/api/customer/discovery/service'
import { PrismaClient } from '../../../generated/prisma/client'

const MERCHANT_ID = 'm-reusable-merch'
const USER_ID     = 'u-reusable-cards'

// Fixed test clock — picked so cooldown arithmetic stays obvious.
const TEST_NOW = new Date('2026-05-15T12:00:00.000Z')

function makeMerchantRow(opts: {
  vouchers: any[]
}) {
  return {
    id: MERCHANT_ID,
    businessName: 'Cafe Loop',
    tradingName: null,
    logoUrl: null,
    bannerUrl: null,
    status: 'ACTIVE',
    description: null,
    websiteUrl: null,
    // null primaryCategoryId avoids the redundantHighlight.findMany branch.
    primaryCategoryId: null,
    primaryCategory: null,
    primaryDescriptorTag: null,
    highlights: [],
    categories: [],
    vouchers: opts.vouchers,
    // Empty branches sidesteps review.groupBy (skipped when branchIds is []).
    branches: [],
  }
}

function makeReusableVoucherRow(opts: {
  id: string
  cooldownSeconds?: number | null
  title?: string
}) {
  return {
    id: opts.id,
    title: opts.title ?? 'Free coffee refill',
    type: 'REUSABLE',
    description: null,
    terms: null,
    imageUrl: null,
    estimatedSaving: 3.0,
    expiryDate: null,
    cooldownSeconds: opts.cooldownSeconds ?? null,
    availabilityWindows: [],
  }
}

function makeBogoVoucherRow(opts: { id: string; title?: string }) {
  return {
    id: opts.id,
    title: opts.title ?? 'Buy one get one',
    type: 'BOGO',
    description: null,
    terms: null,
    imageUrl: null,
    estimatedSaving: 8.0,
    expiryDate: null,
    cooldownSeconds: null,
    availabilityWindows: [],
  }
}

function makePrisma() {
  const prisma = new PrismaClient({} as any) as any
  prisma.review.groupBy.mockResolvedValue([])
  prisma.favouriteMerchant.findUnique.mockResolvedValue(null)
  prisma.redundantHighlight.findMany.mockResolvedValue([])
  prisma.subscription.findUnique.mockResolvedValue(null)
  prisma.userVoucherCycleState.findMany.mockResolvedValue([])
  return prisma
}

describe('getCustomerMerchant — per-card reusableState (spec §6.4, D13/D16/D17/D19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(TEST_NOW)
  })

  it('REUSABLE voucher: reusableState.availableAgainAt is set to ISO of (lastRedeemedAt + 4h) when in cooldown', async () => {
    // Last redemption 1h ago, 4h cooldown → availableAgainAt = lastRedeemedAt + 4h.
    const prisma = makePrisma()
    const voucher = makeReusableVoucherRow({ id: 'v-reusable-1', cooldownSeconds: 14400 })
    prisma.merchant.findFirst.mockResolvedValue(makeMerchantRow({ vouchers: [voucher] }))
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 60 * 60 * 1000) // 1h ago
    prisma.voucherRedemption.groupBy.mockResolvedValue([
      { voucherId: voucher.id, _max: { redeemedAt: lastRedeemedAt } },
    ])

    const result = await getCustomerMerchant(prisma, MERCHANT_ID, USER_ID, {})

    const row = result.vouchers.find((v: any) => v.id === voucher.id)
    expect(row).toBeDefined()
    expect(row!.reusableState).toEqual({
      availableAgainAt: new Date(lastRedeemedAt.getTime() + 14400 * 1000).toISOString(),
    })
    // Sanity — that's 3h from TEST_NOW.
    expect(row!.reusableState!.availableAgainAt).toBe(
      new Date('2026-05-15T15:00:00.000Z').toISOString(),
    )
    // D13 — REUSABLE rows always carry isRedeemedThisCycle: false.
    expect(row!.isRedeemedThisCycle).toBe(false)
  })

  it('REUSABLE voucher: reusableState.availableAgainAt = null when no recent redemption', async () => {
    // No redemption history → cooldown clock not started → availableAgainAt null.
    const prisma = makePrisma()
    const voucher = makeReusableVoucherRow({ id: 'v-reusable-2', cooldownSeconds: 14400 })
    prisma.merchant.findFirst.mockResolvedValue(makeMerchantRow({ vouchers: [voucher] }))
    // Default groupBy = [] — no rows for this user/voucher.

    const result = await getCustomerMerchant(prisma, MERCHANT_ID, USER_ID, {})

    const row = result.vouchers.find((v: any) => v.id === voucher.id)
    expect(row).toBeDefined()
    expect(row!.reusableState).toEqual({ availableAgainAt: null })
    expect(row!.isRedeemedThisCycle).toBe(false)
  })

  it('REUSABLE voucher: reusableState.availableAgainAt = null when cooldown has elapsed', async () => {
    // Last redemption 5h ago, 4h cooldown → cooldown elapsed 1h ago.
    // Convention §7.1: surface only future instants → null so the client
    // can use truthiness checks without time math.
    const prisma = makePrisma()
    const voucher = makeReusableVoucherRow({ id: 'v-reusable-3', cooldownSeconds: 14400 })
    prisma.merchant.findFirst.mockResolvedValue(makeMerchantRow({ vouchers: [voucher] }))
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 5 * 60 * 60 * 1000) // 5h ago
    prisma.voucherRedemption.groupBy.mockResolvedValue([
      { voucherId: voucher.id, _max: { redeemedAt: lastRedeemedAt } },
    ])

    const result = await getCustomerMerchant(prisma, MERCHANT_ID, USER_ID, {})

    const row = result.vouchers.find((v: any) => v.id === voucher.id)
    expect(row).toBeDefined()
    expect(row!.reusableState).toEqual({ availableAgainAt: null })
    expect(row!.isRedeemedThisCycle).toBe(false)
  })

  it('non-REUSABLE voucher: reusableState is null on the card', async () => {
    // BOGO voucher → no reusableState block (or null) — same omission
    // pattern as currentWindow for non-TIME_LIMITED rows (spec §6.4).
    const prisma = makePrisma()
    const voucher = makeBogoVoucherRow({ id: 'v-bogo-1' })
    prisma.merchant.findFirst.mockResolvedValue(makeMerchantRow({ vouchers: [voucher] }))

    const result = await getCustomerMerchant(prisma, MERCHANT_ID, USER_ID, {})

    const row = result.vouchers.find((v: any) => v.id === voucher.id)
    expect(row).toBeDefined()
    // Field is emitted but null (consistent with how TIME_LIMITED rows
    // get currentWindow:null on non-TL types — keeps the row shape stable).
    expect(row!.reusableState).toBeNull()
  })

  it('D19 — raw voucher.cooldownSeconds is NEVER exposed on the merchant card payload', async () => {
    // Defense-in-depth: even with cooldownSeconds present on the Prisma
    // row, the public merchant-card response must NOT leak it.
    const prisma = makePrisma()
    const voucher = makeReusableVoucherRow({ id: 'v-reusable-4', cooldownSeconds: 3600 })
    prisma.merchant.findFirst.mockResolvedValue(makeMerchantRow({ vouchers: [voucher] }))

    const result = await getCustomerMerchant(prisma, MERCHANT_ID, USER_ID, {})

    const row = result.vouchers.find((v: any) => v.id === voucher.id)
    expect(row).toBeDefined()
    expect((row as any).cooldownSeconds).toBeUndefined()
  })

  it('SEC-C3 — merchant.findFirst carries the isTestData security filter (excludes seed/demo merchants)', async () => {
    // Gate-PR-4b locked the switch from findUnique to findFirst precisely
    // so a non-unique isTestData filter can gate the lookup (a seed/demo
    // merchant resolves to null → MERCHANT_UNAVAILABLE). Pins the exact
    // where-clause so the security filter cannot be silently dropped.
    // Empty voucher list keeps the favouriteVoucher.findMany branch out
    // of scope for this focused query-shape assertion.
    const prisma = makePrisma()
    prisma.merchant.findFirst.mockResolvedValue(makeMerchantRow({ vouchers: [] }))

    await getCustomerMerchant(prisma, MERCHANT_ID, USER_ID, {})

    expect(prisma.merchant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MERCHANT_ID, isTestData: false },
      }),
    )
  })

  it('mixed list — REUSABLE + BOGO + (regular) — only the REUSABLE row carries reusableState; batched groupBy fires ONCE', async () => {
    // N+1 contract from M4a-5 (discovery.timeLimitedMerchant.test.ts):
    // ONE redemption query for the whole voucher list, regardless of
    // type mix. Adding REUSABLE must NOT introduce per-card findFirst.
    const prisma = makePrisma()
    const reusable = makeReusableVoucherRow({ id: 'v-mix-reusable', cooldownSeconds: 14400 })
    const bogo     = makeBogoVoucherRow({ id: 'v-mix-bogo' })
    prisma.merchant.findFirst.mockResolvedValue(makeMerchantRow({
      vouchers: [reusable, bogo],
    }))
    const lastRedeemedAt = new Date(TEST_NOW.getTime() - 30 * 60 * 1000) // 30min ago
    prisma.voucherRedemption.groupBy.mockResolvedValue([
      { voucherId: reusable.id, _max: { redeemedAt: lastRedeemedAt } },
    ])

    const result = await getCustomerMerchant(prisma, MERCHANT_ID, USER_ID, {})

    const reusableRow = result.vouchers.find((v: any) => v.id === reusable.id)!
    const bogoRow     = result.vouchers.find((v: any) => v.id === bogo.id)!

    expect(reusableRow.reusableState).toEqual({
      availableAgainAt: new Date(lastRedeemedAt.getTime() + 14400 * 1000).toISOString(),
    })
    expect(bogoRow.reusableState).toBeNull()

    // Exactly ONE groupBy redemption query for the entire list — same
    // map serves both TIME_LIMITED redeemedWindow AND REUSABLE
    // availableAgainAt derivations. No per-card findFirst.
    expect(prisma.voucherRedemption.groupBy).toHaveBeenCalledTimes(1)
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
  })
})
