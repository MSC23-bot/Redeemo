import type { PrismaClient } from '../../../generated/prisma/client'

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
export async function recomputeCategoryCounts(prisma: PrismaClient): Promise<void> {
  const categories = await prisma.category.findMany({ select: { id: true } })

  for (const cat of categories) {
    // Count merchants per city for this category
    const merchants = await prisma.merchant.findMany({
      where: {
        OR: [
          { primaryCategoryId: cat.id },
          { categories: { some: { categoryId: cat.id } } },
        ],
        status: 'ACTIVE',
      },
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
export async function recomputeTagCounts(prisma: PrismaClient): Promise<void> {
  const tags = await prisma.tag.findMany({ select: { id: true } })

  for (const tag of tags) {
    // Tag is carried via either MerchantTag or MerchantHighlight or Merchant.primaryDescriptorTagId
    const merchants = await prisma.merchant.findMany({
      where: {
        OR: [
          { primaryDescriptorTagId: tag.id },
          { tags: { some: { tagId: tag.id } } },
          { highlights: { some: { highlightTagId: tag.id } } },
        ],
        status: 'ACTIVE',
      },
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
