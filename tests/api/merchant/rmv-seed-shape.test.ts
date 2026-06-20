import { describe, it, expect, vi } from 'vitest'
import { seedRmvTemplates } from '../../../prisma/seed-data/referencePhases'
import { TOP_LEVEL_CATEGORIES } from '../../../prisma/seed-data/categories'

/**
 * M2 B3 (Decision D): the RMV seed reframe to per-(category, eligible flagship
 * type) templates for ALL 11 top-level categories.
 *
 * This is a NON-integration unit test: it runs the exported seed function against
 * a prisma MOCK (no real DB) and asserts the shape of the templates it would write.
 * The seed derives the 11 top-level categories from the DB (category.findMany,
 * parentId null); the mock returns them. Every category must yield >= 2 active
 * eligible-type templates (the onboarding checklist needs 2 flagships); the reframe
 * authors all 6 eligible types per category.
 */

const ELIGIBLE_TYPES = [
  'BOGO', 'SPEND_AND_SAVE', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'FREEBIE', 'PACKAGE_DEAL',
]
const INELIGIBLE_TYPES = ['TIME_LIMITED', 'REUSABLE']

function buildPrismaMock() {
  // Stable synthetic ids for the 11 top-level categories.
  const topLevels = TOP_LEVEL_CATEGORIES.map((c, i) => ({ id: `cat-${i}`, name: c.name, parentId: null }))
  const upserts: Array<{ categoryId: string; title: string; create?: any }> = []

  const prisma: any = {
    category: {
      // The reframe derives all 11 categories from the DB (parentId null).
      findMany: vi.fn().mockResolvedValue(topLevels),
    },
    rmvTemplate: {
      upsert: vi.fn().mockImplementation(async (arg: any) => {
        const categoryId = arg?.where?.categoryId_title?.categoryId
        const title = arg?.where?.categoryId_title?.title
        upserts.push({ categoryId, title, create: arg?.create })
        return { id: `tmpl-${upserts.length}`, ...arg.create }
      }),
    },
  }
  return { prisma, topLevels, upserts }
}

describe('RMV seed reframe: per-(category, eligible-type) flagship templates (M2 B3)', () => {
  it('writes templates for ALL 11 top-level categories', async () => {
    const { prisma, topLevels, upserts } = buildPrismaMock()
    // Signature preserved (the two args are ignored internally; all categories
    // are derived from the DB).
    await seedRmvTemplates(prisma, 'ignored-food', 'ignored-beauty')

    const categoriesWritten = new Set(upserts.map((u) => u.categoryId))
    expect(categoriesWritten.size).toBe(11)
    for (const c of topLevels) {
      expect(categoriesWritten.has(c.id), `category ${c.name} must have templates`).toBe(true)
    }
  })

  it('every category yields >= 2 active eligible-type templates (ideally all 6)', async () => {
    const { prisma, topLevels, upserts } = buildPrismaMock()
    await seedRmvTemplates(prisma, 'ignored-food', 'ignored-beauty')

    for (const c of topLevels) {
      const forCat = upserts.filter((u) => u.categoryId === c.id)
      const types = forCat.map((u) => u.create.voucherType)
      // All authored types must be eligible; ineligible types must never appear.
      for (const t of types) expect(ELIGIBLE_TYPES).toContain(t)
      for (const t of INELIGIBLE_TYPES) expect(types).not.toContain(t)
      // Active.
      for (const u of forCat) expect(u.create.isActive).toBe(true)
      // At least 2 (the onboarding checklist needs two flagships); reframe = all 6.
      expect(forCat.length, `category ${c.name} must yield >= 2 templates`).toBeGreaterThanOrEqual(2)
      expect(forCat.length, `category ${c.name} should yield all 6 eligible types`).toBe(6)
      // Distinct types per category (no duplicate enum per category).
      expect(new Set(types).size).toBe(types.length)
    }
  })

  it('every template carries an advisory floor (positive minimumSaving) and no expiryDate in allowedFields', async () => {
    const { prisma, upserts } = buildPrismaMock()
    await seedRmvTemplates(prisma, 'ignored-food', 'ignored-beauty')

    expect(upserts.length).toBe(11 * 6)
    for (const u of upserts) {
      expect(Number(u.create.minimumSaving)).toBeGreaterThan(0)
      const allowed: string[] = u.create.allowedFields
      expect(Array.isArray(allowed)).toBe(true)
      // D2 / extraction CC-13: flagship RMVs do NOT expose a merchant-entered expiry.
      expect(allowed).not.toContain('expiryDate')
      // Title is non-empty (the @@unique([categoryId, title]) key).
      expect(typeof u.create.title).toBe('string')
      expect(u.create.title.length).toBeGreaterThan(0)
    }
  })

  it('titles are distinct per category (the @@unique([categoryId, title]) holds)', async () => {
    const { prisma, topLevels, upserts } = buildPrismaMock()
    await seedRmvTemplates(prisma, 'ignored-food', 'ignored-beauty')

    for (const c of topLevels) {
      const titles = upserts.filter((u) => u.categoryId === c.id).map((u) => u.title)
      expect(new Set(titles).size, `titles must be distinct within category ${c.name}`).toBe(titles.length)
    }
  })
})
