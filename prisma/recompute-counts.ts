// ─────────────────────────────────────────────────────────────────────────────
// Standalone recompute-count runner (pre-launch Task #2)
//
// Recomputes the denormalized category/tag merchant-count maps
// (Category.merchantCountByCity / Tag.merchantCountByCity) from current merchant
// state, WITHOUT running the full seed and WITHOUT creating any data. Run it
// after a seed/test scrub or a real merchant import so the AllCategories counts
// reflect what customers can actually see.
//
// It excludes test data (`excludeTestData: true`) so the counts match the
// customer-facing lists, which exclude isTestData everywhere (SEC-C3 / F5).
//
// Safety gates (all FAIL CLOSED, before any DB connection):
//   - ALLOW_RECOMPUTE_COUNTS=true       (explicit opt-in)
//   - validates DATABASE_URL (postgres) and prints the redacted target
//   - RECOMPUTE_CONFIRM must match the target (guards against the wrong DB)
// A default-deny write guard restricts writes to Category / Tag only.
//
// Safe with NODE_ENV=production (that is the point); needs NO ENCRYPTION_KEY and
// NO Stripe config. It imports ONLY the recompute helpers — never the full seed
// or any demo/fixture phase.
//
// Usage:
//   ALLOW_RECOMPUTE_COUNTS=true RECOMPUTE_CONFIRM=<unique-db-host> \
//   npx tsx prisma/recompute-counts.ts
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { recomputeWriteGuard } from './seed-data/recomputeWriteGuard'
import { requireDatabaseUrl, redactedTarget } from './seed-data/referenceSeedSafety'
import { requireRecomputeOptIn, requireRecomputeConfirm } from './seed-data/recomputeSafety'
import { recomputeCategoryCounts, recomputeTagCounts } from '../src/api/lib/merchantCount'

async function main() {
  // ── Safety gates (all fail closed, before any database connection) ──
  requireRecomputeOptIn(process.env)
  const databaseUrl = requireDatabaseUrl(process.env)

  const target = redactedTarget(databaseUrl)
  console.log('────────────────────────────────────────────────────────')
  console.log('  Redeemo recompute-counts (denormalized category/tag counts)')
  console.log(`  Target database: ${target}`)
  console.log('────────────────────────────────────────────────────────')

  requireRecomputeConfirm(process.env, target)

  // ── Guarded client: default-deny on any write outside Category / Tag ──
  const adapter = new PrismaPg({ connectionString: databaseUrl })
  const base = new PrismaClient({ adapter })
  const prisma = base.$extends(recomputeWriteGuard) as unknown as PrismaClient

  try {
    // excludeTestData: true → counts match the customer-facing lists (SEC-C3 / F5).
    console.log('[recompute-counts] recomputing Category.merchantCountByCity (test data excluded)…')
    await recomputeCategoryCounts(prisma, { excludeTestData: true })
    console.log('[recompute-counts] recomputing Tag.merchantCountByCity (test data excluded)…')
    await recomputeTagCounts(prisma, { excludeTestData: true })
    console.log('[recompute-counts] ✓ Recomputed category + tag counts (test data excluded).')
  } finally {
    await base.$disconnect()
  }
}

main().catch((err) => {
  console.error('[recompute-counts] FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
})
