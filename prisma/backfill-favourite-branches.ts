// Backfill FavouriteMerchant rows to FavouriteBranch rows targeting each
// merchant's main branch.  Phase 3C.1g locked product principle: heart =
// branch, not merchant.  Pre-launch context — low row volume, dry-run-able,
// idempotent.  For each FavouriteMerchant row, this script:
//
//   1. Locates the parent merchant's `isMainBranch=true AND status=ACTIVE`
//      branch.  If missing, skips with a counter increment.
//   2. If the merchant is not `ACTIVE`, skips with a counter increment.
//   3. Otherwise creates a FavouriteBranch(userId, branchId) row, catching
//      the (userId, branchId) unique-constraint P2002 so re-runs skip
//      already-backfilled rows cleanly (idempotency).
//
// Multi-branch merchants intentionally backfill ONLY the main branch.
// Owner-locked at the spec/plan stage: users on multi-branch merchants
// re-favourite secondary branches manually after the customer-app cuts
// over.  Trade-off accepted given pre-launch low-volume data.
//
// CLI usage:
//   npx tsx prisma/backfill-favourite-branches.ts            # real run
//   npx tsx prisma/backfill-favourite-branches.ts --dry-run  # summary only

import { PrismaClient, Prisma, MerchantStatus } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

export type BackfillFavouriteBranchesResult = {
  /** Total FavouriteMerchant rows scanned. */
  processed: number
  /** FavouriteBranch rows successfully created (real run) or proposed (dry-run). */
  inserted: number
  /** Rows skipped because a FavouriteBranch already existed for (userId, mainBranchId). */
  skippedAlreadyFavourited: number
  /** Rows skipped because the merchant has no `isMainBranch=true AND status=ACTIVE` branch. */
  skippedNoMainBranch: number
  /** Rows skipped because the parent merchant is not ACTIVE. */
  skippedInactiveMerchant: number
}

/**
 * Backfill FavouriteMerchant → FavouriteBranch (main branch only).
 *
 * Parameterised on `prisma` so the test harness can drive it against a
 * scoped fixture set.  Matches the `prisma/backfill-user-locality.ts`
 * shape — the CLI wrapper at the bottom owns the singleton lifecycle.
 *
 * @param prisma  Connected PrismaClient.
 * @param dryRun  When true, compute counters as if inserting but do NOT
 *                write any FavouriteBranch rows.
 */
export async function backfillFavouriteBranches(
  prisma: PrismaClient,
  dryRun: boolean = false,
): Promise<BackfillFavouriteBranchesResult> {
  const favouriteMerchants = await prisma.favouriteMerchant.findMany({
    select: {
      userId: true,
      merchantId: true,
      merchant: {
        select: {
          id: true,
          status: true,
          branches: {
            where: { isMainBranch: true, isActive: true },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  })

  let inserted = 0
  let skippedAlreadyFavourited = 0
  let skippedNoMainBranch = 0
  let skippedInactiveMerchant = 0

  for (const fm of favouriteMerchants) {
    if (fm.merchant.status !== MerchantStatus.ACTIVE) {
      skippedInactiveMerchant++
      continue
    }
    const mainBranch = fm.merchant.branches[0]
    if (!mainBranch) {
      skippedNoMainBranch++
      continue
    }

    if (dryRun) {
      // In dry-run, we count proposed inserts.  The already-favourited
      // bucket can't be distinguished from inserted without a SELECT, so
      // dry-run shows the upper bound on writes (every eligible row is
      // counted as "would insert").  Acceptable — dry-run is for shape
      // inspection, not exact-delta forecasting.
      inserted++
      continue
    }

    try {
      await prisma.favouriteBranch.create({
        data: { userId: fm.userId, branchId: mainBranch.id },
      })
      inserted++
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        skippedAlreadyFavourited++
      } else {
        throw e
      }
    }
  }

  return {
    processed: favouriteMerchants.length,
    inserted,
    skippedAlreadyFavourited,
    skippedNoMainBranch,
    skippedInactiveMerchant,
  }
}

if (require.main === module) {
  void (async () => {
    if (!process.env.DATABASE_URL) {
      console.error('[backfill-favourite-branches] DATABASE_URL not set. Aborting.')
      process.exit(1)
    }
    const dryRun = process.argv.includes('--dry-run')
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })
    try {
      console.log(`[backfill-favourite-branches] starting (dryRun=${dryRun})...`)
      const result = await backfillFavouriteBranches(prisma, dryRun)
      console.log('[backfill-favourite-branches] complete:', result)
    } catch (err) {
      console.error('[backfill-favourite-branches] failed:', err)
      process.exitCode = 1
    } finally {
      await prisma.$disconnect()
      await pool.end()
    }
  })()
}
