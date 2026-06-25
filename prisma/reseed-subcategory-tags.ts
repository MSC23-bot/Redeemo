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
 * STAGING-ONLY note: steps 2→3 leave a sub-second window with no taxonomy links.
 * Acceptable on private staging (no real traffic). Do NOT run against production
 * without wrapping the swap in a transaction / maintenance window.
 *
 * Run:  npx tsx prisma/reseed-subcategory-tags.ts
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
  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  try {
    console.log('1/3  Rebuilding taxonomy id maps (idempotent — no user/merchant data touched)…')
    await seedCategories(prisma)
    await seedTags(prisma)

    console.log('2/3  Clearing existing SubcategoryTag links…')
    const cleared = await prisma.subcategoryTag.deleteMany({})
    console.log(`     removed ${cleared.count} stale link rows`)

    console.log('3/3  Re-wiring subcategory→tag links from the current seed data…')
    await seedSubcategoryTags(prisma)

    console.log('✓ SubcategoryTag re-seed complete.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('reseed-subcategory-tags failed:', err)
  process.exit(1)
})
