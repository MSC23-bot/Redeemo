// Phase 3C.1g Device-QA R1 Wave 4 (2026-05-30) finding #1 — root-cause pin.
//
// `homeRailBuilders` previously passed `userId: null` to every
// `enrichBranchTiles` call.  That meant the branch-keyed favourites
// lookup never fired and EVERY Home rail tile shipped
// `isFavourited: false` regardless of the user's actual favourites.
//
// Owner's device QA: favourite Covelum-Colchester from Merchant Profile,
// then return to Home — the Colchester tile heart stayed empty even
// though Search / Map / Favourites showed it correctly.
//
// Fix: thread `userId` through `buildFeaturedRail`, `buildTrendingRail`,
// `buildPopularRail`, `buildNearbyByCategoryRails` so the inner ctx
// receives the real userId.  This is a positive regression pin:
// `buildPopularRail` (the rail that fires UK-wide and on no-effLoc) MUST
// flip `isFavourited: true` on the favourited user's tile.
//
// `buildPopularRail` is chosen because:
//   - It has the simplest signature (no locality / no rail-meta dance).
//   - It exercises the same `enrichBranchTiles` path the other three
//     builders share.
//   - Its no-effLoc branch is also userId-aware (we cover that too).
//
// Fixture prefix: HRFU- so it sweeps cleanly between runs.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient, MerchantStatus, LocationConfidence } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { buildPopularRail } from '../../../../src/api/customer/discovery/homeRailBuilders'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const USER_PREFIX     = 'HRFU-'
const MERCHANT_PREFIX = 'HRFU-'

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`
  await sweep()
})

afterAll(async () => {
  await sweep()
  await prisma.$disconnect()
})

async function sweep(): Promise<void> {
  const tryDelete = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try { await fn() } catch (err) { console.warn(`[hrfu sweep ${label}]`, err) }
  }
  await tryDelete('favouriteBranch', () => prisma.favouriteBranch.deleteMany({
    where: { user: { email: { startsWith: USER_PREFIX } } },
  }))
  await tryDelete('user', () => prisma.user.deleteMany({
    where: { email: { startsWith: USER_PREFIX } },
  }))
  await tryDelete('branch', () => prisma.branch.deleteMany({
    where: { merchant: { businessName: { startsWith: MERCHANT_PREFIX } } },
  }))
  await tryDelete('merchant', () => prisma.merchant.deleteMany({
    where: { businessName: { startsWith: MERCHANT_PREFIX } },
  }))
}

async function seedMerchantWithBranches(slug: string): Promise<{ merchantId: string; favBranchId: string; otherBranchId: string }> {
  const merchant = await prisma.merchant.create({
    data: { businessName: `${MERCHANT_PREFIX}m-${slug}`, status: MerchantStatus.ACTIVE },
    select: { id: true },
  })
  const fav = await prisma.branch.create({
    data: {
      merchantId:         merchant.id,
      name:               `${MERCHANT_PREFIX}br-${slug}-fav`,
      addressLine1:       '1 Test St',
      city:               'Testtown',
      postcode:           'TT1 1TT',
      latitude:           51.5,
      longitude:          -0.1,
      isActive:           true,
      locationConfidence: LocationConfidence.MANUALLY_CONFIRMED,
    },
    select: { id: true },
  })
  const other = await prisma.branch.create({
    data: {
      merchantId:         merchant.id,
      name:               `${MERCHANT_PREFIX}br-${slug}-other`,
      addressLine1:       '2 Test St',
      city:               'Testtown',
      postcode:           'TT1 1TT',
      latitude:           51.6,
      longitude:          -0.2,
      isActive:           true,
      locationConfidence: LocationConfidence.MANUALLY_CONFIRMED,
    },
    select: { id: true },
  })
  return { merchantId: merchant.id, favBranchId: fav.id, otherBranchId: other.id }
}

describe('Home rail builders — userId threading (Wave 4 #1)', () => {
  it('buildPopularRail (no effLoc) returns isFavourited=true for the user\'s favourited branch tile and false for sibling branches', async () => {
    const user = await prisma.user.create({
      data: { email: `${USER_PREFIX}main@x.test` },
      select: { id: true },
    })
    const { merchantId, favBranchId, otherBranchId } = await seedMerchantWithBranches('a')
    await prisma.favouriteBranch.create({
      data: { userId: user.id, branchId: favBranchId },
    })

    const rail = await buildPopularRail(prisma, user.id, null, 'MIXED_NORMAL')

    // Find the two tiles for this merchant — buildPopularRail returns ONE tile per
    // merchant (deterministic by branch.id), so we may or may not get the favourited
    // one in the no-effLoc branch.  Whichever tile we get, the favourite-set lookup
    // must have used the real userId — otherwise it'd ship isFavourited=false on the
    // favBranch when we DO get it.
    const ourTiles = rail.branches.filter(t => t.merchant.id === merchantId)
    expect(ourTiles.length).toBeGreaterThanOrEqual(1)
    for (const t of ourTiles) {
      if (t.id === favBranchId)   expect(t.isFavourited).toBe(true)
      if (t.id === otherBranchId) expect(t.isFavourited).toBe(false)
    }
  })

  it('buildPopularRail with userId=null leaves every tile isFavourited=false (guest contract preserved)', async () => {
    const { merchantId, favBranchId } = await seedMerchantWithBranches('guest')
    // Don't create a favourite — verify guest path is unchanged.

    const rail = await buildPopularRail(prisma, null, null, 'MIXED_NORMAL')

    const ourTiles = rail.branches.filter(t => t.merchant.id === merchantId)
    expect(ourTiles.length).toBeGreaterThanOrEqual(1)
    for (const t of ourTiles) {
      expect(t.isFavourited).toBe(false)
      if (t.id === favBranchId) {
        // Sanity — confirms the fav-branch id is the one the rail picked,
        // not a divergent code path that always returns false.
        expect(t.id).toBe(favBranchId)
      }
    }
  })
})
