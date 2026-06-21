// M2 F2 (D5): the PURE selection logic for the category/identity onboarding step.
// All of the cuisine-applies / save-gate / descriptor / identity-body derivation is
// driven from the BACKEND taxonomy (lib/api/taxonomy.ts), NOT from any hardcoded
// prototype list. The component is a thin shell over these functions.
//
// Key backend-derived rules (see src/api/merchant/onboarding/service.ts
// getOnboardingTaxonomy + src/api/merchant/profile/service.ts setMerchantIdentityCore):
//   - cuisine applies to a subcategory iff it has at least one CUISINE-type tag link.
//   - the identity POST body is { subcategoryId, primaryDescriptorTagId?, specialtyTagIds? }.
//   - the descriptor tag (primaryDescriptorTagId) must be a CUISINE tag that is
//     isPrimaryEligible; the rest of the selected cuisines + every selected specialty
//     ride in the MerchantTag set (specialtyTagIds).

import type { TaxonomySubcategory, TaxonomyTag } from '@/lib/api/taxonomy'

/** The CUISINE-type tags linked to a subcategory (the "Choose your cuisine" options). */
export function cuisineTags(subcategory: TaxonomySubcategory): TaxonomyTag[] {
  return subcategory.tags.filter((t) => t.type === 'CUISINE')
}

/** The SPECIALTY-type tags linked to a subcategory (the "What you are known for" options). */
export function specialtyTags(subcategory: TaxonomySubcategory): TaxonomyTag[] {
  return subcategory.tags.filter((t) => t.type === 'SPECIALTY')
}

/**
 * Cuisine applies (the "Choose your cuisine" step shows + min-1 is required) iff the
 * chosen subcategory carries at least one CUISINE-type tag. Derived from the backend
 * taxonomy, NOT the prototype's hardcoded CUISINE_SUBS list.
 */
export function cuisineApplies(subcategory: TaxonomySubcategory | null): boolean {
  if (!subcategory) return false
  return subcategory.tags.some((t) => t.type === 'CUISINE')
}

/**
 * The save gate: a primary category AND a subcategory AND (when cuisine applies)
 * at least one cuisine selected. Specialties are always optional.
 */
export function canSave(args: {
  categoryId: string | null
  subcategory: TaxonomySubcategory | null
  selectedCuisineIds: string[]
}): boolean {
  const { categoryId, subcategory, selectedCuisineIds } = args
  if (!categoryId || !subcategory) return false
  if (cuisineApplies(subcategory) && selectedCuisineIds.length < 1) return false
  return true
}

/**
 * The live descriptor: "[cuisineLabels.join(' '), subcategoryLabel].filter(Boolean).join(' ')".
 * When cuisine applies and at least one is picked, the cuisine labels precede the
 * subcategory label (e.g. "Modern British Restaurant"); otherwise just the subcategory
 * label (e.g. "Barber"). Returns '' when nothing is chosen yet.
 */
export function composeDescriptor(args: {
  subcategory: TaxonomySubcategory | null
  selectedCuisineIds: string[]
}): string {
  const { subcategory, selectedCuisineIds } = args
  if (!subcategory) return ''
  const parts: string[] = []
  if (cuisineApplies(subcategory) && selectedCuisineIds.length > 0) {
    const byId = new Map(cuisineTags(subcategory).map((t) => [t.id, t.label]))
    const labels = selectedCuisineIds.map((id) => byId.get(id)).filter((l): l is string => !!l)
    if (labels.length > 0) parts.push(labels.join(' '))
  }
  parts.push(subcategory.name)
  return parts.filter(Boolean).join(' ')
}

/**
 * Build the EXACT identity POST body the backend expects:
 *   { subcategoryId, primaryDescriptorTagId, specialtyTagIds }
 *
 * - subcategoryId: the chosen subcategory id.
 * - primaryDescriptorTagId: the FIRST selected cuisine that is isPrimaryEligible
 *   (the backend rejects a non-primary-eligible descriptor with TAG_NOT_ELIGIBLE).
 *   null when cuisine does not apply or no eligible cuisine is selected.
 * - specialtyTagIds: the MerchantTag set = every selected specialty PLUS any selected
 *   cuisines that are NOT the chosen descriptor (so multi-cuisine selections are not
 *   lost). De-duplicated; the descriptor tag is never also in the specialty set.
 */
export function buildIdentityBody(args: {
  subcategory: TaxonomySubcategory
  selectedCuisineIds: string[]
  selectedSpecialtyIds: string[]
}): { subcategoryId: string; primaryDescriptorTagId: string | null; specialtyTagIds: string[] } {
  const { subcategory, selectedCuisineIds, selectedSpecialtyIds } = args

  let primaryDescriptorTagId: string | null = null
  if (cuisineApplies(subcategory)) {
    const eligible = new Set(
      cuisineTags(subcategory)
        .filter((t) => t.isPrimaryEligible)
        .map((t) => t.id),
    )
    primaryDescriptorTagId = selectedCuisineIds.find((id) => eligible.has(id)) ?? null
  }

  const extraCuisineIds = selectedCuisineIds.filter((id) => id !== primaryDescriptorTagId)
  const specialtyTagIds = Array.from(new Set([...selectedSpecialtyIds, ...extraCuisineIds]))

  return { subcategoryId: subcategory.id, primaryDescriptorTagId, specialtyTagIds }
}
