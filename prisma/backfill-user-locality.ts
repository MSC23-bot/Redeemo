// Backfill the location snapshot for users with a postcode but ≥1 of
// localityId/latitude/longitude null. Resolver failure on a specific user
// skips + warns rather than aborting the whole run, so one bad postcode
// cannot poison a 10k-user batch. Output snapshot shape mirrors
// updateMyProfile + seed::resolveCustomerLocation so backfilled rows are
// indistinguishable from PC2-onboarded rows.

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
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
      // TS narrowing — WHERE clause already filters null.
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

if (require.main === module) {
  void (async () => {
    if (!process.env.DATABASE_URL) {
      console.error('[backfill-user-locality] DATABASE_URL not set. Aborting.')
      process.exit(1)
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
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
      await pool.end()
    }
  })()
}
