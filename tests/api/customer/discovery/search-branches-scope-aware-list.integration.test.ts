// PR #112 fixup-6.5 (2026-05-20) — owner-locked scope/list contract.
//
// Owner-flagged device-QA blocker: `Nearby · 1` pill active but the
// visible list showed 4 items (Pino's NEARBY + 3 rank-dropped Covelum/
// Kerala via fallback).  Confusing UX — the active pill said Nearby
// but the list included results 173 miles away.
//
// Locked contract (this file pins it):
//   1. When scope is NARROW (nearby / city / region) AND has supply,
//      list shows ONLY scope-filtered ranked tiles.
//   2. Cumulative `More places · N` count still reflects all matches
//      (rank-dropped fallback + POSTCODE_CENTROID tail count toward
//      `distantCount`).
//   3. Wider matches surface in the list ONLY when:
//        a. user explicitly taps More places (scope='platform'), OR
//        b. scope-filtered ranked list is empty (cascade rescue path).
//   4. When backend cascade expands narrow scope to wider scope
//      because narrow had zero supply, the active pill auto-flips to
//      the resolved scope (handled by SearchScreen reading
//      branchMeta.scope).
//
// Fixture: 1 nearby ranking branch + 4 rank-dropped direct-text branches
// (matching the same query but at distant geographies).  Mirrors the
// owner's screenshot scenario.

import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { searchBranches } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-scope-list-'
const MERCHANT_NAME  = `${FIXTURE_PREFIX}restaurantesque`
const NEARBY_BRANCH  = `${FIXTURE_PREFIX}b-nearby`
const FAR_BRANCH_1   = `${FIXTURE_PREFIX}b-far-1`
const FAR_BRANCH_2   = `${FIXTURE_PREFIX}b-far-2`
const FAR_BRANCH_3   = `${FIXTURE_PREFIX}b-far-3`
const FAR_BRANCH_4   = `${FIXTURE_PREFIX}b-far-4`

