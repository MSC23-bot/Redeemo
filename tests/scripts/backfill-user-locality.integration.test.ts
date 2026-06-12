// Fixture discipline: emails prefixed `BACKFILL-`, Locality slugs prefixed
// `backfill-test-`. afterAll sweeps both (seed-guardrail's R8 sweep covers
// merchant prefixes only — user/locality cleanup is this file's responsibility).

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { backfillUserLocality } from '../../prisma/backfill-user-locality'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const USER_EMAIL_PREFIX = 'BACKFILL-'
const LOCALITY_SLUG_PREFIX = 'backfill-test-'

beforeAll(async () => {
  // Warm Neon connection — first-cold-fixture per-suite needs explicit
  // priming, otherwise the first findMany can hit a >5s Neon cold-start.
  await prisma.$queryRaw`SELECT 1`
  // Defensive — clean stale fixtures from any aborted earlier run.
  await sweepFixtures()
})

afterAll(async () => {
  await sweepFixtures()
  await prisma.$disconnect()
})

async function sweepFixtures(): Promise<void> {
  // Each delete wrapped so a partial-FK-failure on users doesn't strand
  // locality fixtures (or vice versa). FK order respected: users first.
  try {
    await prisma.user.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } })
  } catch (err) {
    console.warn('[backfill-user-locality test] user sweep failed:', err)
  }
  try {
    await prisma.locality.deleteMany({ where: { slug: { startsWith: LOCALITY_SLUG_PREFIX } } })
  } catch (err) {
    console.warn('[backfill-user-locality test] locality sweep failed:', err)
  }
}

// Helper: create a pre-existing Locality for the "already populated" case
// so the FK is valid. Uses the LOCALITY_SLUG_PREFIX so sweep catches it.
async function createTestLocality(slugSuffix: string): Promise<{ id: string; centerLat: number; centerLng: number }> {
  const loc = await prisma.locality.create({
    data: {
      name: `BackfillTest-${slugSuffix}`,
      slug: `${LOCALITY_SLUG_PREFIX}${slugSuffix}`,
      ladDistrict: 'BackfillTestLAD',
      country: 'England',
      centerLat: 53.5,
      centerLng: -1.5,
      populationTier: 'UNKNOWN',
    },
  })
  return { id: loc.id, centerLat: Number(loc.centerLat), centerLng: Number(loc.centerLng) }
}

