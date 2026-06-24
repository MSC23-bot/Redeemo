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

// Always-open opening hours: a full-day 00:00 -> 24:00 window for every day of
// the week. `isOpenNow` reports this OPEN at ANY wall-clock time (close 1440 >
// open 0, same-day window, open iff `now >= 0 && now < 1440`). Used instead of a
// realistic overnight (e.g. 18:00 -> 02:00) window so the favourites ORDERING
// pin below is deterministic: `isOpenNow` evaluates against the REAL current
// Europe/London time, so an overnight window would only read OPEN during part of
// the day and make the test clock-of-day-dependent. The overnight-specific
// open/closed behaviour (the actual PR-8 fix) is already pinned by the
// `isOpenNow` unit tests in tests/api/shared/isOpenNow.test.ts.
async function createAlwaysOpenHours(branchId: string): Promise<void> {
  await prisma.branchOpeningHours.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      branchId,
      dayOfWeek,
      openTime: '00:00',
      closeTime: '24:00',
      isClosed: false,
    })),
  })
}

// Always-closed opening hours: every day marked `isClosed`. `isOpenNow` skips
// closed rows, so the branch reads CLOSED at any wall-clock time.
async function createAlwaysClosedHours(branchId: string): Promise<void> {
  await prisma.branchOpeningHours.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      branchId,
      dayOfWeek,
      openTime: null,
      closeTime: null,
      isClosed: true,
    })),
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

  // Branches PR-8 (mini-spec §8) — pins the `isOpen` sort key as load-bearing.
  // The PR-8 isOpenNow fix flips a previously-perpetually-CLOSED overnight branch
  // to OPEN inside its window, so it now floats UP in this favourites ordering.
  // Spec §8 mandates pinning that ordering shift so it is not flagged as a QA
  // surprise. We assert the general invariant the shift produces: an OPEN branch
  // sorts AHEAD of a CLOSED branch even when the CLOSED one was favourited more
  // recently (so the sort is NOT just favouritedAt desc — the open-status key wins).
  //
  // Determinism: we use an always-open (00:00 -> 24:00 every day) vs always-closed
  // (isClosed every day) pair so the assertion holds at ANY wall-clock time the
  // suite runs. The specific overnight (close < open) open/closed behaviour is
  // pinned separately by tests/api/shared/isOpenNow.test.ts (which controls `now`).
  it('global sort: an OPEN branch floats ahead of a CLOSED branch (isOpen sort key is load-bearing)', { timeout: 15000 }, async () => {
    const user = await createUser('open-sort')
    const merchant = await createMerchant('open-sort-merchant')

    // CLOSED branch favourited NEWEST; OPEN branch favourited OLDEST. If the sort
    // were purely favouritedAt desc, CLOSED would come first. The isOpen key must
    // override that and put OPEN first.
    const openBranch = await createBranch(merchant.id, 'open-always')
    await createAlwaysOpenHours(openBranch.id)
    const closedBranch = await createBranch(merchant.id, 'closed-always')
    await createAlwaysClosedHours(closedBranch.id)

    await prisma.favouriteBranch.create({
      data: { userId: user.id, branchId: openBranch.id, createdAt: new Date('2026-01-01T00:00:00Z') },
    })
    await prisma.favouriteBranch.create({
      data: { userId: user.id, branchId: closedBranch.id, createdAt: new Date('2026-03-01T00:00:00Z') },
    })

    const result = await listFavouriteBranches(prisma, user.id, { page: 1, limit: 20 })
    expect(result.total).toBe(2)
    // OPEN (older favourite) ahead of CLOSED (newer favourite) — open-status wins.
    expect(result.items.map(i => i.id)).toEqual([openBranch.id, closedBranch.id])

    const openItem   = result.items.find(i => i.id === openBranch.id)!
    const closedItem = result.items.find(i => i.id === closedBranch.id)!
    expect(openItem.isOpen).toBe(true)
    expect(closedItem.isOpen).toBe(false)
    // Both available — only the open-status key separates them.
    expect(openItem.isUnavailable).toBe(false)
    expect(closedItem.isUnavailable).toBe(false)
  })
})
