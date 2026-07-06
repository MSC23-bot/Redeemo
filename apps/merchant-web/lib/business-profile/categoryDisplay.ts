import type { OnboardingTaxonomy } from '@/lib/api/taxonomy'

export interface CategoryDisplay {
  /** The top-level category name, e.g. "Food & Drink". */
  topLevelName: string
  /** The customer-facing descriptor, e.g. "Modern British Restaurant". */
  descriptor: string
}

// Business Profile M2: resolve the merchant's saved category identity (the
// subcategory id `primaryCategoryId` + optional descriptor cuisine tag id
// `primaryDescriptorTagId`) into the two-part display the read-only "Business
// category" card shows: "<top-level category name> · <descriptor>" (e.g.
// "Food & Drink · Modern British Restaurant"). Mirrors the SAME composition the
// onboarding CategoryIdentityForm's composeDescriptor uses (cuisine label + the
// subcategory name), so this read-only M2 display can never drift from what
// onboarding actually set. Returns null while the taxonomy has not loaded yet, or
// when the merchant has no saved category (a fresh/unusual row).
export function resolveCategoryDisplay(
  taxonomy: OnboardingTaxonomy | undefined,
  primaryCategoryId: string | null | undefined,
  primaryDescriptorTagId: string | null | undefined,
): CategoryDisplay | null {
  if (!taxonomy || !primaryCategoryId) return null

  for (const cat of taxonomy.categories) {
    const sub = cat.subcategories.find((s) => s.id === primaryCategoryId)
    if (!sub) continue

    const cuisineLabel = primaryDescriptorTagId
      ? sub.tags.find((t) => t.id === primaryDescriptorTagId && t.type === 'CUISINE')?.label
      : undefined

    const descriptor = [cuisineLabel, sub.name].filter(Boolean).join(' ') || sub.name
    return { topLevelName: cat.name, descriptor }
  }

  return null
}
