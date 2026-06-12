// PR #112 fixup-4 (2026-05-19) — short-query relevance pin.
//
// Owner-flagged regression: query `cove` (4 chars) surfaced unrelated
// merchants like `Wagtail Veterinary Practice` because the description
// contained the 4-char substring (e.g. "cover", "covered").  Short
// queries are weak signal for description content; we gate description
// substring matching to `q.length >= 5`.
//
// Strong matches (always on, regardless of q length):
//   - merchant.businessName / tradingName
//   - merchant.primaryCategory.name / categories[].name
//   - merchant.suggestedTag (via tagMerchantIds)
//   - branch.name / branch.localityName / branch.postTown
//
// Weak match (gated):
//   - merchant.description — requires q.trim().length >= 5
//
// Pins:
//   1. q = "cove" (4 chars) + only-description-match merchant → NOT returned.
//   2. q = "cove" + business-name-match merchant → IS returned.
//   3. q = "covel" (5 chars) + only-description-match merchant → IS returned
//      (threshold crossed; description re-enters the OR).
//   4. q = "cove" + branch-name-match → IS returned (strong branch signal).
//
// Real-DB integration pattern (consistent with branch-tile-contract.test.ts).

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { searchBranches } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-desc-gate-'

const DESC_ONLY_ID            = `${FIXTURE_PREFIX}desc-only-merchant`
const DESC_ONLY_BRANCH_ID     = `${FIXTURE_PREFIX}desc-only-branch`
const NAME_MATCH_ID           = `${FIXTURE_PREFIX}name-match-merchant`
const NAME_MATCH_BRANCH_ID    = `${FIXTURE_PREFIX}name-match-branch`
const BRANCH_MATCH_ID         = `${FIXTURE_PREFIX}branch-match-merchant`
const BRANCH_MATCH_BRANCH_ID  = `${FIXTURE_PREFIX}branch-match-branch`

// Test locality — far from any seeded UK locality so we can use lat/lng
// without colliding with other suites' geo fixtures.
const TEST_LAT = 51.81
const TEST_LNG = 1.02

