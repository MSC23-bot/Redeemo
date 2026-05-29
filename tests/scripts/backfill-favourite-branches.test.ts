// Fixture discipline: emails prefixed `BACKFILL-FAVBR-`, merchant
// businessName prefixed `BACKFILL-FAVBR-`.  afterAll sweeps the favourite
// rows (FavouriteBranch + FavouriteMerchant), the branches, the merchants,
// then the users — order respects FK cascades.  seed-guardrail's R8 sweep
// targets a different prefix family so we own our own cleanup here.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient, MerchantStatus } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { backfillFavouriteBranches } from '../../prisma/backfill-favourite-branches'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const USER_EMAIL_PREFIX = 'BACKFILL-FAVBR-'
const MERCHANT_NAME_PREFIX = 'BACKFILL-FAVBR-'

beforeAll(async () => {
  // Warm Neon connection — first cold fixture call can hit a >5s cold-start
  // (matches the existing backfill-user-locality pattern).
  await prisma.$queryRaw`SELECT 1`
  await sweepFixtures()
})

afterAll(async () => {
  await sweepFixtures()
  await prisma.$disconnect()
})

async function sweepFixtures(): Promise<void> {
  // Order matters — FKs cascade only at the User and Merchant root, and
  // some children (Branch / Voucher / FavouriteMerchant / FavouriteBranch)
  // are wrapped individually so a partial cleanup failure on one model
  // doesn't strand the rest.  Mirrors the per-model defensive sweep on
  // backfill-user-locality.test.ts.

  // 1. Favourite-rows first so the (userId, branchId) and (userId,
  // merchantId) uniques don't conflict with a re-run of the test.
  try {
    await prisma.favouriteBranch.deleteMany({
      where: { user: { email: { startsWith: USER_EMAIL_PREFIX } } },
    })
  } catch (err) {
    console.warn('[backfill-favourite-branches test] favouriteBranch sweep failed:', err)
  }
  try {
    await prisma.favouriteMerchant.deleteMany({
      where: { user: { email: { startsWith: USER_EMAIL_PREFIX } } },
    })
  } catch (err) {
    console.warn('[backfill-favourite-branches test] favouriteMerchant sweep failed:', err)
  }
  // 2. Branches (FK to Merchant; no FavouriteBranch left to block delete).
  try {
    await prisma.branch.deleteMany({
      where: { merchant: { businessName: { startsWith: MERCHANT_NAME_PREFIX } } },
    })
  } catch (err) {
    console.warn('[backfill-favourite-branches test] branch sweep failed:', err)
  }
  // 3. Merchants.
  try {
    await prisma.merchant.deleteMany({
      where: { businessName: { startsWith: MERCHANT_NAME_PREFIX } },
    })
  } catch (err) {
    console.warn('[backfill-favourite-branches test] merchant sweep failed:', err)
  }
  // 4. Users.
  try {
    await prisma.user.deleteMany({
      where: { email: { startsWith: USER_EMAIL_PREFIX } },
    })
  } catch (err) {
    console.warn('[backfill-favourite-branches test] user sweep failed:', err)
  }
}

// Helper: create a Merchant with status + name suffix.
async function createMerchant(slug: string, status: MerchantStatus = MerchantStatus.ACTIVE): Promise<{ id: string }> {
  return prisma.merchant.create({
    data: {
      businessName: `${MERCHANT_NAME_PREFIX}${slug}`,
      status,
    },
    select: { id: true },
  })
}

// Helper: create a Branch attached to a merchant.  `mainBranch` decides
// the `isMainBranch` flag; `isActive` defaults true but can be overridden.
async function createBranch(
  merchantId: string,
  nameSuffix: string,
  opts: { mainBranch?: boolean; isActive?: boolean } = {},
): Promise<{ id: string }> {
  return prisma.branch.create({
    data: {
      merchantId,
      name: `${MERCHANT_NAME_PREFIX}br-${nameSuffix}`,
      addressLine1: '1 Test Street',
      city: 'Testtown',
      postcode: 'TT1 1TT',
      isMainBranch: opts.mainBranch ?? false,
      isActive: opts.isActive ?? true,
    },
    select: { id: true },
  })
}

// Helper: create a User with the test prefix.
async function createUser(slug: string): Promise<{ id: string }> {
  return prisma.user.create({
    data: { email: `${USER_EMAIL_PREFIX}${slug}@x.test` },
    select: { id: true },
  })
}

