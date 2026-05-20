// prisma/clean-leaked-p1test-fixtures.ts
//
// PR-3 fixup-1 (2026-05-20) — scoped one-off cleanup for the P1Test-*
// fixture leak surfaced during PR #113 device QA.
//
// Background:
//   The integration test `tests/api/customer/discovery.selectedBranch.test.ts`
//   seeds merchants with `businessName: \`P1Test-${Date.now()}\`` and users
//   with `email: \`p1test-${Date.now()}@example.com\``.  Cleanup tracked
//   created ids in-memory only — when a test crashed / timed out / vitest
//   force-killed the worker, the in-memory list was lost and the rows
//   leaked.  Live dev DB audit on 2026-05-20 surfaced 21 leaked merchants
//   (42 branches) + 2 leaked users from failed runs spanning
//   2026-05-02 → 2026-05-09, including a Brightlingsea branch that
//   appeared on Map QA.
//
// This script:
//   - DEFAULT (no flag): dry-run.  Reports what WOULD be deleted.
//   - --confirm: actually deletes.  Cascade order matches the test's
//     afterAll: voucherRedemption → review → branchAmenity → branch →
//     voucher → merchant → user.
//
// Safe to re-run.  Idempotent.  Scoped strictly to the P1Test-*
// businessName prefix + p1test-*@example.com email prefix.  Does NOT
// touch any other fixture or seed data.
//
// Usage:
//   npx tsx prisma/clean-leaked-p1test-fixtures.ts                  (dry-run)
//   npx tsx prisma/clean-leaked-p1test-fixtures.ts --confirm        (delete)
//
// Owner-run only.  Not a customer-facing endpoint.  Not part of
// migrations.

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const P1TEST_MERCHANT_PREFIX = 'P1Test-'
const P1TEST_USER_EMAIL_PREFIX = 'p1test-'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const confirm = args.includes('--confirm')

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    const merchants = await prisma.merchant.findMany({
      where: { businessName: { startsWith: P1TEST_MERCHANT_PREFIX } },
      select: {
        id: true,
        businessName: true,
        createdAt: true,
        branches: { select: { id: true, name: true, city: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    const merchantIds = merchants.map(m => m.id)
    const branchIds   = merchants.flatMap(m => m.branches.map(b => b.id))

    const users = await prisma.user.findMany({
      where: { email: { startsWith: P1TEST_USER_EMAIL_PREFIX } },
      select: { id: true, email: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const userIds = users.map(u => u.id)

    // Report.
    console.log('=== P1Test fixture leak — scoped cleanup ===')
    console.log(`Mode: ${confirm ? 'DELETE (--confirm)' : 'DRY-RUN (default; pass --confirm to write)'}`)
    console.log('')
    console.log(`Merchants matching businessName startsWith "${P1TEST_MERCHANT_PREFIX}": ${merchants.length}`)
    if (merchants.length > 0) {
      console.log(`  Date range: ${merchants[0]!.createdAt.toISOString()} → ${merchants[merchants.length - 1]!.createdAt.toISOString()}`)
      console.log(`  Branches owned (all will be cascade-deleted): ${branchIds.length}`)
      const branchCities = merchants.flatMap(m => m.branches.map(b => b.city))
      const uniqCities = Array.from(new Set(branchCities)).sort()
      console.log(`  Branch cities present: ${uniqCities.join(', ')}`)
    }
    console.log('')
    console.log(`Users matching email startsWith "${P1TEST_USER_EMAIL_PREFIX}": ${users.length}`)
    if (users.length > 0) {
      console.log(`  Date range: ${users[0]!.createdAt.toISOString()} → ${users[users.length - 1]!.createdAt.toISOString()}`)
    }
    console.log('')

    if (!confirm) {
      console.log('Dry-run complete.  Re-run with --confirm to delete.')
      return
    }

    if (merchants.length === 0 && users.length === 0) {
      console.log('Nothing to delete — DB is clean.')
      return
    }

    // Cascade order matches the test's afterAll: dependents-first.
    let deletedRedemptions = 0
    let deletedReviews = 0
    let deletedBranchAmenities = 0
    let deletedBranches = 0
    let deletedVouchers = 0
    let deletedMerchants = 0
    let deletedUsers = 0

    if (branchIds.length > 0) {
      const r = await prisma.voucherRedemption.deleteMany({ where: { branchId: { in: branchIds } } })
      deletedRedemptions = r.count
      const v = await prisma.review.deleteMany({ where: { branchId: { in: branchIds } } })
      deletedReviews = v.count
      const ba = await prisma.branchAmenity.deleteMany({ where: { branchId: { in: branchIds } } })
      deletedBranchAmenities = ba.count
      // Branch cascade deletes BranchOpeningHours + BranchPhoto.
      const b = await prisma.branch.deleteMany({ where: { id: { in: branchIds } } })
      deletedBranches = b.count
    }
    if (merchantIds.length > 0) {
      const v = await prisma.voucher.deleteMany({ where: { merchantId: { in: merchantIds } } })
      deletedVouchers = v.count
      const m = await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } })
      deletedMerchants = m.count
    }
    if (userIds.length > 0) {
      const u = await prisma.user.deleteMany({ where: { id: { in: userIds } } })
      deletedUsers = u.count
    }

    console.log('=== Deletion summary ===')
    console.log(`  voucherRedemption: ${deletedRedemptions}`)
    console.log(`  review:            ${deletedReviews}`)
    console.log(`  branchAmenity:     ${deletedBranchAmenities}`)
    console.log(`  branch:            ${deletedBranches}`)
    console.log(`  voucher:           ${deletedVouchers}`)
    console.log(`  merchant:          ${deletedMerchants}`)
    console.log(`  user:              ${deletedUsers}`)
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
