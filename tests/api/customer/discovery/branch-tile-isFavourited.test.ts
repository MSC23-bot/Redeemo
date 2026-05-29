// Per-tile isFavourited contract pin under Phase 3C.1g (locked
// branch-as-primary-unit principle, 2026-05-03).
//
// Before M1.5 the discovery enrichment looked up
// `FavouriteMerchant.merchantId IN (...)` and EVERY branch tile of the
// same merchant inherited the heart state from the merchant-level row.
// After M1.5 the lookup is `FavouriteBranch.branchId IN (...)`, so
// sibling branches of the same merchant carry independent heart states.
//
// We assert this directly against `enrichBranchTiles` so the regression
// pin doesn't depend on which Discovery endpoint composes it.
// Regression pin: a sibling branch (B) of a favourited branch (A) must
// surface `isFavourited: false`, NOT inherit A's `true`.
//
// Fixture prefix: BTFAV- so it doesn't collide with any other discovery
// or favourites test family.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient, MerchantStatus, LocationConfidence } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { enrichBranchTiles } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const USER_EMAIL_PREFIX = 'BTFAV-'
const MERCHANT_NAME_PREFIX = 'BTFAV-'

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`
  await sweepFixtures()
})

afterAll(async () => {
  await sweepFixtures()
  await prisma.$disconnect()
})

async function sweepFixtures(): Promise<void> {
  const tryDelete = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try { await fn() } catch (err) { console.warn(`[btfav sweep ${label}]`, err) }
  }
  await tryDelete('favouriteBranch', () => prisma.favouriteBranch.deleteMany({
    where: { user: { email: { startsWith: USER_EMAIL_PREFIX } } },
  }))
  await tryDelete('user', () => prisma.user.deleteMany({
    where: { email: { startsWith: USER_EMAIL_PREFIX } },
  }))
  await tryDelete('branch', () => prisma.branch.deleteMany({
    where: { merchant: { businessName: { startsWith: MERCHANT_NAME_PREFIX } } },
  }))
  await tryDelete('merchant', () => prisma.merchant.deleteMany({
    where: { businessName: { startsWith: MERCHANT_NAME_PREFIX } },
  }))
}

async function createBranch(merchantId: string, slug: string): Promise<{ id: string }> {
  return prisma.branch.create({
    data: {
      merchantId,
      name:                `${MERCHANT_NAME_PREFIX}br-${slug}`,
      addressLine1:        '1 Test St',
      city:                'Testtown',
      postcode:            'TT1 1TT',
      latitude:            51.5,
      longitude:           -0.1,
      isActive:            true,
      locationConfidence:  LocationConfidence.MANUALLY_CONFIRMED,
    },
    select: { id: true },
  })
}

describe('enrichBranchTiles — branch-keyed isFavourited (Phase 3C.1g M1.5)', () => {
  it('sibling branches of the same merchant carry INDEPENDENT heart states', async () => {
    const user = await prisma.user.create({
      data: { email: `${USER_EMAIL_PREFIX}main@x.test` },
      select: { id: true },
    })
    const merchant = await prisma.merchant.create({
      data: { businessName: `${MERCHANT_NAME_PREFIX}m1`, status: MerchantStatus.ACTIVE },
      select: { id: true },
    })
    const branchA = await createBranch(merchant.id, 'a')
    const branchB = await createBranch(merchant.id, 'b')

    // User favourites only branch A.
    await prisma.favouriteBranch.create({
      data: { userId: user.id, branchId: branchA.id },
    })

    const inputs = [
      { branchId: branchA.id, merchantId: merchant.id, supplyRung: null, proximityBand: null, distance: null },
      { branchId: branchB.id, merchantId: merchant.id, supplyRung: null, proximityBand: null, distance: null },
    ]
    const tiles = await enrichBranchTiles(prisma, inputs, {
      userId: user.id,
      lat: null,
      lng: null,
    })

    const byId = new Map(tiles.map(t => [t.id, t]))
    expect(byId.get(branchA.id)?.isFavourited).toBe(true)
    expect(byId.get(branchB.id)?.isFavourited).toBe(false)
  })

  it('guest (userId=null) — all tiles surface isFavourited=false', async () => {
    const merchant = await prisma.merchant.create({
      data: { businessName: `${MERCHANT_NAME_PREFIX}m2`, status: MerchantStatus.ACTIVE },
      select: { id: true },
    })
    const branchA = await createBranch(merchant.id, 'guest-a')
    const branchB = await createBranch(merchant.id, 'guest-b')

    const inputs = [
      { branchId: branchA.id, merchantId: merchant.id, supplyRung: null, proximityBand: null, distance: null },
      { branchId: branchB.id, merchantId: merchant.id, supplyRung: null, proximityBand: null, distance: null },
    ]
    const tiles = await enrichBranchTiles(prisma, inputs, {
      userId: null,
      lat: null,
      lng: null,
    })

    expect(tiles).toHaveLength(2)
    expect(tiles.every(t => t.isFavourited === false)).toBe(true)
  })
})
