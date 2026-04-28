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