async function createFixtures() {
  // Fixture 1: DESCRIPTION-only match.  businessName + tradingName contain
  // NO "cove"; description does ("cover", "covered").
  await prisma.merchant.upsert({
    where: { id: DESC_ONLY_ID },
    create: {
      id:                 DESC_ONLY_ID,
      businessName:       `${FIXTURE_PREFIX}Wagtail Veterinary Practice`,
      tradingName:        `${FIXTURE_PREFIX}Wagtail Vet`,
      description:        'We cover all pet needs. Our practice has covered Essex for 20 years.',
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: {
      businessName:       `${FIXTURE_PREFIX}Wagtail Veterinary Practice`,
      tradingName:        `${FIXTURE_PREFIX}Wagtail Vet`,
      description:        'We cover all pet needs. Our practice has covered Essex for 20 years.',
      status:             'ACTIVE',
    },
  })
  await prisma.branch.upsert({
    where: { id: DESC_ONLY_BRANCH_ID },
    create: {
      id:                 DESC_ONLY_BRANCH_ID,
      merchantId:         DESC_ONLY_ID,
      name:               `${FIXTURE_PREFIX}Wagtail Branch`,
      isMainBranch:       true,
      addressLine1:       '1 Test St',
      city:               `${FIXTURE_PREFIX}TestVille`,
      postcode:           'CO1 1AA',
      country:            'GB',
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
    update: {
      merchantId:         DESC_ONLY_ID,
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
  })

  // Fixture 2: NAME match — businessName contains "cove" (Covelum).
  await prisma.merchant.upsert({
    where: { id: NAME_MATCH_ID },
    create: {
      id:                 NAME_MATCH_ID,
      businessName:       `${FIXTURE_PREFIX}Covelum Cafe`,
      tradingName:        `${FIXTURE_PREFIX}Covelum`,
      description:        'A pleasant cafe.',
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: {
      businessName:       `${FIXTURE_PREFIX}Covelum Cafe`,
      tradingName:        `${FIXTURE_PREFIX}Covelum`,
      description:        'A pleasant cafe.',
      status:             'ACTIVE',
    },
  })
  await prisma.branch.upsert({
    where: { id: NAME_MATCH_BRANCH_ID },
    create: {
      id:                 NAME_MATCH_BRANCH_ID,
      merchantId:         NAME_MATCH_ID,
      name:               `${FIXTURE_PREFIX}Covelum Main`,
      isMainBranch:       true,
      addressLine1:       '2 Test St',
      city:               `${FIXTURE_PREFIX}TestVille`,
      postcode:           'CO1 1BB',
      country:            'GB',
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
    update: {
      merchantId:         NAME_MATCH_ID,
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
  })

  // Fixture 3: BRANCH-name match — merchant fields are clean; branch.name
  // contains "cove".  Pins that branch-level strong matches still surface
  // for short queries.
  await prisma.merchant.upsert({
    where: { id: BRANCH_MATCH_ID },
    create: {
      id:                 BRANCH_MATCH_ID,
      businessName:       `${FIXTURE_PREFIX}Plain Merchant`,
      tradingName:        `${FIXTURE_PREFIX}Plain`,
      description:        'Plain description with no match.',
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: {
      businessName:       `${FIXTURE_PREFIX}Plain Merchant`,
      tradingName:        `${FIXTURE_PREFIX}Plain`,
      description:        'Plain description with no match.',
      status:             'ACTIVE',
    },
  })
  await prisma.branch.upsert({
    where: { id: BRANCH_MATCH_BRANCH_ID },
    create: {
      id:                 BRANCH_MATCH_BRANCH_ID,
      merchantId:         BRANCH_MATCH_ID,
      name:               `${FIXTURE_PREFIX}Cove View Branch`,
      isMainBranch:       true,
      addressLine1:       '3 Test St',
      city:               `${FIXTURE_PREFIX}TestVille`,
      postcode:           'CO1 1CC',
      country:            'GB',
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
    update: {
      merchantId:         BRANCH_MATCH_ID,
      name:               `${FIXTURE_PREFIX}Cove View Branch`,
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
  })
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`
  await createFixtures()
})

afterAll(async () => {
  await prisma.branch.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.merchant.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.$disconnect()
})

// Filter results to THIS suite's fixtures only.  Real DB has unrelated
// merchants whose descriptions contain "cove" etc.  We pin behaviour on
// our seeded fixtures by checking which ids are/aren't included.
function fixtureMerchantIds(branches: { merchant: { id: string } }[]): Set<string> {
  return new Set(
    branches
      .map(b => b.merchant.id)
      .filter(id => id.startsWith(FIXTURE_PREFIX)),
  )
}

describe('searchBranches — short-query description gate (PR #112 fixup-4)', () => {
  it('q="cove" (4 chars) does NOT surface description-only-match merchants', async () => {
    const result = await searchBranches(prisma, {
      q:      'cove',
      limit:  100,
      offset: 0,
      userId: null,
    })
    const ours = fixtureMerchantIds(result.branches)
    // Wagtail (description-only) MUST NOT appear.
    expect(ours.has(DESC_ONLY_ID)).toBe(false)
    // Covelum (businessName match) MUST appear.
    expect(ours.has(NAME_MATCH_ID)).toBe(true)
    // Cove View Branch (branch.name match) MUST appear (strong signal).
    expect(ours.has(BRANCH_MATCH_ID)).toBe(true)
  })

  it('q="covel" (5 chars — threshold crossed) keeps description match enabled', async () => {
    // Update Wagtail description so it contains the 5-char substring.
    await prisma.merchant.update({
      where: { id: DESC_ONLY_ID },
      data:  { description: 'Mention of covelmark in our description for the 5-char gate test.' },
    })

    const result = await searchBranches(prisma, {
      q:      'covel',
      limit:  100,
      offset: 0,
      userId: null,
    })
    const ours = fixtureMerchantIds(result.branches)
    // With description match re-enabled, Wagtail surfaces via description.
    expect(ours.has(DESC_ONLY_ID)).toBe(true)
    // Covelum (businessName + tradingName) also surfaces.
    expect(ours.has(NAME_MATCH_ID)).toBe(true)
  })

  it('threshold is exactly 5 characters: q="cov" (3) suppresses description match', async () => {
    const result = await searchBranches(prisma, {
      q:      'cov',
      limit:  100,
      offset: 0,
      userId: null,
    })
    const ours = fixtureMerchantIds(result.branches)
    // Description-only match suppressed for any q < 5.
    expect(ours.has(DESC_ONLY_ID)).toBe(false)
  })
})