let MERCHANT_ID: string

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`

  // Single merchant with 5 branches — 1 ranking NEARBY at Huddersfield,
  // 4 at North Sea coords with null locality fields so they classify
  // as NATIONAL (> maxRung REGION for MIXED_NORMAL @ URBAN) → all 4 land
  // in the text-match fallback bucket.
  const merchant = await prisma.merchant.create({
    data: {
      businessName: MERCHANT_NAME,
      status:       'ACTIVE',
      branches: {
        create: [
          {
            id:                 NEARBY_BRANCH,
            name:               `${FIXTURE_PREFIX}Nearby Branch`,
            addressLine1:       '1 Test St',
            city:               'Huddersfield',
            postcode:           'HD1 1XX',
            country:            'GB',
            latitude:           53.6463, // Huddersfield centre
            longitude:          -1.7809,
            isActive:           true,
            locationConfidence: 'MANUALLY_CONFIRMED',
          },
          ...[FAR_BRANCH_1, FAR_BRANCH_2, FAR_BRANCH_3, FAR_BRANCH_4].map((id, i) => ({
            id,
            name:               `${FIXTURE_PREFIX}Far ${i + 1}`,
            addressLine1:       `${i + 1} Test St`,
            city:               `${FIXTURE_PREFIX}FarCity-${i + 1}`,
            postcode:           `XX1 ${i + 1}XX`,
            country:            'GB',
            latitude:           54.500,            // North Sea
            longitude:          5.000 + i * 0.01,
            isActive:           true,
            locationConfidence: 'MANUALLY_CONFIRMED' as const,
            localityId:         null,
            postTown:           null,
            ladDistrict:        null,
            adminCounty:        null,
            region:             null,
            locationCountry:    null,
          })),
        ],
      },
    },
    include: { branches: true },
  })
  MERCHANT_ID = merchant.id
})

afterAll(async () => {
  await prisma.branch.deleteMany({ where: { merchantId: MERCHANT_ID } })
  await prisma.merchant.delete({ where: { id: MERCHANT_ID } }).catch(() => {})
  await prisma.$disconnect()
})

function fixtureBranchIds(branches: { id: string; merchant: { id: string } }[]): Set<string> {
  return new Set(branches.filter(b => b.merchant.id === MERCHANT_ID).map(b => b.id))
}

describe('searchBranches — scope-aware list assembly (PR #112 fixup-6.5)', () => {
  it('scope=nearby with 1 nearby supply: list shows ONLY the nearby branch (4 wider matches stay hidden)', async () => {
    const result = await searchBranches(prisma, {
      q:      MERCHANT_NAME,
      lat:    53.6463, lng: -1.7809,
      scope:  'nearby',
      limit:  100, offset: 0, userId: null,
    } as any)
    const ids = fixtureBranchIds(result.branches)
    expect(ids.has(NEARBY_BRANCH)).toBe(true)
    expect(ids.has(FAR_BRANCH_1)).toBe(false)
    expect(ids.has(FAR_BRANCH_2)).toBe(false)
    expect(ids.has(FAR_BRANCH_3)).toBe(false)
    expect(ids.has(FAR_BRANCH_4)).toBe(false)
    expect(ids.size).toBe(1)
    // Active pill = nearby; backend honoured the request (no cascade).
    expect(result.meta.scope).toBe('nearby')
    expect(result.meta.scopeExpanded).toBe(false)
  })

  it('scope=nearby cumulative count reflects all 5 matches (cascade visibility intact)', async () => {
    const result = await searchBranches(prisma, {
      q:      MERCHANT_NAME,
      lat:    53.6463, lng: -1.7809,
      scope:  'nearby',
      limit:  100, offset: 0, userId: null,
    } as any)
    // Pill row uses cumulative: nearby=1, city=1, platform=1+0+4=5.
    expect(result.meta.nearbyCount).toBe(1)
    // 4 far branches all count toward distant via the fallback.
    const total = result.meta.nearbyCount + result.meta.cityCount + result.meta.distantCount
    expect(total).toBe(5)
  })

  it('scope=platform: list shows ALL 5 matches (1 ranked + 4 fallback)', async () => {
    const result = await searchBranches(prisma, {
      q:      MERCHANT_NAME,
      lat:    53.6463, lng: -1.7809,
      scope:  'platform',
      limit:  100, offset: 0, userId: null,
    } as any)
    const ids = fixtureBranchIds(result.branches)
    expect(ids.size).toBe(5)
    expect(ids.has(NEARBY_BRANCH)).toBe(true)
    expect(ids.has(FAR_BRANCH_1)).toBe(true)
    expect(ids.has(FAR_BRANCH_2)).toBe(true)
    expect(ids.has(FAR_BRANCH_3)).toBe(true)
    expect(ids.has(FAR_BRANCH_4)).toBe(true)
    expect(result.meta.scope).toBe('platform')
  })

  it('scope=city: list shows scope-filtered tiles only (NEARBY in scope; far matches stay hidden)', async () => {
    const result = await searchBranches(prisma, {
      q:      MERCHANT_NAME,
      lat:    53.6463, lng: -1.7809,
      scope:  'city',
      limit:  100, offset: 0, userId: null,
    } as any)
    const ids = fixtureBranchIds(result.branches)
    // NEARBY is admitted under scope=city (CITY tier = NEARBY + CATCHMENT + POST_TOWN).
    expect(ids.has(NEARBY_BRANCH)).toBe(true)
    expect(ids.has(FAR_BRANCH_1)).toBe(false)
    expect(ids.has(FAR_BRANCH_2)).toBe(false)
    expect(ids.size).toBe(1)
  })

  // PR #112 fixup-6.6 (2026-05-20) — fallback distance-first sort pin.
  //
  // Owner-flagged device-QA: under `More places`, the two Covelum
  // branches surfaced with Brightlingsea (173.1mi) BEFORE Colchester
  // (165.6mi).  Root cause: fallback sort was alphabetical by
  // merchant.businessName + branch.name → 'B' < 'C' → Brightlingsea
  // first despite being farther.
  //
  // Fix: distance ASC primary, alphabetical tiebreak.  Within the
  // fallback bucket, nearer branches surface first.
  it('fallback ordering: same-merchant branches sort nearer-first (distance ASC, not alphabetical)', async () => {
    const result = await searchBranches(prisma, {
      q:      MERCHANT_NAME,
      lat:    53.6463, lng: -1.7809, // Huddersfield
      scope:  'platform',            // broaden so fallback surfaces
      limit:  100, offset: 0, userId: null,
    } as any)
    // All 5 fixture branches in this suite share the same businessName,
    // so the alphabetical tiebreak would NOT discriminate by distance
    // pre-fix.  Now distance is the primary key.
    const ourTiles = result.branches.filter(t => t.merchant.id === MERCHANT_ID)
    // Compute index-of for each fixture branch.
    const idx = (id: string) => ourTiles.findIndex(t => t.id === id)
    // Nearby is always first (it's in ranked, not fallback).
    expect(idx(NEARBY_BRANCH)).toBe(0)
    // The 4 far branches are at lat=54.5 with longitudes 5.00, 5.01, 5.02, 5.03.
    // From Huddersfield (53.6463, -1.7809), the longitude diff drives the
    // distance variance — FAR_BRANCH_1 (lng=5.00) is closer than
    // FAR_BRANCH_4 (lng=5.03).  Owner-locked ordering: nearer first.
    expect(idx(FAR_BRANCH_1)).toBeLessThan(idx(FAR_BRANCH_2))
    expect(idx(FAR_BRANCH_2)).toBeLessThan(idx(FAR_BRANCH_3))
    expect(idx(FAR_BRANCH_3)).toBeLessThan(idx(FAR_BRANCH_4))
  })

  it('cascade rescue: scope=nearby with NO nearby supply auto-expands to wider, list shows wider (owner direction)', async () => {
    // Deactivate the nearby branch temporarily — scope=nearby now has
    // zero supply, cascade should expand to wider scope to show the
    // 4 fallback branches (active pill auto-flips via branchMeta.scope).
    await prisma.branch.update({
      where: { id: NEARBY_BRANCH },
      data:  { isActive: false },
    })
    try {
      const result = await searchBranches(prisma, {
        q:      MERCHANT_NAME,
        lat:    53.6463, lng: -1.7809,
        scope:  'nearby',
        limit:  100, offset: 0, userId: null,
      } as any)
      // Cascade expanded → scope-filtered ranked list is empty →
      // showWiderSupply gate opens → 4 fallback branches surface.
      const ids = fixtureBranchIds(result.branches)
      expect(ids.has(NEARBY_BRANCH)).toBe(false) // deactivated
      expect(ids.has(FAR_BRANCH_1)).toBe(true)
      expect(ids.has(FAR_BRANCH_2)).toBe(true)
      expect(ids.has(FAR_BRANCH_3)).toBe(true)
      expect(ids.has(FAR_BRANCH_4)).toBe(true)
      // scopeExpanded reflects that the cascade widened beyond the
      // requested nearby — customer-app uses this to switch active pill
      // + show the locality-aware expanded header.
      expect(result.meta.scopeExpanded).toBe(true)
    } finally {
      // Restore the nearby branch for subsequent tests.
      await prisma.branch.update({
        where: { id: NEARBY_BRANCH },
        data:  { isActive: true },
      })
    }
  })
})
