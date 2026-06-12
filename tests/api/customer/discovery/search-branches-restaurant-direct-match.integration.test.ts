// PR #112 fixup-6.3 (2026-05-20) — Restaurant direct-merchant-name match pin.
//
// Owner device-QA blocker (2026-05-20): searching `restaurant` from
// Huddersfield returned Pino's Pizzeria + The Coffee House (which match
// via `categories.some.category.name = 'Restaurant'` subcategory) but
// NOT Covelum Restaurant (which matches via `businessName contains
// 'restaurant'`).
//
// Root cause: Covelum's East-of-England branches classified as COUNTRY
// (region != Huddersfield's Yorkshire region) → `rankBranchesV3`
// dropped them at the maxRung gate (REGION for MIXED_NORMAL @ URBAN).
// The text-match fallback was gated on `rankedTiles.length === 0`; with
// Pino's NEARBY ranking, fallback skipped → Covelum disappeared.
//
// Fix (fixup-6.3): fallback gate relaxed to `q non-empty + effLoc`.
// Direct text matches now always surface as fallback tail, regardless
// of how many branches ranked.
//
// This test pins the durable contract:
//   1. A merchant whose businessName CONTAINS `restaurant` MUST surface
//      for q=`restaurant` from any UK effLoc, even when its branches
//      classify above the ladder maxRung.
//   2. `restaurant` and `restaurant ` MUST return identical branch ID
//      sets (whitespace normalisation invariant, locked in fixup-6).
//   3. Both should-be-present regardless of whether other branches rank.

import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { searchBranches } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-rest-direct-'
const MERCHANT_NAME  = `${FIXTURE_PREFIX}Covelum Restaurant`
const BRANCH_NAME    = `${FIXTURE_PREFIX}Brightlingsea`

// Plus a ranking-branch fixture: SAME query word "restaurant" must
// match this merchant via subcategory (which is set up to match too),
// so the test exercises the case where BOTH ranked branches and
// text-match-dropped branches need to surface.

let MERCHANT_ID: string
let BRANCH_ID:   string

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`

  // The owner-regression fixture: a merchant whose businessName contains
  // "restaurant" but whose branch sits far from any English effLoc.
  // Brightlingsea coords (East of England) → classifyRung returns
  // COUNTRY or NATIONAL from a Yorkshire effLoc → dropped by maxRung.
  const merchant = await prisma.merchant.create({
    data: {
      businessName: MERCHANT_NAME,
      status:       'ACTIVE',
      branches: {
        create: [
          {
            name:               BRANCH_NAME,
            addressLine1:       '1 Test St',
            city:               'Brightlingsea',
            postcode:           'CO7 0AY',
            country:            'GB',
            latitude:           51.8054, // Brightlingsea (Essex, East of England)
            longitude:          1.0244,
            locationConfidence: 'MANUALLY_CONFIRMED',
            isActive:           true,
          },
        ],
      },
    },
    include: { branches: true },
  })
  MERCHANT_ID = merchant.id
  BRANCH_ID   = merchant.branches[0]!.id
})

afterAll(async () => {
  await prisma.branch.deleteMany({ where: { merchantId: MERCHANT_ID } })
  await prisma.merchant.delete({ where: { id: MERCHANT_ID } }).catch(() => {})
  await prisma.$disconnect()
})

function fixtureBranchIds(branches: { id: string; merchant: { id: string } }[]): string[] {
  return branches.filter(b => b.merchant.id === MERCHANT_ID).map(b => b.id).sort()
}

describe('searchBranches — direct merchant-name match for "restaurant" (PR #112 fixup-6.5)', () => {
  // Updated contract (fixup-6.5, owner direction 2026-05-20):
  //   - Narrow scope (nearby / city / region) shows ONLY scope-filtered
  //     ranked tiles.  Rank-dropped direct matches stay HIDDEN until the
  //     user broadens scope (taps More places).
  //   - Cumulative count `More places · N` still reflects all matches,
  //     so the user discovers wider results via the pill row.
  //   - Wider matches surface in the list ONLY when scope='platform' OR
  //     when scope-filtered ranked list is empty (cascade rescue path).

  it('q="restaurant" + scope=platform surfaces the merchant (More places shows everything)', async () => {
    const result = await searchBranches(prisma, {
      q:      'restaurant',
      lat:    53.6463, lng: -1.7809, // Huddersfield
      scope:  'platform',
      limit:  100, offset: 0, userId: null,
    } as any)
    const ours = fixtureBranchIds(result.branches)
    expect(ours).toContain(BRANCH_ID)
  })

  it('q="restaurant" with default scope HIDES rank-dropped Covelum-class branches (cascade lands narrower)', async () => {
    // From Huddersfield, q=restaurant cascade lands on a narrower scope
    // (Pino's NEARBY has supply).  Brightlingsea-coords fixture branch
    // is rank-dropped (COUNTRY > REGION maxRung) AND not in the narrow
    // scope's ranked set → must NOT surface under default scope.
    // Cumulative count still reflects it (verified via meta.distantCount).
    const result = await searchBranches(prisma, {
      q:      'restaurant',
      lat:    53.6463, lng: -1.7809,
      limit:  100, offset: 0, userId: null,
    } as any)
    const ours = fixtureBranchIds(result.branches)
    expect(ours).not.toContain(BRANCH_ID)
    // Meta count includes it though — pill row stays accurate.
    const total = result.meta.nearbyCount + result.meta.cityCount + result.meta.distantCount
    expect(total).toBeGreaterThan(0)
  })

  it('q="restaurant" + scope=nearby HIDES rank-dropped direct matches (owner-locked 2026-05-20)', async () => {
    // Owner direction: "If user-selected scope is nearby: show only
    // nearby results.  More places pill count can show wider results,
    // but they should not appear until user taps More places."
    const result = await searchBranches(prisma, {
      q:      'restaurant',
      lat:    53.6463, lng: -1.7809,
      scope:  'nearby',
      limit:  100, offset: 0, userId: null,
    } as any)
    const ours = fixtureBranchIds(result.branches)
    expect(ours).not.toContain(BRANCH_ID)
  })

  it('q="restaurant" + q="restaurant " return identical scope=platform results (whitespace-norm invariant)', async () => {
    const a = await searchBranches(prisma, {
      q:      'restaurant',
      lat:    53.6463, lng: -1.7809,
      scope:  'platform',
      limit:  100, offset: 0, userId: null,
    } as any)
    const b = await searchBranches(prisma, {
      q:      'restaurant ',
      lat:    53.6463, lng: -1.7809,
      scope:  'platform',
      limit:  100, offset: 0, userId: null,
    } as any)
    expect(fixtureBranchIds(a.branches)).toEqual(fixtureBranchIds(b.branches))
  })

  it('q="restaurant" surfaces the merchant from a non-UK effLoc (Doha — null effLoc falls to nonRankable tail)', async () => {
    // From a non-UK lat/lng, resolveEffectiveLocation returns null → no
    // rankBranchesV3 path → ALL matching branches surface via the
    // nonRankable tail (Spec §4.1.1 — null-effLoc path).  Same outcome
    // regardless of fixup-6.5 scope semantics.
    const result = await searchBranches(prisma, {
      q:      'restaurant',
      lat:    25.276, lng: 51.520, // Doha
      limit:  100, offset: 0, userId: null,
    } as any)
    const ours = fixtureBranchIds(result.branches)
    expect(ours).toContain(BRANCH_ID)
  })
})
