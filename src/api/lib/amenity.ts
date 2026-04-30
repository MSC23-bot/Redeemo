import type { PrismaClient } from '../../../generated/prisma/client'

export type EligibleAmenity = {
  id: string
  name: string
  iconUrl: string | null
  isActive: boolean
}

/**
 * Returns amenities eligible for a subcategory.
 * Eligibility = (CategoryAmenity rules at subcategoryId) ∪ (rules at subcategory's parent top-level).
 * Filtered to Amenity.isActive=true.
 * Returned ordered by Amenity.name ASC.
 *
 * Used by:
 *   - Plan 1.5: tests
 *   - Phase 4 (Merchant Portal): merchant onboarding endpoint
 *   - Plan 2 / Phase 5: filter helpers + admin UIs
 *
 * Not exposed via HTTP in Plan 1.5 — internal helper only.
 */
export async function getEligibleAmenitiesForSubcategory(
  prisma: PrismaClient,
  subcategoryId: string,
): Promise<EligibleAmenity[]> {
  const cat = await prisma.category.findUnique({
    where:  { id: subcategoryId },
    select: { id: true, parentId: true },
  })
  if (!cat) return []

  const ids = [cat.id, ...(cat.parentId ? [cat.parentId] : [])]

  const rows = await prisma.categoryAmenity.findMany({
    where: {
      categoryId: { in: ids },
      amenity:    { isActive: true },
    },
    select: {
      amenity: { select: { id: true, name: true, iconUrl: true, isActive: true } },
    },
  })

  // Dedupe by amenity.id (subcategory + parent rules can both reference the same amenity)
  const seen = new Set<string>()
  const dedup: EligibleAmenity[] = []
  for (const row of rows) {
    if (!seen.has(row.amenity.id)) {
      seen.add(row.amenity.id)
      dedup.push(row.amenity)
    }
  }

  return dedup.sort((a, b) => a.name.localeCompare(b.name))
}
