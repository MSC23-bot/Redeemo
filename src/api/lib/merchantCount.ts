import type { Prisma, PrismaClient } from '../../../generated/prisma/client'

export interface RecomputeOptions {
  /**
   * Exclude `isTestData=true` merchants from the counts.
   *
   * Default `false` — preserves the full-seed / dev behaviour (the seed counts
   * everything it just created). The standalone production-safe recompute runner
   * (`prisma/recompute-counts.ts`) passes `true` so the denormalized counts match
   * the customer-facing lists, which exclude test data everywhere (SEC-C3 / F5).
   */
  excludeTestData?: boolean
}

/**
 * Merchant filter for a category's count. Pure + exported so the `excludeTestData`
 * behaviour is unit-testable without a database. With the default options this
 * returns exactly the filter the seed has always used.
 */
export function categoryMerchantWhere(categoryId: string, opts: RecomputeOptions = {}): Prisma.MerchantWhereInput {
  return {
    OR: [
      { primaryCategoryId: categoryId },
      { categories: { some: { categoryId } } },
    ],
    status: 'ACTIVE',
    ...(opts.excludeTestData ? { isTestData: false } : {}),
  }
}

/** Merchant filter for a tag's count (primary descriptor / tag join / highlight join). Pure + exported. */
export function tagMerchantWhere(tagId: string, opts: RecomputeOptions = {}): Prisma.MerchantWhereInput {
  return {
    OR: [
      { primaryDescriptorTagId: tagId },
      { tags: { some: { tagId } } },
      { highlights: { some: { highlightTagId: tagId } } },
    ],
    status: 'ACTIVE',
    ...(opts.excludeTestData ? { isTestData: false } : {}),
  }
}

/**
 * Returns a city key for a merchant, derived from its main branch.
 * Branch.city is a non-null string set during merchant onboarding.
 */
function cityFor(branch: { city: string } | null): string | null {
  return branch?.city ?? null
}

/**
 * Recomputes Category.merchantCountByCity for all categories.
 * Called nightly; also invalidated on merchant create/suspend/category-change.
 *
 * Performance: this is intentionally a serial findMany per category. Acceptable
 * for nightly batch jobs, admin-triggered recomputes, and the seed phase. If
 * this ever becomes hot-path (e.g. on every merchant write), rewrite as a
 * single SQL aggregate keyed on Branch.city (GROUP BY) and a bulk update.
 */
export async function recomputeCategoryCounts(prisma: PrismaClient, opts: RecomputeOptions = {}): Promise<void> {
  const categories = await prisma.category.findMany({ select: { id: true } })

  for (const cat of categories) {
    // Count merchants per city for this category
    const merchants = await prisma.merchant.findMany({
      where: categoryMerchantWhere(cat.id, opts),
      include: {
        branches: { where: { isMainBranch: true }, select: { city: true } },
      },
    })

    const countByCity: Record<string, number> = {}
    for (const m of merchants) {
      const city = cityFor(m.branches[0] ?? null)
      if (!city) continue
      countByCity[city] = (countByCity[city] ?? 0) + 1
    }

    await prisma.category.update({
      where: { id: cat.id },
      data: { merchantCountByCity: countByCity },
    })
  }
}

/**
 * Recomputes Tag.merchantCountByCity for all tags.
 *
 * Performance: serial findMany per tag — acceptable for nightly/admin/seed
 * recompute (262 tags). If made hot-path, batch into one SQL aggregate keyed
 * on Branch.city and a bulk update (same shape as recomputeCategoryCounts).
 */
export async function recomputeTagCounts(prisma: PrismaClient, opts: RecomputeOptions = {}): Promise<void> {
  const tags = await prisma.tag.findMany({ select: { id: true } })

  for (const tag of tags) {
    // Tag is carried via either MerchantTag or MerchantHighlight or Merchant.primaryDescriptorTagId
    const merchants = await prisma.merchant.findMany({
      where: tagMerchantWhere(tag.id, opts),
      include: {
        branches: { where: { isMainBranch: true }, select: { city: true } },
      },
    })

    const countByCity: Record<string, number> = {}
    for (const m of merchants) {
      const city = cityFor(m.branches[0] ?? null)
      if (!city) continue
      countByCity[city] = (countByCity[city] ?? 0) + 1
    }

    await prisma.tag.update({
      where: { id: tag.id },
      data: { merchantCountByCity: countByCity },
    })
  }
}
