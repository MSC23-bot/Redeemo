import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  recomputeCategoryCounts,
  recomputeTagCounts,
  categoryMerchantWhere,
  tagMerchantWhere,
} from '../../../src/api/lib/merchantCount'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

afterAll(async () => {
  await prisma.$disconnect()
})

// Fast, DB-free unit tests for the excludeTestData hardening. Default behaviour
// (no option) is byte-for-byte what the full seed has always used; the standalone
// production runner passes excludeTestData:true so counts match the customer-facing
// lists (which exclude isTestData).
describe('excludeTestData where-builders', () => {
  it('omit isTestData by DEFAULT — preserves seed / dev behaviour', () => {
    expect(categoryMerchantWhere('c1')).not.toHaveProperty('isTestData')
    expect(categoryMerchantWhere('c1', {})).not.toHaveProperty('isTestData')
    expect(categoryMerchantWhere('c1', { excludeTestData: false })).not.toHaveProperty('isTestData')
    expect(tagMerchantWhere('t1')).not.toHaveProperty('isTestData')
    expect(tagMerchantWhere('t1', { excludeTestData: false })).not.toHaveProperty('isTestData')
  })

  it('add isTestData:false ONLY when excludeTestData is true — production runner', () => {
    expect(categoryMerchantWhere('c1', { excludeTestData: true })).toMatchObject({ isTestData: false, status: 'ACTIVE' })
    expect(tagMerchantWhere('t1', { excludeTestData: true })).toMatchObject({ isTestData: false, status: 'ACTIVE' })
  })

  it('preserve the OR clauses and ACTIVE status in both modes', () => {
    expect(categoryMerchantWhere('c1').status).toBe('ACTIVE')
    expect((categoryMerchantWhere('c1').OR as unknown[]).length).toBe(2)
    expect((tagMerchantWhere('t1').OR as unknown[]).length).toBe(3)
    expect((tagMerchantWhere('t1', { excludeTestData: true }).OR as unknown[]).length).toBe(3)
  })
})

describe('recomputeCategoryCounts', () => {
  it('updates Category.merchantCountByCity with current merchant counts per city', { timeout: 120000 }, async () => {
    const foodCat = await prisma.category.findFirst({ where: { name: 'Food & Drink', parentId: null } })
    expect(foodCat).not.toBeNull()

    await recomputeCategoryCounts(prisma)

    const updated = await prisma.category.findUnique({ where: { id: foodCat!.id } })
    expect(updated!.merchantCountByCity).toBeTypeOf('object')
    const counts = updated!.merchantCountByCity as Record<string, number>
    for (const [city, n] of Object.entries(counts)) {
      expect(typeof city).toBe('string')
      expect(typeof n).toBe('number')
      expect(n).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('recomputeTagCounts', () => {
  // 180s timeout: 262 tags × 2 serial Neon round-trips ≈ 95s observed; bumped
  // headroom for slow Neon cold starts.
  it('updates Tag.merchantCountByCity for tags that have merchant assignments', { timeout: 180000 }, async () => {
    await recomputeTagCounts(prisma)

    const sampleTag = await prisma.tag.findFirst({ where: { type: 'CUISINE' } })
    expect(sampleTag).not.toBeNull()
    expect(typeof sampleTag!.merchantCountByCity).toBe('object')
  })
})
