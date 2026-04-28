import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { recomputeCategoryCounts, recomputeTagCounts } from '../../../src/api/lib/merchantCount'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

afterAll(async () => {
  await prisma.$disconnect()
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
  it('updates Tag.merchantCountByCity for tags that have merchant assignments', { timeout: 120000 }, async () => {
    await recomputeTagCounts(prisma)

    const sampleTag = await prisma.tag.findFirst({ where: { type: 'CUISINE' } })
    expect(sampleTag).not.toBeNull()
    expect(typeof sampleTag!.merchantCountByCity).toBe('object')
  })
})