describe('backfillUserLocality', () => {
  it('(a) no-ops when user already has all four location fields populated', async () => {
    const loc = await createTestLocality('already-done')
    const created = await prisma.user.create({
      data: {
        email: `${USER_EMAIL_PREFIX}done@x.test`,
        postcode: 'HD1 1AA',
        latitude: loc.centerLat,
        longitude: loc.centerLng,
        localityId: loc.id,
      },
      select: { id: true, updatedAt: true, postcode: true, latitude: true, longitude: true, localityId: true },
    })

    const result = await backfillUserLocality(prisma)

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: { updatedAt: true, postcode: true, latitude: true, longitude: true, localityId: true },
    })

    // updatedAt unchanged — proves no UPDATE was issued.
    expect(after.updatedAt.getTime()).toBe(created.updatedAt.getTime())
    expect(after.localityId).toBe(loc.id)
    expect(Number(after.latitude)).toBe(loc.centerLat)
    expect(Number(after.longitude)).toBe(loc.centerLng)
    // Result counts should NOT include this user (filtered out by WHERE clause).
    expect(result.processed).toBeGreaterThanOrEqual(0)
    // We don't assert exact processed count globally — other users in the DB
    // may be incomplete. We only assert this user is unaffected.
  })

  it('(b) populates lat/lng/localityId for legacy postcode-only user', async () => {
    // Legacy cohort: registered pre-PC2-lat-lng-collection. postcode present,
    // latitude / longitude / localityId NULL. Real UK postcode resolved via
    // postcodes.io. `HD1 1AA` is the seed customer postcode, so the Locality
    // is already seeded — backfill should reuse, not create.
    const created = await prisma.user.create({
      data: {
        email: `${USER_EMAIL_PREFIX}legacy@x.test`,
        postcode: 'HD1 1AA',
      },
      select: { id: true },
    })

    const result = await backfillUserLocality(prisma)

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        postcode: true,
        latitude: true,
        longitude: true,
        localityId: true,
        postTown: true,
        ladDistrict: true,
        adminCounty: true,
        region: true,
        country: true,
        locationResolvedAt: true,
        city: true,
      },
    })

    // Postcode unchanged (resolver may canonicalise spacing — both forms acceptable).
    expect(after.postcode).toMatch(/^HD1\s*1AA$/i)
    // All three core fields populated.
    expect(after.latitude).not.toBeNull()
    expect(after.longitude).not.toBeNull()
    expect(after.localityId).not.toBeNull()
    // Full 11-field snapshot per Task 1 lock — admin-hierarchy mirror.
    expect(after.ladDistrict).toBe('Kirklees')
    expect(after.country).toBe('England')
    // postcodes.io returns "Yorkshire and The Humber" (capital T). Case-insensitive
    // pin so a future API casing tweak doesn't break the regression.
    expect(after.region?.toLowerCase()).toBe('yorkshire and the humber')
    expect(after.locationResolvedAt).toBeInstanceOf(Date)
    expect(after.city).not.toBeNull()
    // Result counts should include this user.
    expect(result.populated).toBeGreaterThanOrEqual(1)
  })

  it('(c) populates seed-style postcode-only user with the same snapshot shape', async () => {
    // Seed cohort: same state as legacy; distinct postcode proves backfill
    // works against more than the single HD1 fixture.
    const created = await prisma.user.create({
      data: {
        email: `${USER_EMAIL_PREFIX}seed@x.test`,
        postcode: 'CO7 0AY', // Mirror's the seed reviewer postcode (Brightlingsea cluster).
      },
      select: { id: true },
    })

    await backfillUserLocality(prisma)

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        latitude: true,
        longitude: true,
        localityId: true,
        ladDistrict: true,
        country: true,
        locationResolvedAt: true,
        city: true,
      },
    })

    expect(after.latitude).not.toBeNull()
    expect(after.longitude).not.toBeNull()
    expect(after.localityId).not.toBeNull()
    expect(after.country).toBe('England')
    expect(after.ladDistrict).not.toBeNull()
    expect(after.locationResolvedAt).toBeInstanceOf(Date)
    expect(after.city).not.toBeNull()
  })

  it('(d) no-ops when user has no postcode at all', async () => {
    const created = await prisma.user.create({
      data: {
        email: `${USER_EMAIL_PREFIX}nopostcode@x.test`,
        // postcode + all location fields NULL.
      },
      select: { id: true, updatedAt: true },
    })

    await backfillUserLocality(prisma)

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: { updatedAt: true, postcode: true, latitude: true, longitude: true, localityId: true },
    })

    // updatedAt unchanged — proves no UPDATE was issued.
    expect(after.updatedAt.getTime()).toBe(created.updatedAt.getTime())
    expect(after.postcode).toBeNull()
    expect(after.latitude).toBeNull()
    expect(after.longitude).toBeNull()
    expect(after.localityId).toBeNull()
  })

  it('(e) is idempotent on re-run', async () => {
    const created = await prisma.user.create({
      data: {
        email: `${USER_EMAIL_PREFIX}idempotent@x.test`,
        postcode: 'HD1 1AA',
      },
      select: { id: true },
    })

    // First run — populates the user.
    await backfillUserLocality(prisma)
    const afterFirst = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        updatedAt: true,
        latitude: true,
        longitude: true,
        localityId: true,
        locationResolvedAt: true,
      },
    })
    expect(afterFirst.latitude).not.toBeNull()
    expect(afterFirst.localityId).not.toBeNull()

    // Second run — user now passes the WHERE filter (postcode + all three
    // location fields populated), so the script must skip it. The
    // canonical proof: updatedAt and locationResolvedAt unchanged.
    const result2 = await backfillUserLocality(prisma)
    const afterSecond = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        updatedAt: true,
        latitude: true,
        longitude: true,
        localityId: true,
        locationResolvedAt: true,
      },
    })

    expect(afterSecond.updatedAt.getTime()).toBe(afterFirst.updatedAt.getTime())
    expect(afterSecond.locationResolvedAt?.getTime()).toBe(afterFirst.locationResolvedAt?.getTime())
    expect(afterSecond.localityId).toBe(afterFirst.localityId)
    expect(Number(afterSecond.latitude)).toBe(Number(afterFirst.latitude))
    expect(Number(afterSecond.longitude)).toBe(Number(afterFirst.longitude))
    // The second run should not have touched this user — only globally
    // incomplete users (if any leaked from concurrent suites) would show up
    // in populated count. We assert at-least-zero rather than exact-zero.
    expect(result2.populated).toBeGreaterThanOrEqual(0)
  })
})
