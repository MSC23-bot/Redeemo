import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Taxonomy seed integrity', () => {
  it('seeds 11 top-level categories', async () => {
    const count = await prisma.category.count({ where: { parentId: null } })
    expect(count).toBe(11)
  })

  it('seeds exactly the expected top-level names in display order', async () => {
    const cats = await prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      select: { name: true, sortOrder: true },
    })
    expect(cats.map((c) => c.name)).toEqual([
      'Food & Drink',
      'Beauty & Wellness',
      'Health & Fitness',
      'Out & About',
      'Shopping',
      'Home & Local Services',
      'Travel & Hotels',
      'Health & Medical',
      'Family & Kids',
      'Auto & Garage',
      'Pet Services',
    ])
  })

  it('seeds 89 subcategories across all top-levels', async () => {
    const count = await prisma.category.count({ where: { parentId: { not: null } } })
    expect(count).toBe(89)
  })

  it('seeds 32 cuisine tags, all descriptor-eligible', async () => {
    const cuisines = await prisma.tag.findMany({ where: { type: 'CUISINE' } })
    expect(cuisines.length).toBe(32)
    expect(cuisines.every((t) => t.descriptorEligible)).toBe(true)
  })

  it('seeds 18 highlight tags, none descriptor-eligible', async () => {
    const highlights = await prisma.tag.findMany({ where: { type: 'HIGHLIGHT' } })
    expect(highlights.length).toBe(18)
    expect(highlights.every((t) => !t.descriptorEligible)).toBe(true)
  })

  it('Group-Friendly is a Detail tag, not a Highlight', async () => {
    const groupFriendly = await prisma.tag.findFirst({ where: { label: 'Group-Friendly' } })
    expect(groupFriendly?.type).toBe('DETAIL')
  })

  it('seeds RedundantHighlight rule for Vet → Pet-Friendly', async () => {
    const vet = await prisma.category.findFirst({ where: { name: 'Vet' } })
    const petFriendly = await prisma.tag.findFirst({
      where: { label: 'Pet-Friendly', type: 'HIGHLIGHT' },
    })
    const rule = await prisma.redundantHighlight.findUnique({
      where: {
        subcategoryId_highlightTagId: {
          subcategoryId: vet!.id,
          highlightTagId: petFriendly!.id,
        },
      },
    })
    expect(rule).not.toBeNull()
  })

  it('seeds Cuisine tags with SubcategoryTag links to Restaurant subcategory', async () => {
    const restaurant = await prisma.category.findFirst({ where: { name: 'Restaurant' } })
    const links = await prisma.subcategoryTag.findMany({
      where: { subcategoryId: restaurant!.id, tag: { type: 'CUISINE' } },
    })
    expect(links.length).toBe(32)
    expect(links.every((l) => l.isPrimaryEligible)).toBe(true)
  })

  it('seeds 18 redundant-highlight rows total (16 single-link + 2 from Aesthetics Clinic cross-listing)', async () => {
    const count = await prisma.redundantHighlight.count()
    expect(count).toBe(18)
  })

  it('Aesthetics Clinic appears under both Beauty & Wellness and Health & Medical (cross-listing)', async () => {
    const rows = await prisma.category.findMany({
      where: { name: 'Aesthetics Clinic' },
      select: { id: true, parentId: true, parent: { select: { name: true } } },
      orderBy: { parent: { name: 'asc' } },
    })
    expect(rows.length).toBe(2)
    expect(rows.map((r) => r.parent?.name).sort()).toEqual([
      'Beauty & Wellness',
      'Health & Medical',
    ])
    // Distinct ids — confirms compound (name, parentId) unique works
    expect(rows[0].id).not.toBe(rows[1].id)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Plan 1.5 — Category.intentType: 8 LOCAL + 2 MIXED + 1 DESTINATION on
// top-levels; subcategories left NULL so resolveCategoryIntent inherits from
// the parent at runtime (single source of truth lives on the top-level).
// ─────────────────────────────────────────────────────────────────────────────

describe('Category.intentType — locked classification', () => {
  it('all 11 top-level categories have non-NULL intentType', async () => {
    const tops = await prisma.category.findMany({
      where:  { parentId: null },
      select: { name: true, intentType: true },
    })
    expect(tops).toHaveLength(11)
    for (const t of tops) {
      expect(t.intentType).not.toBeNull()
    }
  })

  it('all 89 subcategories have NULL intentType (inherited from parent at runtime)', async () => {
    const subs = await prisma.category.findMany({
      where:  { parentId: { not: null } },
      select: { name: true, intentType: true },
    })
    expect(subs).toHaveLength(89)
    for (const s of subs) {
      expect(s.intentType).toBeNull()
    }
  })

  it('Travel & Hotels is DESTINATION; Out & About + Shopping are MIXED; rest are LOCAL', async () => {
    const byName = Object.fromEntries(
      (await prisma.category.findMany({
        where:  { parentId: null },
        select: { name: true, intentType: true },
      })).map((c) => [c.name, c.intentType]),
    )
    expect(byName['Travel & Hotels']).toBe('DESTINATION')
    expect(byName['Out & About']).toBe('MIXED')
    expect(byName['Shopping']).toBe('MIXED')
    for (const local of [
      'Food & Drink', 'Beauty & Wellness', 'Health & Fitness',
      'Home & Local Services', 'Health & Medical', 'Family & Kids',
      'Auto & Garage', 'Pet Services',
    ]) {
      expect(byName[local]).toBe('LOCAL')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Plan 1.5 — CategoryAmenity eligibility seed. 17 amenities × eligibility
// rules per category. Top-level rules apply to every subcategory of that
// top-level via inheritance (resolved by getEligibleAmenitiesForSubcategory).
// Subcategory-specific rules attach directly to the subcategory.
// ─────────────────────────────────────────────────────────────────────────────

describe('CategoryAmenity — eligibility seed', () => {
  it('seeds exactly 48 CategoryAmenity rules', async () => {
    const count = await prisma.categoryAmenity.count()
    expect(count).toBe(48)
  })

  it("Wi-Fi is seeded at the Food & Drink top-level (inherited by every Food & Drink subcategory)", async () => {
    const top = await prisma.category.findFirst({
      where:  { name: 'Food & Drink', parentId: null },
      select: { id: true },
    })
    if (!top) throw new Error('Food & Drink top-level not seeded')
    const wifi = await prisma.amenity.findFirst({ where: { name: 'Wi-Fi' }, select: { id: true } })
    if (!wifi) throw new Error('Wi-Fi amenity not seeded')

    const rule = await prisma.categoryAmenity.findFirst({
      where: { categoryId: top.id, amenityId: wifi.id },
    })
    expect(rule).not.toBeNull()
  })

  it('Room Service is seeded at the Hotel subcategory directly (NOT at Travel & Hotels top-level)', async () => {
    const hotelSub = await prisma.category.findFirst({
      where:  { name: 'Hotel', parentId: { not: null } },
      select: { id: true },
    })
    if (!hotelSub) throw new Error('Hotel subcategory not seeded')
    const roomService = await prisma.amenity.findFirst({
      where:  { name: 'Room Service' },
      select: { id: true },
    })
    if (!roomService) throw new Error('Room Service amenity not seeded')

    const subRule = await prisma.categoryAmenity.findFirst({
      where: { categoryId: hotelSub.id, amenityId: roomService.id },
    })
    expect(subRule).not.toBeNull()

    // And NOT at the parent top-level — Room Service is hotel-specific, not
    // applicable to other Travel & Hotels subcategories like Travel Agency.
    const travelTop = await prisma.category.findFirst({
      where:  { name: 'Travel & Hotels', parentId: null },
      select: { id: true },
    })
    if (!travelTop) throw new Error('Travel & Hotels top-level not seeded')
    const topRule = await prisma.categoryAmenity.findFirst({
      where: { categoryId: travelTop.id, amenityId: roomService.id },
    })
    expect(topRule).toBeNull()
  })

  it('Late-Night Service is seeded at the Bar AND Pub & Gastropub subcategories (not at Food & Drink top-level)', async () => {
    const lateNight = await prisma.amenity.findFirst({
      where:  { name: 'Late-Night Service' },
      select: { id: true },
    })
    if (!lateNight) throw new Error('Late-Night Service amenity not seeded')
    const bar = await prisma.category.findFirst({
      where:  { name: 'Bar', parentId: { not: null } },
      select: { id: true },
    })
    const pub = await prisma.category.findFirst({
      where:  { name: 'Pub & Gastropub', parentId: { not: null } },
      select: { id: true },
    })
    const foodTop = await prisma.category.findFirst({
      where:  { name: 'Food & Drink', parentId: null },
      select: { id: true },
    })
    if (!bar || !pub || !foodTop) throw new Error('expected Bar, Pub & Gastropub, Food & Drink not seeded')

    expect(await prisma.categoryAmenity.findFirst({ where: { categoryId: bar.id,    amenityId: lateNight.id } })).not.toBeNull()
    expect(await prisma.categoryAmenity.findFirst({ where: { categoryId: pub.id,    amenityId: lateNight.id } })).not.toBeNull()
    // NOT inherited from the top-level — explicitly subcategory-scoped.
    expect(await prisma.categoryAmenity.findFirst({ where: { categoryId: foodTop.id, amenityId: lateNight.id } })).toBeNull()
  })

  it('Wheelchair Access + Online Booking are seeded at every top-level (universal amenities)', async () => {
    const tops = await prisma.category.findMany({
      where:  { parentId: null },
      select: { id: true, name: true },
    })
    expect(tops).toHaveLength(11)
    for (const universalName of ['Wheelchair Access', 'Online Booking']) {
      const amenity = await prisma.amenity.findFirst({
        where:  { name: universalName },
        select: { id: true },
      })
      if (!amenity) throw new Error(`${universalName} amenity not seeded`)
      const ruleCount = await prisma.categoryAmenity.count({
        where: {
          amenityId:  amenity.id,
          categoryId: { in: tops.map((t) => t.id) },
        },
      })
      expect(ruleCount).toBe(11)
    }
  })
})
