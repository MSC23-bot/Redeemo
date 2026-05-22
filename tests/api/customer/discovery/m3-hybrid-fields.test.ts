// tests/api/customer/discovery/m3-hybrid-fields.test.ts
//
// Plan 4 M3a hybrid contract — locked 2026-05-15 (Option γ).
//
// The PR #84 review (deferred-followups §AV) chose to keep the legacy
// `rankMerchants` path as Discovery's inclusion/order source during M3a
// so POSTCODE_CENTROID merchants do not disappear, while running
// `rankMerchantsV2` alongside to populate the additive M3 fields.
//
// This file pins that hybrid contract:
//
//   - POSTCODE_CENTROID merchant STILL appears in Discovery (legacy
//     inclusion).
//   - That tile keeps its legacy `supplyTier` (NEARBY/CITY/DISTANT).
//   - That tile's new V2 fields are NULL (supplyRung / proximityBand /
//     distanceMetres / contextBranchId).
//   - MANUALLY_CONFIRMED merchant gets BOTH legacy `supplyTier` AND the
//     new V2 fields.
//   - `meta.rungCounts` counts V2-admitted merchants only (POSTCODE_
//     CENTROID excluded); `meta.{nearbyCount,cityCount,distantCount}`
//     preserve the legacy count semantics (POSTCODE_CENTROID still in).
//   - `meta.effectiveLocality` is populated when the EffectiveLocation
//     resolver finds a nearest UK locality from the GPS coords.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { searchMerchants, getHomeFeed } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// Two transient merchants with a shared unique businessName prefix so
// a single `q` search returns both. Coordinates within ~150m of each
// other in Huddersfield so both are NEARBY in legacy classification
// when the search includes user GPS at (53.6463, -1.7809) — Karaara's
// reference centroid.
const PREFIX = 'M3HybridTest'
const APPROX_MERCHANT_ID = 'plan4-m3a-hybrid-postcode-centroid-merchant'
const EXACT_MERCHANT_ID = 'plan4-m3a-hybrid-manually-confirmed-merchant'
const APPROX_BRANCH_ID = 'plan4-m3a-hybrid-pc-branch'
const EXACT_BRANCH_ID = 'plan4-m3a-hybrid-mc-branch'

// Huddersfield reference point + a tiny offset for the second merchant.
const HUDDERSFIELD = { lat: 53.6463, lng: -1.7809 }

async function ensureFixtures() {
  // Idempotent — self-healing if a prior failed run left state.
  for (const [merchantId, branchId, isManuallyConfirmed, name] of [
    [APPROX_MERCHANT_ID, APPROX_BRANCH_ID, false, `${PREFIX} PostcodeCentroid`],
    [EXACT_MERCHANT_ID, EXACT_BRANCH_ID, true, `${PREFIX} ManuallyConfirmed`],
  ] as const) {
    await prisma.merchant.upsert({
      where: { id: merchantId },
      create: {
        id: merchantId,
        businessName: name,
        tradingName: name,
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        contractStatus: 'SIGNED',
      },
      update: { businessName: name, status: 'ACTIVE' },
    })
    await prisma.branch.upsert({
      where: { id: branchId },
      create: {
        id: branchId,
        merchantId,
        name: `${name} Branch`,
        isMainBranch: true,
        addressLine1: '1 Test St',
        city: 'Huddersfield',
        postcode: 'HD1 2PY',
        country: 'GB',
        latitude: HUDDERSFIELD.lat + (isManuallyConfirmed ? 0.0005 : 0),
        longitude: HUDDERSFIELD.lng + (isManuallyConfirmed ? 0.0005 : 0),
        isActive: true,
        locationConfidence: isManuallyConfirmed ? 'MANUALLY_CONFIRMED' : 'POSTCODE_CENTROID',
      },
      update: {
        latitude: HUDDERSFIELD.lat + (isManuallyConfirmed ? 0.0005 : 0),
        longitude: HUDDERSFIELD.lng + (isManuallyConfirmed ? 0.0005 : 0),
        locationConfidence: isManuallyConfirmed ? 'MANUALLY_CONFIRMED' : 'POSTCODE_CENTROID',
        isActive: true,
      },
    })
  }
}

beforeAll(async () => {
  await ensureFixtures()
})

