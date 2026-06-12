// tests/api/lib/findOrCreateLocality.test.ts
import 'dotenv/config'
import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { findOrCreateLocality } from '../../../src/api/lib/findOrCreateLocality'
import type { ResolvedPostcodeSnapshot } from '../../../src/api/lib/postcodeResolver'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

afterAll(async () => {
  await prisma.$disconnect()
})

describe('findOrCreateLocality', () => {
  afterEach(async () => {
    // Cleanup the test-only Localities written by these tests. Real seeded
    // Localities never have slugs starting with 'test-' (those are reserved
    // for test fixtures), so the scope is safe against real data.
    await prisma.locality.deleteMany({ where: { slug: { startsWith: 'test-' } } })
  })

  it('returns existing Locality on slug match', async () => {
    const existing = await prisma.locality.create({
      data: {
        name: 'Test Town',
        slug: 'test-town',
        ladDistrict: 'TestLAD',
        country: 'England',
        centerLat: 51.5,
        centerLng: -0.1,
        populationTier: 'TOWN',
      },
    })

    const snapshot: ResolvedPostcodeSnapshot = {
      postcode: 'TT1 1TT',
      latitude: 51.5,
      longitude: -0.1,
      country: 'England',
      region: null,
      ladDistrict: 'TestLAD',
      adminCounty: null,
      parish: 'Test Town',
      adminWard: 'Test Ward',
      parliamentaryConstituency: 'Test Constituency',
      postTown: null,
    }

    const loc = await findOrCreateLocality(prisma, snapshot)
    expect(loc.id).toBe(existing.id)
    expect(loc.needsReview).toBe(false)
  })

  it('creates a new Locality with needsReview=true when no match', async () => {
    const snapshot: ResolvedPostcodeSnapshot = {
      postcode: 'NN9 9NN',
      latitude: 52.0,
      longitude: -1.0,
      country: 'England',
      region: 'East Midlands',
      ladDistrict: 'test-unknown-district',
      adminCounty: 'TestCounty',
      parish: 'Test New Parish',
      adminWard: 'Test Ward',
      parliamentaryConstituency: 'Test Constituency',
      postTown: 'Test Town Outer',
    }

    const loc = await findOrCreateLocality(prisma, snapshot)
    expect(loc.needsReview).toBe(true)
    expect(loc.populationTier).toBe('UNKNOWN')
    expect(loc.name).toBe('Test New Parish')
    expect(loc.country).toBe('England')
  })

  // PR #81 review — regression pin against the slug-collision bug Codex
  // flagged. Two Localities in the same (ladDistrict, country) where the
  // bare-name parish slugifies to the same string as the parenthetical
  // disambiguator + LAD-suffix. Identity MUST be tuple-based: looking
  // up the bare name returns the bare row, looking up the parenthetical
  // returns the parenthetical row. Pre-fix, slug-based lookup returned
  // whichever row happened to claim the colliding slug first.
  it('distinguishes Langley vs Langley (Uttlesford) by name even though slugs are similar', async () => {
    // Seed both rows in the same (ladDistrict, country):
    const bare = await prisma.locality.create({
      data: {
        name: 'Test-Langley',
        slug: 'test-langley',
        ladDistrict: 'Test-Uttlesford',
        country: 'England',
        centerLat: 51.97,
        centerLng: 0.27,
        populationTier: 'VILLAGE',
      },
    })
    const paren = await prisma.locality.create({
      data: {
        name: 'Test-Langley (Test-Uttlesford)',
        slug: 'test-langley-test-uttlesford',  // slugifies the parenthetical version
        ladDistrict: 'Test-Uttlesford',
        country: 'England',
        centerLat: 51.98,
        centerLng: 0.28,
        populationTier: 'HAMLET',
      },
    })

    const bareSnap: ResolvedPostcodeSnapshot = {
      postcode: 'TX1 1XX', latitude: 51.97, longitude: 0.27,
      country: 'England', region: null, ladDistrict: 'Test-Uttlesford',
      adminCounty: null, parish: 'Test-Langley',
      adminWard: null, parliamentaryConstituency: null, postTown: null,
    }
    const parenSnap: ResolvedPostcodeSnapshot = { ...bareSnap, parish: 'Test-Langley (Test-Uttlesford)' }

    const bareResolved = await findOrCreateLocality(prisma, bareSnap)
    const parenResolved = await findOrCreateLocality(prisma, parenSnap)

    expect(bareResolved.id).toBe(bare.id)
    expect(parenResolved.id).toBe(paren.id)
    expect(bareResolved.id).not.toBe(parenResolved.id)   // distinct rows
    expect(bareResolved.needsReview).toBe(false)         // existing rows, not auto-created
    expect(parenResolved.needsReview).toBe(false)
  })
})
