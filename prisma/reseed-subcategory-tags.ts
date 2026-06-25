/**
 * Targeted re-seed of the SubcategoryTag taxonomy links ONLY.
 *
 * Why this exists: the Phase 1 specialty re-curation (2026-06-25) changed which
 * SPECIALTY tags are wired to which subcategory. `prisma db seed` re-runs the
 * ENTIRE seed (users, merchants, the sha256 dev-password reset, etc.), which is
 * unsafe on staging. This script re-wires ONLY the subcategory→tag join table
 * and touches nothing else.
 *
 * What it does, in order:
 *   1. seedCategories() + seedTags() — idempotent upserts that also rebuild the
 *      in-memory id lookup maps from the DB. Safe: re-creates only missing
 *      taxonomy rows; never touches User / Merchant / Subscription / etc.
 *   2. deleteMany SubcategoryTag — clears ALL existing links so the old broad
 *      fan-out rows (e.g. Pizza on Dessert Shop) are removed, not merely added
 *      to. SubcategoryTag has no inbound FK, so this is safe; merchant tag
 *      selections live on the Merchant record, not here.
 *   3. seedSubcategoryTags() — re-wires Cuisine + the new per-subcategory
 *      Specialty + Highlight/Detail links.
 *
 * SAFETY:
 *   - Requires an explicit opt-in env var (REDEEMO_CONFIRM_RESEED=1) on top of
 *     DATABASE_URL, because it CLEARS the whole SubcategoryTag table. Mirrors the
 *     repo's REDEEMO_CONFIRM_* destructive-op gates.
 *   - The clear + rebuild (steps 2-3 above) run inside a SINGLE transaction, so a
 *     failure mid-run can never leave the taxonomy links empty — it rolls back.
 *
 * Run:  REDEEMO_CONFIRM_RESEED=1 npx tsx prisma/reseed-subcategory-tags.ts
 *       (DATABASE_URL must point at the target DB)
 */
import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { seedCategories, seedTags, seedSubcategoryTags } from './seed-data/referencePhases'

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — refusing to run.')
  }
  // Explicit opt-in: this script CLEARS the entire SubcategoryTag table before
  // rebuilding it. DATABASE_URL alone is too weak a guard against an accidental
  // run, so require a conscious confirmation env var.
  if (process.env.REDEEMO_CONFIRM_RESEED !== '1') {
    throw new Error(
      'Refusing to run: set REDEEMO_CONFIRM_RESEED=1 to confirm a full SubcategoryTag rebuild against this DATABASE_URL.',
    )
  }
  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  try {
    console.log('1/2  Rebuilding taxonomy id maps (idempotent — no user/merchant data touched)…')
    await seedCategories(prisma)
    await seedTags(prisma)

    console.log('2/2  Atomically clearing + re-wiring SubcategoryTag links…')
    await prisma.$transaction(
      async (tx) => {
        const cleared = await tx.subcategoryTag.deleteMany({})
        console.log(`     removed ${cleared.count} stale link rows`)
        await seedSubcategoryTags(tx)
      },
      { timeout: 30_000 },
    )

    console.log('✓ SubcategoryTag re-seed complete.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('reseed-subcategory-tags failed:', err)
  process.exit(1)
})
