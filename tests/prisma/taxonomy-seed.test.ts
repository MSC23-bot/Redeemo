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
