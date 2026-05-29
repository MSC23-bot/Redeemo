// getCustomerMerchant per-branch heart state — Phase 3C.1g M1.6.
//
// During Phase 3C.1g v1 the response carries BOTH `merchant.isFavourited`
// (legacy merchant-level, kept additively through the customer-app
// cut-over) AND the new per-branch `selectedBranch.isFavourited` +
// `branches[i].isFavourited` shaped per the locked branch-as-primary-
// unit principle.  The cleanup PR retires the merchant-level field.
//
// Fixture prefix: GCM-FAV-ADD- so this suite doesn't collide with any
// other discovery / merchant / favourites family.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient, MerchantStatus, LocationConfidence } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getCustomerMerchant } from '../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const USER_EMAIL_PREFIX = 'GCM-FAV-ADD-'
const MERCHANT_NAME_PREFIX = 'GCM-FAV-ADD-'

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
    try { await fn() } catch (err) { console.warn(`[gcm-fav sweep ${label}]`, err) }
  }
  await tryDelete('favouriteBranch', () => prisma.favouriteBranch.deleteMany({
    where: { user: { email: { startsWith: USER_EMAIL_PREFIX } } },
  }))
  await tryDelete('favouriteMerchant', () => prisma.favouriteMerchant.deleteMany({
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

async function createBranch(merchantId: string, slug: string, isMain = false): Promise<{ id: string }> {
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
      isMainBranch:        isMain,
      locationConfidence:  LocationConfidence.MANUALLY_CONFIRMED,
    },
    select: { id: true },
  })
}

describe('getCustomerMerchant — per-branch isFavourited (Phase 3C.1g M1.6)', () => {
  it('emits both legacy merchant.isFavourited AND per-branch heart states', async () => {
    const user = await prisma.user.create({
      data: { email: `${USER_EMAIL_PREFIX}main@x.test` },
      select: { id: true },
    })
    const merchant = await prisma.merchant.create({
      data: { businessName: `${MERCHANT_NAME_PREFIX}m1`, status: MerchantStatus.ACTIVE },
      select: { id: true },
    })
    const branchA = await createBranch(merchant.id, 'a', true)  // main / selected by default
    const branchB = await createBranch(merchant.id, 'b')
    const branchC = await createBranch(merchant.id, 'c')

    // User favourites branch A (the selected branch) AND branch C, but NOT B.
    // Also keeps the merchant-level favourite around for the additive
    // transition assertion.
    await prisma.favouriteMerchant.create({
      data: { userId: user.id, merchantId: merchant.id },
    })
    await prisma.favouriteBranch.create({
      data: { userId: user.id, branchId: branchA.id },
    })
    await prisma.favouriteBranch.create({
      data: { userId: user.id, branchId: branchC.id },
    })

    const result: any = await getCustomerMerchant(prisma, merchant.id, user.id, {})

    // 1. Legacy merchant-level — additive carryover until the cleanup PR.
    expect(result.isFavourited).toBe(true)

    // 2. selectedBranch resolves to the main branch (branch A) on cold-
    //    open with no GPS / no ?branch=.  selectedBranch.isFavourited
    //    follows the FavouriteBranch table.
    expect(result.selectedBranch?.id).toBe(branchA.id)
    expect(result.selectedBranch?.isFavourited).toBe(true)

    // 3. branches[] — A and C true, B false (sibling NOT favourited).
    const byId = new Map(result.branches.map((b: any) => [b.id, b]))
    expect((byId.get(branchA.id) as any)?.isFavourited).toBe(true)
    expect((byId.get(branchB.id) as any)?.isFavourited).toBe(false)
    expect((byId.get(branchC.id) as any)?.isFavourited).toBe(true)
  })

  it('guest (userId=null) — every per-branch isFavourited is false', async () => {
    const merchant = await prisma.merchant.create({
      data: { businessName: `${MERCHANT_NAME_PREFIX}m2`, status: MerchantStatus.ACTIVE },
      select: { id: true },
    })
    await createBranch(merchant.id, 'g-a', true)
    await createBranch(merchant.id, 'g-b')

    const result: any = await getCustomerMerchant(prisma, merchant.id, null, {})

    expect(result.isFavourited).toBe(false)
    expect(result.selectedBranch?.isFavourited).toBe(false)
    expect(result.branches.every((b: any) => b.isFavourited === false)).toBe(true)
  })
})