afterAll(async () => {
  await prisma.branch.deleteMany({ where: { id: { in: [APPROX_BRANCH_ID, EXACT_BRANCH_ID] } } })
  await prisma.merchant.deleteMany({ where: { id: { in: [APPROX_MERCHANT_ID, EXACT_MERCHANT_ID] } } })
  await prisma.$disconnect()
})

describe('M3a hybrid contract — legacy + V2 fields side-by-side', () => {
  // Search includes BOTH fixtures via shared unique businessName prefix.
  const searchAt = () => searchMerchants(prisma, {
    q: PREFIX,
    lat: HUDDERSFIELD.lat,
    lng: HUDDERSFIELD.lng,
    userId: null,
    limit: 20,
    offset: 0,
    sortBy: 'relevance',
  } as Parameters<typeof searchMerchants>[1])

  it('POSTCODE_CENTROID merchant: STILL appears in Discovery response (legacy inclusion preserved)', async () => {
    const result = await searchAt()
    const tile = result.merchants.find((m: any) => m.id === APPROX_MERCHANT_ID)
    expect(tile).toBeDefined()
  })

  it('POSTCODE_CENTROID merchant tile: keeps legacy supplyTier, V2 fields ALL null', async () => {
    const result = await searchAt()
    const tile = result.merchants.find((m: any) => m.id === APPROX_MERCHANT_ID)
    expect(tile).toBeDefined()
    // Legacy preserved.
    expect(typeof tile!.supplyTier).toBe('string')
    expect(['NEARBY', 'CITY', 'DISTANT']).toContain(tile!.supplyTier)
    // M3a additive — null because classifyRung's discoverability gate
    // rejects POSTCODE_CENTROID branches.
    expect(tile!.supplyRung).toBeNull()
    expect(tile!.proximityBand).toBeNull()
    expect(tile!.distanceMetres).toBeNull()
    expect(tile!.contextBranchId).toBeNull()
  })

  it('MANUALLY_CONFIRMED merchant tile: has BOTH legacy supplyTier AND V2 fields', async () => {
    const result = await searchAt()
    const tile = result.merchants.find((m: any) => m.id === EXACT_MERCHANT_ID)
    expect(tile).toBeDefined()
    expect(['NEARBY', 'CITY', 'DISTANT']).toContain(tile!.supplyTier)
    // V2 ranks this merchant — fields should be present.
    expect(tile!.supplyRung).not.toBeNull()
    expect(typeof tile!.supplyRung).toBe('string')
    expect(tile!.proximityBand).not.toBeNull()
    expect(typeof tile!.proximityBand).toBe('string')
    expect(typeof tile!.contextBranchId).toBe('string')
    expect(tile!.contextBranchId).toBe(EXACT_BRANCH_ID)
    // distanceMetres is a number (computed from GPS to context branch).
    expect(typeof tile!.distanceMetres).toBe('number')
  })

  it('meta.effectiveLocality: populated when EffectiveLocation resolves from GPS', async () => {
    const result = await searchAt()
    expect(result.meta).toBeDefined()
    expect((result.meta as any).effectiveLocality).toBeDefined()
    expect((result.meta as any).effectiveLocality).not.toBeNull()
    expect(typeof (result.meta as any).effectiveLocality.id).toBe('string')
    expect(typeof (result.meta as any).effectiveLocality.name).toBe('string')
  })

  it('meta.rungCounts: present, total <= total of legacy nearby+city+distant (V2 admits subset)', async () => {
    const result = await searchAt()
    const meta: any = result.meta
    expect(meta.rungCounts).toBeDefined()
    const v2Total =
      meta.rungCounts.NEARBY + meta.rungCounts.CATCHMENT + meta.rungCounts.POST_TOWN +
      meta.rungCounts.LAD + meta.rungCounts.COUNTY + meta.rungCounts.REGION +
      meta.rungCounts.COUNTRY + meta.rungCounts.NATIONAL
    const legacyTotal = meta.nearbyCount + meta.cityCount + meta.distantCount
    // V2 counts a subset (POSTCODE_CENTROID excluded). Legacy includes
    // both fixtures. The MANUALLY_CONFIRMED merchant is in V2; the
    // POSTCODE_CENTROID merchant is not. So legacy >= V2 + 1 for our
    // fixtures alone (+ any other matching merchants both paths agree on).
    expect(v2Total).toBeGreaterThanOrEqual(1) // at least the MC merchant
    expect(legacyTotal).toBeGreaterThanOrEqual(v2Total + 1) // plus the PC merchant
  })

  it('meta.{nearbyCount,cityCount,distantCount}: legacy semantics preserved (POSTCODE_CENTROID still counted)', async () => {
    const result = await searchAt()
    const meta: any = result.meta
    expect(typeof meta.nearbyCount).toBe('number')
    expect(typeof meta.cityCount).toBe('number')
    expect(typeof meta.distantCount).toBe('number')
    // Both fixtures are at HD1 2PY. The MANUALLY_CONFIRMED one is
    // NEARBY by legacy (has lat/lng + user GPS at the same coords).
    // The POSTCODE_CENTROID one has lat/lng populated in the DB but
    // its position is redacted at the serialization boundary — yet
    // legacy `classifyTier` reads the raw branch object, so it ALSO
    // classifies as NEARBY (the redaction only affects what's exposed
    // on the response, not internal classification).
    expect(meta.nearbyCount).toBeGreaterThanOrEqual(2)
  })
})

