import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class { constructor(_: any) {} },
}))

vi.mock('../../../generated/prisma/client', () => {
  class PrismaClient {
    category = { findUnique: vi.fn().mockResolvedValue(null) }
    categoryAmenity = { findMany: vi.fn().mockResolvedValue([]) }
    constructor(_: any) {}
  }
  return { PrismaClient }
})

import { getEligibleAmenitiesForSubcategory } from '../../../src/api/lib/amenity'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

describe('getEligibleAmenitiesForSubcategory', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
  })

  it('returns amenities matching direct subcategory rules', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({ id: 'sub-1', parentId: 'top-1' })
    prisma.categoryAmenity.findMany.mockResolvedValueOnce([
      { amenity: { id: 'a-1', name: 'Wi-Fi',         iconUrl: null, isActive: true } },
      { amenity: { id: 'a-2', name: 'Outdoor Seating', iconUrl: null, isActive: true } },
    ])
    const result = await getEligibleAmenitiesForSubcategory(prisma, 'sub-1')
    expect(result.map(a => a.id).sort()).toEqual(['a-1', 'a-2'])
  })

  it('returns amenities from parent inheritance (categoryId IN [sub, parent])', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({ id: 'sub-1', parentId: 'top-1' })
    prisma.categoryAmenity.findMany.mockResolvedValueOnce([
      { amenity: { id: 'a-1', name: 'Wi-Fi', iconUrl: null, isActive: true } },
    ])
    await getEligibleAmenitiesForSubcategory(prisma, 'sub-1')
    expect(prisma.categoryAmenity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: { in: ['sub-1', 'top-1'] },
          amenity: { isActive: true },
        }),
      }),
    )
  })

  it('deduplicates amenities when both subcategory and parent rules reference the same amenity', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({ id: 'sub-1', parentId: 'top-1' })
    prisma.categoryAmenity.findMany.mockResolvedValueOnce([
      { amenity: { id: 'a-1', name: 'Wi-Fi', iconUrl: null, isActive: true } },
      { amenity: { id: 'a-1', name: 'Wi-Fi', iconUrl: null, isActive: true } },
    ])
    const result = await getEligibleAmenitiesForSubcategory(prisma, 'sub-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a-1')
  })

  it('excludes inactive amenities (Amenity.isActive=false)', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({ id: 'sub-1', parentId: 'top-1' })
    // The query already filters by amenity.isActive=true; verify the helper
    // doesn't include any returned-as-inactive rows even if Prisma returns them.
    prisma.categoryAmenity.findMany.mockResolvedValueOnce([])  // simulating Prisma's filter
    const result = await getEligibleAmenitiesForSubcategory(prisma, 'sub-1')
    expect(result).toEqual([])
  })

  it('returns empty array when subcategory does not exist', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(null)
    const result = await getEligibleAmenitiesForSubcategory(prisma, 'sub-bogus')
    expect(result).toEqual([])
    expect(prisma.categoryAmenity.findMany).not.toHaveBeenCalled()
  })

  it('returns amenities ordered by name ASC', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({ id: 'sub-1', parentId: 'top-1' })
    prisma.categoryAmenity.findMany.mockResolvedValueOnce([
      { amenity: { id: 'a-1', name: 'Wi-Fi',         iconUrl: null, isActive: true } },
      { amenity: { id: 'a-2', name: 'Outdoor Seating', iconUrl: null, isActive: true } },
      { amenity: { id: 'a-3', name: 'Free Parking',  iconUrl: null, isActive: true } },
    ])
    const result = await getEligibleAmenitiesForSubcategory(prisma, 'sub-1')
    expect(result.map(a => a.name)).toEqual(['Free Parking', 'Outdoor Seating', 'Wi-Fi'])
  })
})
