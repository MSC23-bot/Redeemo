// tests/api/customer/discovery/resolveLocationContext.test.ts
//
// §DF-v2-i — `resolveLocationContext` tightened invariants.
//
// Spec: docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md §4.1
// Plan: docs/superpowers/plans/2026-05-26-locationcontext-parity.md Task 1
// Audit: docs/superpowers/audits/2026-05-26-locationcontext-route-audit.md §3 + §8
//
// Locks the post-§DF-v2-i contract for `resolveLocationContext`:
//
//   • `source='profile'` requires ALL THREE of User.localityId + User.latitude
//     + User.longitude (matches `resolveEffectiveLocation`'s SAVED_PROFILE
//     invariant).
//   • The loose `User.city` text fallback that previously produced
//     `source='profile'` is removed.  Users with only a `city` text value
//     now see `source='none'`.
//   • The coordinates branch is unchanged (priority 1 above profile).
//
// Atomic with the §DF-7 → §DF-7v2i pin update in home-feed-rail-states.test.ts
// (route-level / wire envelope) and the helper-level pins below.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { resolveLocationContext } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

// Real-world UK reference coordinates used across the Discovery test suite.
const HUDDERSFIELD = { lat: 53.6458, lng: -1.785 }

beforeAll(async () => {
  // Cold-Neon warm-up — first query in a fresh file can timeout if Neon is
  // sleeping; do a trivial SELECT 1 so the real pins run within budget.
  await prisma.$queryRaw`SELECT 1`
}, 60_000)
afterAll(async () => { await prisma.$disconnect() })

describe('§DF-v2-i resolveLocationContext tightened invariants', () => {
  const createdUserIds: string[] = []

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
      createdUserIds.length = 0
    }
  })

  async function getHuddersfieldLocality() {
    const loc = await prisma.locality.findFirst({
      where: { name: { equals: 'Huddersfield', mode: 'insensitive' }, country: 'England' },
    })
    if (!loc) throw new Error('Seed invariant: Huddersfield Locality must exist (ONSPD seed).')
    return loc
  }

  it('§DF-v2-i-U1 — coordinates branch unchanged: lat+lng provided → source=coordinates', { timeout: 30_000 }, async () => {
    const result = await resolveLocationContext(prisma as any, null, HUDDERSFIELD.lat, HUDDERSFIELD.lng)
    expect(result.source).toBe('coordinates')
    expect(result.lat).toBe(HUDDERSFIELD.lat)
    expect(result.lng).toBe(HUDDERSFIELD.lng)
  })

  it('§DF-v2-i-U2 — full profile (localityId + latitude + longitude) → source=profile', { timeout: 30_000 }, async () => {
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-v2-i-u2-${ts}@x.test`,
        passwordHash: 'x',
        postcode:     'HD1 1AA',
        latitude:     HUDDERSFIELD.lat,
        longitude:    HUDDERSFIELD.lng,
        localityId:   loc.id,
      },
    })
    createdUserIds.push(user.id)

    const result = await resolveLocationContext(prisma as any, user.id, null, null)
    expect(result.source).toBe('profile')
    expect(result.locality).not.toBeNull()
    expect(result.locality?.id).toBe(loc.id)
    expect(result.locality?.name).toMatch(/Huddersfield/i)
    expect(result.city).toMatch(/Huddersfield/i)
  })

  it('§DF-v2-i-U3 — incomplete profile (localityId set, latitude null) → source=none (tightened)', { timeout: 30_000 }, async () => {
    // Pre-§DF-v2-i baseline: this combination returned source='profile' from
    // resolveLocationContext while `resolveEffectiveLocation` returned null.
    // Locked post-fix: BOTH helpers agree → source='none'.
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-v2-i-u3-${ts}@x.test`,
        passwordHash: 'x',
        postcode:     'HD1 1AA',
        latitude:     null,
        longitude:    null,
        localityId:   loc.id,
      },
    })
    createdUserIds.push(user.id)

    const result = await resolveLocationContext(prisma as any, user.id, null, null)
    expect(result.source).toBe('none')
    expect(result.locality).toBeNull()
    expect(result.city).toBeNull()
  })

  it('§DF-v2-i-U4 — city-text-only profile (no localityId/lat/lng) → source=none (tightened)', { timeout: 30_000 }, async () => {
    // Pre-§DF-v2-i baseline: User.city text alone produced source='profile'
    // (locality matched OR bare city-text label).  Locked post-fix: any path
    // through the helper that lacks localityId+latitude+longitude returns
    // source='none'.  Affected cohort is pre-PC2 users with only a free-text
    // `city` value; post-§DF v1 backfill leaves this cohort near-empty.  They
    // see "Set location ›" and tap to set a real postcode via Your Location.
    const ts  = Date.now()
    const user = await prisma.user.create({
      data: {
        email:        `df-v2-i-u4-${ts}@x.test`,
        passwordHash: 'x',
        city:         'Huddersfield',  // text only, no localityId / lat / lng
        latitude:     null,
        longitude:    null,
        localityId:   null,
      },
    })
    createdUserIds.push(user.id)

    const result = await resolveLocationContext(prisma as any, user.id, null, null)
    expect(result.source).toBe('none')
    expect(result.locality).toBeNull()
    expect(result.city).toBeNull()
  })
})
