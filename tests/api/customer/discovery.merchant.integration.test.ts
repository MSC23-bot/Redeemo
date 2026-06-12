import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getCustomerMerchant, getCategoryMerchants } from '../../../src/api/customer/discovery/service'

// Integration test against the worktree's Neon DB. Locks the privacy contract
// for /api/v1/customer/merchants/:id: contact details (phone/email) live on
// Branch only, never at the top-level Merchant. This caught a real bug where
// the Prisma select included phone/email keys on Merchant — fields that don't
// exist there.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

let devMerchantId: string

beforeAll(async () => {
  const m = await prisma.merchant.findFirst({
    where: { id: 'dev-merchant-001' },
    select: { id: true },
  })
  if (!m) throw new Error('dev-merchant-001 not seeded — run `npx prisma db seed` first')
  devMerchantId = m.id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('getCustomerMerchant — phone/email privacy contract', () => {
  it('does not throw on a valid merchant id (no schema-drift on the select)', async () => {
    await expect(getCustomerMerchant(prisma, devMerchantId, null)).resolves.toBeDefined()
  })

  it('does not expose phone or email at the top level of the response', async () => {
    const result = await getCustomerMerchant(prisma, devMerchantId, null)
    expect(result).not.toHaveProperty('phone')
    expect(result).not.toHaveProperty('email')
  })

  it('exposes phone + email on each branch (correct location for contact details)', async () => {
    const result = await getCustomerMerchant(prisma, devMerchantId, null)
    expect(Array.isArray(result.branches)).toBe(true)
    expect(result.branches.length).toBeGreaterThan(0)
    for (const branch of result.branches) {
      expect(branch).toHaveProperty('phone')
      expect(branch).toHaveProperty('email')
    }
  })
})

describe('getCustomerMerchant — descriptor pipeline', () => {
  it('returns descriptor="Italian Restaurant" for dev-merchant-001 (tag + subcategory suffix pipeline)', async () => {
    // seed scenario 1 — Restaurant subcategory (descriptorSuffix:'Restaurant') + Italian CUISINE tag
    // → buildDescriptor('Italian', 'Restaurant') → 'Italian Restaurant'
    const result = await getCustomerMerchant(prisma, devMerchantId, null)
    expect(result.descriptor).toBe('Italian Restaurant')
  })
})

// Plan 1.5 Task 20 — exercises the rank-then-enrich pipeline end-to-end against
// the real Plan 1.5 Neon DB (mitigates Risk 3: "tests pass but production
// broken" caused by the unit tests' Prisma mocks shadowing real schema bugs).
// Specifically verifies that classifyTier receives `branches.{city, lat, lng}`
// and produces NEARBY/CITY tiers — not silent collapse to DISTANT.
describe('getCategoryMerchants — tier classification end-to-end', () => {
  // London centre coords (matched against dev-branch-001 at 51.5194, -0.0988
  // ≈ 2.4 km away → within the 2-mile / ~3.2 km NEARBY radius).
  const LONDON_LAT = 51.5074
  const LONDON_LNG = -0.1278

  let restaurantSubcatId: string
  let devUserId: string
  let originalCustomerCity: string | null = null

  beforeAll(async () => {
    const r = await prisma.category.findFirst({
      where:  { name: 'Restaurant', parentId: { not: null } },
      select: { id: true },
    })
    if (!r) throw new Error('Restaurant subcategory not seeded')
    restaurantSubcatId = r.id

    const u = await prisma.user.findUnique({
      where:  { email: 'customer@redeemo.com' },
      select: { id: true, city: true },
    })
    if (!u) throw new Error('customer@redeemo.com not seeded')
    devUserId = u.id
    originalCustomerCity = u.city

    // Ensure customer.city='London' so the CITY-classification test below
    // (which depends on profileCity matching the merchant's branch city) has a
    // stable seed precondition. afterAll restores the original value.
    if (u.city !== 'London') {
      await prisma.user.update({ where: { id: u.id }, data: { city: 'London' } })
    }
  })

  afterAll(async () => {
    if (devUserId) {
      await prisma.user.update({
        where: { id: devUserId },
        data:  { city: originalCustomerCity },
      })
    }
  })

  it('includes supplyTier on every merchant tile in the response', async () => {
    const result = await getCategoryMerchants(prisma, restaurantSubcatId, {
      lat: LONDON_LAT, lng: LONDON_LNG,
      limit: 20, offset: 0, userId: devUserId,
    })
    expect(result.merchants.length).toBeGreaterThan(0)
    for (const m of result.merchants) {
      expect(['NEARBY', 'CITY', 'DISTANT']).toContain((m as any).supplyTier)
    }
  })

  it('classifies dev-merchant-001 as NEARBY when user lat/lng matches its London location', async () => {
    const result = await getCategoryMerchants(prisma, restaurantSubcatId, {
      lat: LONDON_LAT, lng: LONDON_LNG,
      limit: 20, offset: 0, userId: devUserId,
    })
    const dev = result.merchants.find((m: any) => m.id === 'dev-merchant-001')
    expect(dev).toBeDefined()
    expect((dev as any).supplyTier).toBe('NEARBY')
  })

  it('classifies dev-merchant-001 as CITY when user has profileCity=London but no coords', async () => {
    // No coords → falls through NEARBY check, hits CITY check via profileCity
    // match. Verifies branches.city is reaching classifyTier from the real
    // schema (would silently collapse to DISTANT if the field were missing).
    const result = await getCategoryMerchants(prisma, restaurantSubcatId, {
      lat: null, lng: null,
      limit: 20, offset: 0, userId: devUserId,
    })
    const dev = result.merchants.find((m: any) => m.id === 'dev-merchant-001')
    expect(dev).toBeDefined()
    expect((dev as any).supplyTier).toBe('CITY')
  })

  it('returns coherent meta tier counts (each defined; sum equals UK-wide supply)', async () => {
    const result = await getCategoryMerchants(prisma, restaurantSubcatId, {
      lat: LONDON_LAT, lng: LONDON_LNG,
      limit: 20, offset: 0, userId: devUserId,
    })
    const meta = (result as any).meta
    expect(meta).toBeDefined()
    expect(typeof meta.nearbyCount).toBe('number')
    expect(typeof meta.cityCount).toBe('number')
    expect(typeof meta.distantCount).toBe('number')
    expect(['none', 'expanded_to_wider', 'no_uk_supply']).toContain(meta.emptyStateReason)
    // Tier counts always reflect the full input set (regardless of pagination
    // or scope filtering). Sum must be ≥ the page-slice merchants returned.
    const totalSupply = meta.nearbyCount + meta.cityCount + meta.distantCount
    expect(totalSupply).toBeGreaterThanOrEqual(result.merchants.length)
  })
})
