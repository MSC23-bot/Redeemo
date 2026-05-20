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

// Only the `P1Test-` class has a documented user-email-leak pattern
// (`p1test-${Date.now()}@example.com` from `discovery.selectedBranch.test.ts`).
// The other 7 prefix classes never created `User` rows.  Kept lowercased so
// `User.email.startsWith()` matches case-insensitively in practice.
export const LEAKED_USER_EMAIL_PREFIXES = ['p1test-'] as const

export type FixtureSweepSummary = {
  merchants: number
  branches: number
  vouchers: number
  reviews: number
  voucherRedemptions: number
  branchAmenities: number
  users: number
}

/**
 * Sweep leaked test fixtures matching the caller-provided merchant prefixes.
 *
 * Cascade order (dependents first, matches the historical inline cleanup):
 *   voucherRedemption → review → branchAmenity → branch (cascades
 *   BranchOpeningHours + BranchPhoto via schema) → voucher → merchant.
 *
 * User sweep:
 *   Only fires if the caller's `prefixes` intersect with
 *   `LEAKED_USER_EMAIL_PREFIXES` (today: `['p1test-']`).  Sweeps
 *   `User.email startsWith` the lowercased prefix.
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

  // Users — sweep only if caller's prefixes intersect with the documented
  // user-email-leak class.  Today only `P1Test-` qualifies (→ `p1test-`).
  const lowerCaller = prefixes.map(p => p.toLowerCase())
  const userEmailPrefixes = LEAKED_USER_EMAIL_PREFIXES.filter(emailPrefix =>
    // Match if any caller merchant prefix (lowercased) starts with the same
    // root as the email prefix (e.g. `p1test-` matches `p1test-`).
    lowerCaller.some(cp => cp.startsWith(emailPrefix)),
  )
  if (userEmailPrefixes.length > 0) {
    const u = await prisma.user.deleteMany({
      where: { OR: userEmailPrefixes.map(ep => ({ email: { startsWith: ep } })) },
    })
    summary.users = u.count
  }

  return summary
}