describe('M3a hybrid — getHomeFeed wires V2 fields onto tiles (shape preserved)', () => {
  it('home response keeps the existing top-level shape (no fields removed)', async () => {
    const home = await getHomeFeed(prisma, { userId: null, lat: HUDDERSFIELD.lat, lng: HUDDERSFIELD.lng }) as any
    // M3a-era top-level keys MUST still exist (no field removed). The
    // Discovery Rebaseline Phase 1 Task 1.7 PR (Spec §1.5) additionally
    // appends three NEW branch-themed keys (`featuredBranches`,
    // `trendingBranches`, `nearbyByCategoryBranches`) alongside these —
    // pinned in `home-feed-branches.test.ts`. We assert presence (not an
    // exact key-set match) so future additive Phase 1/2 fields don't
    // require touching this anti-removal pin.
    for (const key of ['campaigns', 'featured', 'locationContext', 'nearbyByCategory', 'trending']) {
      expect(home).toHaveProperty(key)
    }
    // The existing locationContext shape is intact.
    expect(home.locationContext).toBeDefined()
    expect(home.locationContext).toHaveProperty('city')
    expect(home.locationContext).toHaveProperty('source')
  }, 30_000)

  it('home tiles carry the additive M3 V2 fields, and at least one tile is V2-classified', async () => {
    const home = await getHomeFeed(prisma, { userId: null, lat: HUDDERSFIELD.lat, lng: HUDDERSFIELD.lng })

    // Across ALL home tiles in ALL three collections (featured /
    // trending / nearbyByCategory), every tile must carry the four
    // additive M3 fields as `null | string | number` (never
    // `undefined`). This pins the merge contract: even tiles V2
    // didn't classify must have the fields explicitly set to null.
    const allHomeTiles = [
      ...home.featured,
      ...home.trending,
      ...home.nearbyByCategory.flatMap(g => g.merchants),
    ]

    // Unconditional pin: the seeded UK data + Huddersfield GPS MUST
    // produce at least one Home tile. A pre-M3a regression that
    // silently returned an empty Home payload would have been hidden
    // by the previous conditional-Karaara assertion — this catches it.
    expect(allHomeTiles.length).toBeGreaterThan(0)

    for (const tile of allHomeTiles) {
      expect((tile as any)).toHaveProperty('supplyRung')
      expect((tile as any)).toHaveProperty('proximityBand')
      expect((tile as any)).toHaveProperty('distanceMetres')
      expect((tile as any)).toHaveProperty('contextBranchId')
    }

    // Generalised "at least one V2-classified Home tile" pin — NOT
    // coupled to a specific seeded merchant. A MANUALLY_CONFIRMED
    // branch with GPS resolving to Huddersfield should always
    // produce at least one V2-admitted merchant. Catches a silent
    // regression where every tile gets null fields (e.g. if
    // resolveEffectiveLocation broke or the merge helper was bypassed).
    const classifiedTile = allHomeTiles.find((t: any) =>
      t.supplyRung !== null
      && t.proximityBand !== null
      && typeof t.contextBranchId === 'string'
      && typeof t.distanceMetres === 'number',
    )
    expect(classifiedTile).toBeDefined()
  }, 30_000)
})
