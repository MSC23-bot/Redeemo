// Real-DB pins for listFavouriteBranches enrichment + global sort.
// Fixture prefix BACKFILL-FAVBR-SVC- (distinct from the backfill test's
// BACKFILL-FAVBR- so the two suites don't sweep each other's data on
// concurrent runs).

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient, MerchantStatus, LocationConfidence } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { listFavouriteBranches } from '../../../src/api/customer/favourites/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const USER_EMAIL_PREFIX = 'BACKFILL-FAVBR-SVC-'
const MERCHANT_NAME_PREFIX = 'BACKFILL-FAVBR-SVC-'

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`
  await sweepFixtures()
})

afterAll(async () => {
  await sweepFixtures()
  await prisma.$disconnect()
})

async function sweepFixtures(): Promise<void> {
  try {
    await prisma.favouriteBranch.deleteMany({
      where: { user: { email: { startsWith: USER_EMAIL_PREFIX } } },
    })
  } catch (err) {
    console.warn('[favourites.branches.service test] favouriteBranch sweep failed:', err)
  }
  try {
    await prisma.branchOpeningHours.deleteMany({
      where: { branch: { merchant: { businessName: { startsWith: MERCHANT_NAME_PREFIX } } } },
    })
  } catch (err) {
    console.warn('[favourites.branches.service test] openingHours sweep failed:', err)
  }
  try {
    await prisma.branch.deleteMany({
      where: { merchant: { businessName: { startsWith: MERCHANT_NAME_PREFIX } } },
    })
  } catch (err) {
    console.warn('[favourites.branches.service test] branch sweep failed:', err)
  }
  try {
    await prisma.merchant.deleteMany({
      where: { businessName: { startsWith: MERCHANT_NAME_PREFIX } },
    })
  } catch (err) {
    console.warn('[favourites.branches.service test] merchant sweep failed:', err)
  }
  try {
    await prisma.user.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } })
  } catch (err) {
    console.warn('[favourites.branches.service test] user sweep failed:', err)
  }
}

async function createUser(slug: string): Promise<{ id: string }> {
  return prisma.user.create({
    data: { email: `${USER_EMAIL_PREFIX}${slug}@x.test` },
    select: { id: true },
  })
}

async function createMerchant(slug: string, status: MerchantStatus = MerchantStatus.ACTIVE): Promise<{ id: string }> {
  return prisma.merchant.create({
    data: { businessName: `${MERCHANT_NAME_PREFIX}${slug}`, status },
    select: { id: true },
  })
}

async function createBranch(
  merchantId: string,
  nameSuffix: string,
  opts: { isActive?: boolean; isMainBranch?: boolean; confidence?: LocationConfidence } = {},
): Promise<{ id: string }> {
  return prisma.branch.create({
    data: {
      merchantId,
      name: `${MERCHANT_NAME_PREFIX}br-${nameSuffix}`,
      addressLine1: '1 Test St',
      city: 'Testtown',
      postcode: 'TT1 1TT',
      latitude: 51.5,
      longitude: -0.1,
      isActive: opts.isActive ?? true,
      isMainBranch: opts.isMainBranch ?? false,
      locationConfidence: opts.confidence ?? LocationConfidence.POSTCODE_CENTROID,
    },
    select: { id: true },
  })
}

describe('listFavouriteBranches', () => {
  it('returns empty when user has no favourites', async () => {
    const user = await createUser('empty')
    const result = await listFavouriteBranches(prisma, user.id, { page: 1, limit: 20 })
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('enriches a single ACTIVE-merchant ACTIVE-branch favourite', async () => {
    const user = await createUser('single')
    const merchant = await createMerchant('single-merchant')
    const branch = await createBranch(merchant.id, 'single-branch')
    await prisma.favouriteBranch.create({ data: { userId: user.id, branchId: branch.id } })

    const result = await listFavouriteBranches(prisma, user.id, { page: 1, limit: 20 })
    expect(result.items).toHaveLength(1)
    const item = result.items[0]!
    expect(item.id).toBe(branch.id)
    expect(item.merchant.id).toBe(merchant.id)
    expect(item.isUnavailable).toBe(false)
    expect(item.voucherCount).toBe(0)
    expect(item.maxEstimatedSaving).toBe(0)
  })

  it('marks branch unavailable when the branch is INACTIVE', async () => {
    const user = await createUser('inactive-branch')
    const merchant = await createMerchant('inactive-branch-merchant')
    const branch = await createBranch(merchant.id, 'inactive', { isActive: false })
    await prisma.favouriteBranch.create({ data: { userId: user.id, branchId: branch.id } })

    const result = await listFavouriteBranches(prisma, user.id, { page: 1, limit: 20 })
    expect(result.items[0]!.isUnavailable).toBe(true)
    expect(result.items[0]!.isOpen).toBe(false)
  })

  it('marks branch unavailable when the parent MERCHANT is INACTIVE (branch itself active)', async () => {
    const user = await createUser('inactive-merchant')
    const merchant = await createMerchant('inactive-merchant', MerchantStatus.INACTIVE)
    const branch = await createBranch(merchant.id, 'merchant-down')
    await prisma.favouriteBranch.create({ data: { userId: user.id, branchId: branch.id } })

    const result = await listFavouriteBranches(prisma, user.id, { page: 1, limit: 20 })
    expect(result.items[0]!.isUnavailable).toBe(true)
  })

  it('applies the locationConfidence redaction: POSTCODE_CENTROID returns null coords', async () => {
    const user = await createUser('redaction')
    const merchant = await createMerchant('redaction-merchant')
    const branch = await createBranch(merchant.id, 'centroid', {
      confidence: LocationConfidence.POSTCODE_CENTROID,
    })
    await prisma.favouriteBranch.create({ data: { userId: user.id, branchId: branch.id } })

    const result = await listFavouriteBranches(prisma, user.id, { page: 1, limit: 20 })
    expect(result.items[0]!.latitude).toBeNull()
    expect(result.items[0]!.longitude).toBeNull()
    expect(result.items[0]!.locationConfidence).toBe('POSTCODE_CENTROID')
  })

  it('MANUALLY_CONFIRMED branches expose lat/lng', async () => {
    const user = await createUser('manual')
    const merchant = await createMerchant('manual-merchant')
    const branch = await createBranch(merchant.id, 'confirmed', {
      confidence: LocationConfidence.MANUALLY_CONFIRMED,
    })
    await prisma.favouriteBranch.create({ data: { userId: user.id, branchId: branch.id } })

    const result = await listFavouriteBranches(prisma, user.id, { page: 1, limit: 20 })
    expect(result.items[0]!.latitude).toBeCloseTo(51.5, 5)
    expect(result.items[0]!.longitude).toBeCloseTo(-0.1, 5)
    expect(result.items[0]!.locationConfidence).toBe('MANUALLY_CONFIRMED')
  })

  // 15s — this test does 3× the setup of the others (user + merchant + 3
  // branches + 3 favouriteBranch inserts + 2 listFavouriteBranches calls)
  // and the shared dev DB's cold path can stretch past the default 5s.
  // Matches the timeout pattern on backfill test (f).
  it('global sort across pages: unavailable rows always come last regardless of favouritedAt', { timeout: 15000 }, async () => {
    // Build 3 favourites for ONE user:
    //   A: AVAILABLE (active merchant + active branch), oldest favouritedAt
    //   B: UNAVAILABLE (inactive branch), newest favouritedAt
    //   C: AVAILABLE, middle favouritedAt
    //
    // With page=1 limit=2 we expect [A, C] (both available, ordered by
    // favouritedAt desc since the underlying DB orders by createdAt desc
    // — A is oldest so it appears LAST among the available rows; C newer,
    // first).  Then page=2 limit=2 returns [B] (the unavailable one).
    const user = await createUser('global-sort')
    const merchant = await createMerchant('global-sort-merchant')

    const branchA = await createBranch(merchant.id, 'a-avail')
    const branchB = await createBranch(merchant.id, 'b-unavail', { isActive: false })
    const branchC = await createBranch(merchant.id, 'c-avail')

    // Explicit createdAt so the ordering is deterministic and not reliant
    // on insert timing precision.
    await prisma.favouriteBranch.create({
      data: { userId: user.id, branchId: branchA.id, createdAt: new Date('2026-01-01T00:00:00Z') },
    })
    await prisma.favouriteBranch.create({
      data: { userId: user.id, branchId: branchB.id, createdAt: new Date('2026-03-01T00:00:00Z') },
    })
    await prisma.favouriteBranch.create({
      data: { userId: user.id, branchId: branchC.id, createdAt: new Date('2026-02-01T00:00:00Z') },
    })

    const page1 = await listFavouriteBranches(prisma, user.id, { page: 1, limit: 2 })
    expect(page1.total).toBe(3)
    expect(page1.items.map(i => i.id)).toEqual([branchC.id, branchA.id])
    expect(page1.items.every(i => !i.isUnavailable)).toBe(true)

    const page2 = await listFavouriteBranches(prisma, user.id, { page: 2, limit: 2 })
    expect(page2.items).toHaveLength(1)
    expect(page2.items[0]!.id).toBe(branchB.id)
    expect(page2.items[0]!.isUnavailable).toBe(true)
  })
})
