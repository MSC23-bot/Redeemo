// prisma/backfill-locality-data.ts
//
// Plan 4 M1.22 — one-off idempotent backfill for User + Branch location
// snapshot fields. Resolves the existing postcode column via postcodes.io
// and populates the new Plan 4 columns (localityId, postTown, ladDistrict,
// adminCounty, region, country / locationCountry, locationResolvedAt) for
// rows where locationResolvedAt is currently NULL.
//
// Idempotent: re-runs query only rows with locationResolvedAt = null, so a
// second invocation reports 0 rows to backfill.
//
// Throttled at 100 ms between postcodes.io requests (~10 req/sec) to stay
// well under postcodes.io's published rate limit and not get rate-blocked
// for production use later.
//
// Usage:
//   npx tsx prisma/backfill-locality-data.ts [--dry-run] [--scope=users|branches|both]
//
// Defaults: scope=both, live writes.
//
// Branch handling: lat/lng on existing branches are NOT overwritten — they
// may be pin-precise (manually-confirmed from M1.16 or future pin-drop).
// Users have no pin-precise coords yet, so lat/lng IS populated for users.
//
// This script is the catch-all for legacy rows (pre-M1.20 / pre-M1.21).
// New writes go through the resolve-on-write paths and don't need this
// script. M1.22 is for one-off runs on rollouts / migrations.

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { resolvePostcode } from '../src/api/lib/postcodeResolver'
import { findOrCreateLocality } from '../src/api/lib/findOrCreateLocality'

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
const prisma = new PrismaClient({ adapter })

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const scope = (args.find(a => a.startsWith('--scope='))?.split('=')[1] ?? 'both') as
  'users' | 'branches' | 'both'

const THROTTLE_MS = 100  // ~10 req/sec to postcodes.io

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function backfillUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { locationResolvedAt: null, postcode: { not: null } },
    select: { id: true, postcode: true, email: true },
  })
  console.log(`Backfilling ${users.length} users...`)
  let ok = 0, failed = 0, newLoc = 0
  for (const u of users) {
    if (!u.postcode) continue
    const r = await resolvePostcode(u.postcode)
    if (!r.ok) {
      console.warn(`  user ${u.id} (${u.email}, postcode="${u.postcode}"): ${r.error}`)
      failed++
      continue
    }
    const loc = await findOrCreateLocality(prisma, r.snapshot)
    if (loc.needsReview) newLoc++
    if (!dryRun) {
      await prisma.user.update({
        where: { id: u.id },
        data: {
          postcode:           r.snapshot.postcode,  // canonical-spaced form from postcodes.io
          latitude:           r.snapshot.latitude,
          longitude:          r.snapshot.longitude,
          localityId:         loc.id,
          postTown:           r.snapshot.postTown ?? loc.postTown,
          ladDistrict:        r.snapshot.ladDistrict,
          adminCounty:        r.snapshot.adminCounty,
          region:             r.snapshot.region,
          country:            r.snapshot.country,   // Plan 4 nation snapshot (User.country)
          locationResolvedAt: new Date(),
        },
      })
    }
    ok++
    await sleep(THROTTLE_MS)
  }
  console.log(`  users: ${ok} resolved, ${failed} failed, ${newLoc} auto-created Localities (needsReview=true)`)
}

async function backfillBranches(): Promise<void> {
  const branches = await prisma.branch.findMany({
    where: { locationResolvedAt: null },
    select: { id: true, postcode: true, name: true, latitude: true, longitude: true },
  })
  console.log(`Backfilling ${branches.length} branches...`)
  let ok = 0, failed = 0, skipped = 0, newLoc = 0
  for (const b of branches) {
    if (!b.postcode) {
      console.warn(`  branch ${b.id} (${b.name}): no postcode set — SKIPPED`)
      skipped++
      continue
    }
    const r = await resolvePostcode(b.postcode)
    if (!r.ok) {
      console.warn(`  branch ${b.id} (${b.name}, postcode="${b.postcode}"): ${r.error}`)
      failed++
      continue
    }
    const loc = await findOrCreateLocality(prisma, r.snapshot)
    if (loc.needsReview) newLoc++
    if (!dryRun) {
      await prisma.branch.update({
        where: { id: b.id },
        data: {
          // DO NOT overwrite existing latitude/longitude — they may be
          // pin-precise (M1.16 manually-confirmed seeded branches, or any
          // future pin-drop). Postcode-centroid coords are only set when
          // the existing lat/lng is null.
          ...(b.latitude == null ? { latitude: r.snapshot.latitude } : {}),
          ...(b.longitude == null ? { longitude: r.snapshot.longitude } : {}),
          localityId:         loc.id,
          localityName:       loc.name,
          postTown:           r.snapshot.postTown ?? loc.postTown,
          ladDistrict:        r.snapshot.ladDistrict,
          adminCounty:        r.snapshot.adminCounty,
          region:             r.snapshot.region,
          locationCountry:    r.snapshot.country,   // Plan 4 nation (Branch.locationCountry)
          locationResolvedAt: new Date(),
          // locationConfidence stays at its default (POSTCODE_CENTROID) for
          // backfilled rows that never had a manual confirmation. If a row
          // ALREADY has locationConfidence: MANUALLY_CONFIRMED (e.g. M1.16
          // seeded), we still set the admin-hierarchy mirror columns above —
          // those are system-owned snapshot fields that track source
          // Locality data. We do NOT touch locationConfidence on backfill.
        },
      })
    }
    ok++
    await sleep(THROTTLE_MS)
  }
  console.log(`  branches: ${ok} resolved, ${failed} failed, ${skipped} skipped (no postcode), ${newLoc} auto-created Localities (needsReview=true)`)
}

async function main(): Promise<void> {
  console.log(`Backfill scope=${scope} dryRun=${dryRun}`)
  if (scope === 'users' || scope === 'both') await backfillUsers()
  if (scope === 'branches' || scope === 'both') await backfillBranches()
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
