// prisma/clean-leaked-test-fixtures.ts
//
// Stage 4 (2026-05-20) — scoped cleanup script for the 8 leaked
// fixture prefix classes surfaced by the Stage 1 audit.
//
// Background:
//   The Stage 1 seed audit (`prisma/audit-seed-state.ts`) surfaced
//   ~22 merchants, 27 branches, 1 voucher, 57 reviews leaked into the
//   live dev DB from previously-crashed integration tests.  Eight
//   prefix classes were identified: P1Test-, SummaryTest-,
//   SummaryTestOther-, TEST , UpsertRevive-, Revive-, Drift-,
//   FilterFlip-.  This script wipes that class deterministically.
//
//   This is a SUPERSET of `prisma/clean-leaked-p1test-fixtures.ts`
//   (which is kept as the original PR #113 fixup-1 script and is NOT
//   modified — see plan S4.D2).  Both scripts share the
//   `sweepFixturesByPrefixes` helper at
//   `tests/api/_shared/fixtureSweep.ts` so the sweep semantics stay
//   identical across script + test suite.
//
// Scope locked by Stage 4 owner-locked decisions:
//   - S4.D1: hard-delete (Prisma `deleteMany`), no soft-delete flag.
//   - S4.D4: dry-run first, then explicit `--confirm` to write.
//
// See `docs/superpowers/plans/2026-05-20-seed-merchant-enrichment.md`
// "Stage 4 owner-locked scope (2026-05-20, post Stage 2 merge `6720fe7`)"
// for the full Stage 4 spec.
//
// Usage:
//   npx tsx prisma/clean-leaked-test-fixtures.ts                 (dry-run)
//   npx tsx prisma/clean-leaked-test-fixtures.ts --confirm       (delete)
//
// Owner-run only.  Not a customer-facing endpoint.  Not part of
// migrations.  Safe to re-run.  Idempotent.

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  LEAKED_FIXTURE_PREFIXES,
  USER_EMAIL_PREFIX_BY_MERCHANT_PREFIX,
  sweepFixturesByPrefixes,
} from '../tests/api/_shared/fixtureSweep'

type PerPrefixCount = {
  prefix: string
  merchants: number
  branches: number
  vouchers: number
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const confirm = args.includes('--confirm')

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    // Single batch fetch — every leaked merchant + its branches + its vouchers.
    // Per-prefix breakdown is then derived in-memory by matching on
    // `businessName.startsWith(prefix)` (mirrors the SQL filter).
    const leakedMerchants = await prisma.merchant.findMany({
      where: { OR: LEAKED_FIXTURE_PREFIXES.map(p => ({ businessName: { startsWith: p } })) },
      select: {
        id: true,
        businessName: true,
        branches: { select: { id: true } },
        vouchers: { select: { id: true } },
      },
    })

    const perPrefix: PerPrefixCount[] = LEAKED_FIXTURE_PREFIXES.map(prefix => {
      const matching = leakedMerchants.filter(m => m.businessName.startsWith(prefix))
      return {
        prefix,
        merchants: matching.length,
        branches: matching.reduce((acc, m) => acc + m.branches.length, 0),
        vouchers: matching.reduce((acc, m) => acc + m.vouchers.length, 0),
      }
    })

    const allMerchantIds = leakedMerchants.map(m => m.id)
    const allBranchIds = leakedMerchants.flatMap(m => m.branches.map(b => b.id))

    // Cascade-row counts.  Each guard short-circuits empty-id arrays to
    // avoid wasteful `{ in: [] }` round-trips.
    const cascadeRedemptions = allBranchIds.length === 0
      ? 0
      : await prisma.voucherRedemption.count({ where: { branchId: { in: allBranchIds } } })
    const cascadeReviews = allBranchIds.length === 0
      ? 0
      : await prisma.review.count({ where: { branchId: { in: allBranchIds } } })
    const cascadeBranchAmenities = allBranchIds.length === 0
      ? 0
      : await prisma.branchAmenity.count({ where: { branchId: { in: allBranchIds } } })
    const cascadeBranches = allBranchIds.length
    const cascadeVouchers = allMerchantIds.length === 0
      ? 0
      : await prisma.voucher.count({ where: { merchantId: { in: allMerchantIds } } })
    const cascadeMerchants = allMerchantIds.length

    // User-email cascade: explicit lookup via the merchant→email-prefix map.
    const userEmailPrefixes = Array.from(
      new Set(LEAKED_FIXTURE_PREFIXES.flatMap(p => USER_EMAIL_PREFIX_BY_MERCHANT_PREFIX[p] ?? [])),
    )
    const cascadeUsers = userEmailPrefixes.length === 0
      ? 0
      : await prisma.user.count({
          where: { OR: userEmailPrefixes.map(ep => ({ email: { startsWith: ep } })) },
        })

    // Report.
    console.log('=== Stage 4 leaked-fixture cleanup — scoped cleanup ===')
    console.log(`Mode: ${confirm ? 'DELETE (--confirm)' : 'DRY-RUN (default; pass --confirm to write)'}`)
    console.log('')
    console.log('Per-prefix breakdown:')
    // Right-pad prefix label so columns line up nicely.
    const labelWidth = LEAKED_FIXTURE_PREFIXES.reduce((max, p) => Math.max(max, p.length), 0)
    for (const row of perPrefix) {
      const label = row.prefix.padEnd(labelWidth, ' ')
      console.log(
        `  ${label}  merchants=${row.merchants}  branches=${row.branches}  vouchers=${row.vouchers}`,
      )
    }
    console.log('')
    console.log('Total would-delete (cascade):')
    console.log(`  voucherRedemption: ${cascadeRedemptions}`)
    console.log(`  review:            ${cascadeReviews}`)
    console.log(`  branchAmenity:     ${cascadeBranchAmenities}`)
    console.log(`  branch:            ${cascadeBranches}`)
    console.log(`  voucher:           ${cascadeVouchers}`)
    console.log(`  merchant:          ${cascadeMerchants}`)
    console.log(`  user:              ${cascadeUsers}`)
    console.log('')

    if (!confirm) {
      console.log('Dry-run complete.  Re-run with --confirm to delete.')
      return
    }

    if (cascadeMerchants === 0 && cascadeUsers === 0) {
      console.log('Nothing to delete — DB is clean.')
      return
    }

    const summary = await sweepFixturesByPrefixes(prisma, LEAKED_FIXTURE_PREFIXES)

    console.log('=== Deletion summary ===')
    console.log(`  voucherRedemption: ${summary.voucherRedemptions}`)
    console.log(`  review:            ${summary.reviews}`)
    console.log(`  branchAmenity:     ${summary.branchAmenities}`)
    console.log(`  branch:            ${summary.branches}`)
    console.log(`  voucher:           ${summary.vouchers}`)
    console.log(`  merchant:          ${summary.merchants}`)
    console.log(`  user:              ${summary.users}`)
    console.log('')
    console.log('Done.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err)
  process.exit(1)
})
