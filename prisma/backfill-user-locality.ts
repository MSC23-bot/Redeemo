// prisma/backfill-user-locality.ts
//
// §DF Task 2 — backfill the `User.localityId / latitude / longitude` core +
// the full 11-field location snapshot for every user that has a postcode but
// is missing one or more of the three location-resolver-required fields.
//
// Background:
//   The §DF SAVED_PROFILE branch of `resolveEffectiveLocation` requires all
//   three: `localityId AND latitude AND longitude`. Three cohorts surface
//   gaps (spec §8.3):
//     - Post-PC2 onboarded users — already complete; backfill no-ops.
//     - Legacy users (pre-PC2 onboarding) — postcode present, lat/lng/
//       localityId NULL. Backfill closes the gap.
//     - Seed users — covered by Task 1 (`prisma/seed.ts` enrichment).
//     - No-postcode users — stay on no-location; backfill is passive.
//
// Locked behaviour (per task description "Lock from Task 1's spec-compliance
// review"): backfill mirrors the production `updateMyProfile` and the seed
// `resolveCustomerLocation` shape — populates the FULL 11-field snapshot
// (postcode unchanged; all of latitude / longitude / localityId / postTown /
// ladDistrict / adminCounty / region / country / locationResolvedAt / city
// populated from the resolved Locality + postcode snapshot). This keeps the
// User row's location columns internally consistent and matches what a
// post-PC2 onboarded user would have.
//
// Caveat (spec §8.2): backfill uses postcode-centroid coords from
// postcodes.io, NOT real address geocoding. Acceptable for Discovery
// ranking; not for navigation. PC2-onboarded users have the same
// precision today, so backfilling at this level produces parity rather
// than degradation.
//
// Idempotent: re-running over an already-backfilled user is a no-op (the
// WHERE clause filters them out).
//
// CLI usage:
//   npx tsx prisma/backfill-user-locality.ts
//
// Programmatic usage (tests):
//   import { backfillUserLocality } from './backfill-user-locality'
//   const result = await backfillUserLocality(prisma)

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import { resolvePostcode } from '../src/api/lib/postcodeResolver'
import { findOrCreateLocality } from '../src/api/lib/findOrCreateLocality'

dotenv.config()

export type BackfillUserLocalityResult = {
  /** Users matching the WHERE filter (postcode present, ≥1 location field NULL). */
  processed: number
  /** Users that were successfully resolved + UPDATEd. */
  populated: number
  /** Users that matched the filter but whose postcode failed to resolve (skipped, not throw). */
  skipped: number
}

/**
 * Backfill the location snapshot for every incomplete user.
 *
 * Mirrors `prisma/seed.ts::resolveCustomerLocation` and
 * `src/api/customer/profile/service.ts::updateMyProfile` so a backfilled
 * row is indistinguishable from a freshly-onboarded one.
 */
export async function backfillUserLocality(
  prisma: PrismaClient,
): Promise<BackfillUserLocalityResult> {
  const incompleteUsers = await prisma.user.findMany({
    where: {
      postcode: { not: null },
      OR: [
        { localityId: null },
        { latitude: null },
        { longitude: null },
      ],
    },
    select: { id: true, postcode: true },
  })

  let populated = 0
  let skipped = 0

  for (const u of incompleteUsers) {
    if (!u.postcode) {
      // Defensive — WHERE clause guarantees postcode != null, but TS
      // narrowing forces an explicit branch.
      skipped++
      continue
    }

    const resolved = await resolvePostcode(u.postcode)
    if (!resolved.ok) {
      console.warn(
        `[backfill-user-locality] Skipping user ${u.id}: postcode "${u.postcode}" ` +
          `did not resolve (${resolved.error}). Re-run after the gazetteer ` +
          `recovers, or ask the user to update their postcode.`,
      )
      skipped++
      continue
    }

    const locality = await findOrCreateLocality(prisma, resolved.snapshot)

    // Full 11-field snapshot — mirrors seed.ts::resolveCustomerLocation and
    // src/api/customer/profile/service.ts::updateMyProfile. Postcode itself
    // is unchanged (the user-provided value is the input); the canonical-
    // spacing form from postcodes.io overwrites in case the user typed
    // "HD11AA" — same behaviour as production.
    await prisma.user.update({
      where: { id: u.id },
      data: {
        postcode:           resolved.snapshot.postcode,
        latitude:           resolved.snapshot.latitude,
        longitude:          resolved.snapshot.longitude,
        localityId:         locality.id,
        postTown:           resolved.snapshot.postTown ?? locality.postTown,
        ladDistrict:        resolved.snapshot.ladDistrict,
        adminCounty:        resolved.snapshot.adminCounty,
        region:             resolved.snapshot.region,
        country:            resolved.snapshot.country,
        locationResolvedAt: new Date(),
        // Legacy `city` field — kept aligned with locality name to match
        // updateMyProfile + seed behaviour (Plan 4 M5 may retire `city`
        // entirely, at which point this field drops out of the snapshot).
        city:               locality.name,
      },
    })
    populated++
  }

  return {
    processed: incompleteUsers.length,
    populated,
    skipped,
  }
}

// CLI runner — only fires when this file is invoked directly via tsx.
if (require.main === module) {
  void (async () => {
    if (!process.env.DATABASE_URL) {
      console.error('[backfill-user-locality] DATABASE_URL not set. Aborting.')
      process.exit(1)
    }
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    const prisma = new PrismaClient({ adapter })
    try {
      console.log('[backfill-user-locality] starting...')
      const result = await backfillUserLocality(prisma)
      console.log('[backfill-user-locality] complete:', result)
    } catch (err) {
      console.error('[backfill-user-locality] failed:', err)
      process.exitCode = 1
    } finally {
      await prisma.$disconnect()
    }
  })()
}
