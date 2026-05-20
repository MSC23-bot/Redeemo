// tests/api/_shared/fixtureSweep.ts
//
// Stage 4 (2026-05-20) — shared prefix-sweep helper.
//
// Background:
//   The original implementation lived inline in
//   `tests/api/customer/discovery.selectedBranch.test.ts` and was scoped
//   to the `P1Test-*` / `p1test-*@example.com` fixture class.  Stage 4 of
//   the seed merchant enrichment workstream extracts that helper here so
//   (a) the cleanup script (`prisma/clean-leaked-test-fixtures.ts`) and
//   the test suite share IDENTICAL sweep semantics, and (b) the locked
//   8-prefix list (`LEAKED_FIXTURE_PREFIXES`) has a single source of
//   truth that the seed-guardrail test and the cleanup script can both
//   import from.
//
// See `docs/superpowers/plans/2026-05-20-seed-merchant-enrichment.md`
// "Stage 4 owner-locked scope" section for the locked decisions
// (S4.D1 hard-delete, S4.D4 dry-run-first sequence, etc.).

import type { PrismaClient } from '../../../generated/prisma/client'

// Locked 8 prefix classes surfaced by the Stage 1 audit (see plan §2).
// SOURCE OF TRUTH — the seed-guardrail R8 rule and the cleanup script
// both import from here.
export const LEAKED_FIXTURE_PREFIXES = [
  'P1Test-',
  'SummaryTest-',
  'SummaryTestOther-',
  'TEST ',
  'UpsertRevive-',
  'Revive-',
  'Drift-',
  'FilterFlip-',
] as const

// Explicit merchant-prefix → user-email-prefix mapping.  Only the
// `P1Test-` class has a documented user-email-leak pattern
// (`p1test-${Date.now()}@example.com` from `discovery.selectedBranch.test.ts`).
// The other 7 prefix classes never created `User` rows.
//
// Mapping is intentionally explicit (not derived by string-prefix matching)
// so a future prefix class with a divergent email pattern (e.g. merchant
// `Foo-` + emails `foo-user-*@…`) is captured as data, not lost to a
// silently-failing prefix-overlap heuristic.  Seed pattern writes emails
// lowercased; matched case-sensitively against the lowercased prefix.
export const USER_EMAIL_PREFIX_BY_MERCHANT_PREFIX: Readonly<Record<string, readonly string[]>> = {
  'P1Test-': ['p1test-'],
} as const

export type FixtureSweepSummary = {
  merchants: number
  branches: number
  vouchers: number
  reviews: number
  reviewHelpfuls: number
  voucherRedemptions: number
  branchAmenities: number
  users: number
}

/**
 * Sweep leaked test fixtures matching the caller-provided merchant prefixes.
 *
 * Cascade order (dependents first; locked Stage 4 fixup 2026-05-20 added
 * `reviewHelpful` between `voucherRedemption` and `review` because the
 * `ReviewHelpful → Review` schema relation has no `onDelete: Cascade`):
 *   voucherRedemption → reviewHelpful → review → branchAmenity → branch
 *   (cascades BranchOpeningHours + BranchPhoto via schema) → voucher →
 *   merchant.
 *
 * `ReviewReport → Review` does have `onDelete: Cascade`, so it auto-cleans
 * when `review.deleteMany` runs — no manual step needed.
 *
 * User sweep:
 *   Driven by `USER_EMAIL_PREFIX_BY_MERCHANT_PREFIX`.  For each caller-passed
 *   merchant prefix, looks up the explicit list of user-email prefixes (if
 *   any) and sweeps `User.email startsWith` against each.  Today only
 *   `'P1Test-' → ['p1test-']` is mapped.
 *
 * No console output (test-suite friendly).  No throw on empty matches
 * (empty result is a valid idempotent no-op).
 */
export async function sweepFixturesByPrefixes(
  prisma: PrismaClient,
  prefixes: readonly string[],
): Promise<FixtureSweepSummary> {
  const summary: FixtureSweepSummary = {
    merchants: 0,
    branches: 0,
    vouchers: 0,
    reviews: 0,
    reviewHelpfuls: 0,
    voucherRedemptions: 0,
    branchAmenities: 0,
    users: 0,
  }

  if (prefixes.length === 0) return summary

  // Resolve merchant + branch ids in a single batch.
  const merchants = await prisma.merchant.findMany({
    where: { OR: prefixes.map(p => ({ businessName: { startsWith: p } })) },
    select: { id: true, branches: { select: { id: true } } },
  })
  const merchantIds = merchants.map(m => m.id)
  const branchIds = merchants.flatMap(m => m.branches.map(b => b.id))

  if (branchIds.length > 0) {
    const r = await prisma.voucherRedemption.deleteMany({ where: { branchId: { in: branchIds } } })
    summary.voucherRedemptions = r.count

    // ReviewHelpful BEFORE Review — schema relation has no onDelete:Cascade.
    // Resolve review ids tied to leaked branches first, then delete helpfuls
    // pointing at those reviews.  Skip the query entirely if there are no
    // leaked reviews (idempotent safety + saves a round-trip).
    const reviewRows = await prisma.review.findMany({
      where: { branchId: { in: branchIds } },
      select: { id: true },
    })
    const reviewIds = reviewRows.map(rv => rv.id)
    if (reviewIds.length > 0) {
      const rh = await prisma.reviewHelpful.deleteMany({ where: { reviewId: { in: reviewIds } } })
      summary.reviewHelpfuls = rh.count
    }

    const rv = await prisma.review.deleteMany({ where: { branchId: { in: branchIds } } })
    summary.reviews = rv.count
    const ba = await prisma.branchAmenity.deleteMany({ where: { branchId: { in: branchIds } } })
    summary.branchAmenities = ba.count
    // Branch delete cascades BranchOpeningHours + BranchPhoto via schema.
    const b = await prisma.branch.deleteMany({ where: { id: { in: branchIds } } })
    summary.branches = b.count
  }

  if (merchantIds.length > 0) {
    const v = await prisma.voucher.deleteMany({ where: { merchantId: { in: merchantIds } } })
    summary.vouchers = v.count
    const m = await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } })
    summary.merchants = m.count
  }

  // Users — explicit lookup via USER_EMAIL_PREFIX_BY_MERCHANT_PREFIX.
  // Today only `P1Test-` has an entry; other merchant prefixes resolve to no
  // user-email sweep.  Dedup since a future map might point multiple merchant
  // prefixes at the same email prefix.
  const userEmailPrefixes = Array.from(
    new Set(
      prefixes.flatMap(p => USER_EMAIL_PREFIX_BY_MERCHANT_PREFIX[p] ?? []),
    ),
  )
  if (userEmailPrefixes.length > 0) {
    const u = await prisma.user.deleteMany({
      where: { OR: userEmailPrefixes.map(ep => ({ email: { startsWith: ep } })) },
    })
    summary.users = u.count
  }

  return summary
}
