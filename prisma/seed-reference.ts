// ─────────────────────────────────────────────────────────────────────────────
// Production-safe REFERENCE seed (PR2b)
//
// Loads ONLY reference/config data into the target database:
//   taxonomy (categories, tags, subcategory-tag joins, redundant highlights,
//   amenities, category-amenity rules) → localities → catchment edges → markets
//   → RMV templates → interests → subscription plans → CMS placeholders.
//
// It NEVER creates demo / marketplace / customer data. Two layers enforce that:
//   1. It imports ONLY the reference phases (never prisma/seed.ts or any demo
//      phase), so there is no code path to demo data.
//   2. A default-deny Prisma write guard (referenceWriteGuard) throws on any
//      write outside the reference allow-list — even a future regression.
//
// Safety gates (all FAIL CLOSED):
//   - ALLOW_REFERENCE_SEED=true        (explicit opt-in)
//   - prints the redacted target DB    (host + db name, no credentials)
//   - REFERENCE_SEED_CONFIRM matches    (guards against the wrong database)
//   - STRIPE_PRICE_ID_MONTHLY/_ANNUAL   (REAL Stripe price ids, not dev/placeholder)
//
// Unlike the full seed, this path is SAFE to run with NODE_ENV=production (that
// is the point) and needs NO ENCRYPTION_KEY (it creates no branch PINs).
//
// Usage:
//   ALLOW_REFERENCE_SEED=true REFERENCE_SEED_CONFIRM=<db-host-or-name> \
//   STRIPE_PRICE_ID_MONTHLY=price_… STRIPE_PRICE_ID_ANNUAL=price_… \
//   npx tsx prisma/seed-reference.ts
//
// This does NOT recompute denormalized category/tag counts — that is the
// separate standalone recompute runner (deploy runbook §4 step 4 / Task #2).
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { referenceWriteGuard } from './seed-data/referenceWriteGuard'
import {
  requireReferenceSeedOptIn,
  requireDatabaseUrl,
  redactedTarget,
  requireReferenceSeedConfirm,
  resolveReferenceStripePriceIds,
} from './seed-data/referenceSeedSafety'
import {
  seedCategories,
  seedTags,
  seedSubcategoryTags,
  seedRedundantHighlights,
  seedAmenities,
  seedCategoryAmenities,
  seedLocalities,
  seedRmvTemplates,
  seedInterests,
  seedSubscriptionPlans,
  seedCmsContent,
  topLevelIdByName,
} from './seed-data/referencePhases'
import { seedHeuristicCatchmentEdges } from './seed-data/catchment-heuristic'
import { seedCuratedCatchmentEdges } from './seed-data/catchmentOverrides'
import { seedMarkets } from './seed-data/markets'

async function main() {
  // ── Safety gates (all fail closed, before any database connection) ──
  requireReferenceSeedOptIn(process.env)
  const databaseUrl = requireDatabaseUrl(process.env) // fail closed on missing/unparseable BEFORE building the client

  const target = redactedTarget(databaseUrl)
  console.log('────────────────────────────────────────────────────────')
  console.log('  Redeemo REFERENCE seed (reference/config data only)')
  console.log(`  Target database: ${target}`)
  console.log('────────────────────────────────────────────────────────')

  requireReferenceSeedConfirm(process.env, target)
  const stripePriceIds = resolveReferenceStripePriceIds(process.env)

  // ── Guarded client: default-deny on any non-reference write ──
  const adapter = new PrismaPg({ connectionString: databaseUrl })
  const base = new PrismaClient({ adapter })
  // The extension changes the client's type; the reference phases are typed
  // `(prisma: PrismaClient)`. The cast is type-only — at runtime the guard hook
  // still fires on every model operation the phases perform.
  const prisma = base.$extends(referenceWriteGuard) as unknown as PrismaClient

  try {
    console.log('[reference-seed] taxonomy + localities…')
    await seedCategories(prisma)
    await seedTags(prisma)
    await seedSubcategoryTags(prisma)
    await seedRedundantHighlights(prisma)
    await seedAmenities(prisma)
    await seedCategoryAmenities(prisma)
    await seedLocalities(prisma)

    console.log('[reference-seed] catchment edges + markets (this step can be slow)…')
    await seedHeuristicCatchmentEdges(prisma)
    await seedCuratedCatchmentEdges(prisma)
    await seedMarkets(prisma)

    const foodCatId = topLevelIdByName.get('Food & Drink')
    const beautyCatId = topLevelIdByName.get('Beauty & Wellness')
    if (!foodCatId || !beautyCatId) {
      throw new Error(
        'Reference seed expected Food & Drink + Beauty & Wellness top-level categories ' +
          'after seedCategories (needed for the mandatory RMV voucher templates).',
      )
    }

    console.log('[reference-seed] RMV templates + interests + subscription plans + CMS…')
    await seedRmvTemplates(prisma, foodCatId, beautyCatId)
    await seedInterests(prisma)
    await seedSubscriptionPlans(prisma, stripePriceIds)
    await seedCmsContent(prisma)

    console.warn(
      '[reference-seed] ⚠️  CMS keys were seeded with PLACEHOLDER content. Real ' +
        'terms / privacy / legal copy MUST be filled in before launch (HARD launch ' +
        'gate — see deploy-security-runbook §4).',
    )
    console.log('[reference-seed] ✓ Reference/config data seeded.')
    console.log(
      '[reference-seed] NOTE: denormalized category/tag merchant counts are NOT ' +
        'recomputed here — run the standalone recompute runner after merchants exist ' +
        '(runbook §4 step 4 / Task #2).',
    )
  } finally {
    await base.$disconnect()
  }
}

main().catch((err) => {
  console.error('[reference-seed] FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
})