describe('backfillFavouriteBranches', () => {
  it('(a) single-branch ACTIVE merchant — backfills to the main branch', async () => {
    const user = await createUser('a-user')
    const merchant = await createMerchant('a-merchant')
    const mainBranch = await createBranch(merchant.id, 'a-main', { mainBranch: true })
    await prisma.favouriteMerchant.create({
      data: { userId: user.id, merchantId: merchant.id },
    })

    const result = await backfillFavouriteBranches(prisma)

    // The backfill is global, so result counters may include other users
    // present in the DB.  We assert this specific user's row exists.
    expect(result.processed).toBeGreaterThanOrEqual(1)

    const fbs = await prisma.favouriteBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    })
    expect(fbs).toHaveLength(1)
    expect(fbs[0]?.branchId).toBe(mainBranch.id)
  })

  it('(b) multi-branch merchant — backfills ONLY the main branch, not secondaries', async () => {
    const user = await createUser('b-user')
    const merchant = await createMerchant('b-merchant')
    const mainBranch = await createBranch(merchant.id, 'b-main', { mainBranch: true })
    const secondaryBranch = await createBranch(merchant.id, 'b-secondary', { mainBranch: false })
    await prisma.favouriteMerchant.create({
      data: { userId: user.id, merchantId: merchant.id },
    })

    await backfillFavouriteBranches(prisma)

    const fbs = await prisma.favouriteBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    })
    expect(fbs).toHaveLength(1)
    expect(fbs[0]?.branchId).toBe(mainBranch.id)
    // Secondary branch is NOT favourited — the user re-favourites it
    // manually post-cutover per locked spec §6.5.
    expect(fbs.map((f) => f.branchId)).not.toContain(secondaryBranch.id)
  })

  it('(c) merchant with no main branch — skipped (skippedNoMainBranch increments)', async () => {
    const user = await createUser('c-user')
    const merchant = await createMerchant('c-merchant')
    // No main branch — only a non-main branch (data anomaly).
    await createBranch(merchant.id, 'c-secondary', { mainBranch: false })
    await prisma.favouriteMerchant.create({
      data: { userId: user.id, merchantId: merchant.id },
    })

    const before = await prisma.favouriteBranch.count({ where: { userId: user.id } })
    const result = await backfillFavouriteBranches(prisma)
    const after = await prisma.favouriteBranch.count({ where: { userId: user.id } })

    expect(after).toBe(before) // no row created for this user
    // Counters are global so we cap on >=1 — at least our test row was
    // skipped.
    expect(result.skippedNoMainBranch).toBeGreaterThanOrEqual(1)
  })

  it('(d) merchant with inactive main branch — skipped (skippedNoMainBranch increments)', async () => {
    // An inactive main branch is treated the same as "no eligible main
    // branch": the predicate is `isMainBranch=true AND isActive=true`.
    const user = await createUser('d-user')
    const merchant = await createMerchant('d-merchant')
    await createBranch(merchant.id, 'd-main-inactive', { mainBranch: true, isActive: false })
    await prisma.favouriteMerchant.create({
      data: { userId: user.id, merchantId: merchant.id },
    })

    const before = await prisma.favouriteBranch.count({ where: { userId: user.id } })
    const result = await backfillFavouriteBranches(prisma)
    const after = await prisma.favouriteBranch.count({ where: { userId: user.id } })

    expect(after).toBe(before)
    expect(result.skippedNoMainBranch).toBeGreaterThanOrEqual(1)
  })

  it('(e) inactive merchant — skipped (skippedInactiveMerchant increments)', async () => {
    const user = await createUser('e-user')
    const merchant = await createMerchant('e-merchant', MerchantStatus.INACTIVE)
    await createBranch(merchant.id, 'e-main', { mainBranch: true })
    await prisma.favouriteMerchant.create({
      data: { userId: user.id, merchantId: merchant.id },
    })

    const before = await prisma.favouriteBranch.count({ where: { userId: user.id } })
    const result = await backfillFavouriteBranches(prisma)
    const after = await prisma.favouriteBranch.count({ where: { userId: user.id } })

    expect(after).toBe(before)
    expect(result.skippedInactiveMerchant).toBeGreaterThanOrEqual(1)
  })

  // 15s — (f) runs the backfill twice, so it does roughly double the work
  // of the other tests.  The shared dev DB has accumulated FavouriteMerchant
  // rows from earlier test runs (the backfill is a global scan), so 5s
  // default fits comfortably for one pass but is tight for two.
  it('(f) idempotency — re-run produces zero new rows + skippedAlreadyFavourited bumps', { timeout: 15000 }, async () => {
    const user = await createUser('f-user')
    const merchant = await createMerchant('f-merchant')
    const mainBranch = await createBranch(merchant.id, 'f-main', { mainBranch: true })
    await prisma.favouriteMerchant.create({
      data: { userId: user.id, merchantId: merchant.id },
    })

    // First run — inserts.
    await backfillFavouriteBranches(prisma)
    const after1 = await prisma.favouriteBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true, createdAt: true },
    })
    expect(after1).toHaveLength(1)
    expect(after1[0]?.branchId).toBe(mainBranch.id)
    const firstCreatedAt = after1[0]?.createdAt

    // Second run — must skip via P2002.
    const result2 = await backfillFavouriteBranches(prisma)
    const after2 = await prisma.favouriteBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true, createdAt: true },
    })
    expect(after2).toHaveLength(1)
    expect(after2[0]?.createdAt.getTime()).toBe(firstCreatedAt?.getTime())
    // Global counter — at least this user's row contributes to the
    // already-favourited bucket.
    expect(result2.skippedAlreadyFavourited).toBeGreaterThanOrEqual(1)
  })

  it('(g) dry-run — no FavouriteBranch row written; inserted counter shows would-have-written', async () => {
    const user = await createUser('g-user')
    const merchant = await createMerchant('g-merchant')
    await createBranch(merchant.id, 'g-main', { mainBranch: true })
    await prisma.favouriteMerchant.create({
      data: { userId: user.id, merchantId: merchant.id },
    })

    const before = await prisma.favouriteBranch.count({ where: { userId: user.id } })
    const result = await backfillFavouriteBranches(prisma, /* dryRun */ true)
    const after = await prisma.favouriteBranch.count({ where: { userId: user.id } })

    // Critical contract: dry-run writes ZERO rows.
    expect(after).toBe(before)
    // Counter accounts for the user (and may include other unrelated
    // eligible rows from concurrent fixtures).
    expect(result.inserted).toBeGreaterThanOrEqual(1)
  })
})
