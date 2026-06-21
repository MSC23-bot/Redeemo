// M2 F2 (D5): the PURE selection logic for the category/identity onboarding step.
// All of the cuisine-applies / save-gate / descriptor / identity-body derivation is
// driven from the BACKEND taxonomy (lib/api/taxonomy.ts), NOT from any hardcoded
// prototype list. The component is a thin shell over these functions.
//
// Key backend-derived rules (see src/api/merchant/onboarding/service.ts
// getOnboardingTaxonomy + src/api/merchant/profile/service.ts setMerchantIdentityCore):
//   - the identity POST body is { subcategoryId, primaryDescriptorTagId?, specialtyTagIds? }.
//   - the descriptor tag (primaryDescriptorTagId) must be a CUISINE tag that is
//     isPrimaryEligible; the backend rejects a non-eligible descriptor (TAG_NOT_ELIGIBLE).
//   - cuisine therefore APPLIES to a subcategory iff it has at least one CUISINE tag
//     that is isPrimaryEligible. A food subcategory whose CUISINE tags are ALL
//     isPrimaryEligible:false (per the real seed: Cafe & Coffee, Bakery, Dessert Shop,
//     Bar, Food Hall) does NOT get a cuisine step and is NOT forced to pick one, because
//     any picked cuisine could never persist as the descriptor (it would silently fold
//     into the MerchantTag set with a NULL descriptor, losing the previewed identity).
//   - the SELECTABLE cuisines are the eligible ones only, so the user can never select a
//     cuisine that would not persist as the descriptor.
//   - the rest of the selected cuisines + every selected specialty ride in the MerchantTag
//     set (specialtyTagIds).

import type { TaxonomySubcategory, TaxonomyTag } from '@/lib/api/taxonomy'

/** The CUISINE-type tags linked to a subcategory (eligible AND non-eligible). */
export function cuisineTags(subcategory: TaxonomySubcategory): TaxonomyTag[] {
  return subcategory.tags.filter((t) => t.type === 'CUISINE')
}

/**
 * The SELECTABLE cuisines (the "Choose your cuisine" options) = the isPrimaryEligible
 * CUISINE-type tags only. A non-eligible cuisine is never offered, so the user can never
 * pick a cuisine that the backend would refuse as the descriptor (TAG_NOT_ELIGIBLE) and
 * that would therefore be silently dropped from the stored identity.
 */
export function cuisineOptions(subcategory: TaxonomySubcategory): TaxonomyTag[] {
  return cuisineTags(subcategory).filter((t) => t.isPrimaryEligible)
}

/** The SPECIALTY-type tags linked to a subcategory (the "What you are known for" options). */
export function specialtyTags(subcategory: TaxonomySubcategory): TaxonomyTag[] {
  return subcategory.tags.filter((t) => t.type === 'SPECIALTY')
}

/**
 * Cuisine applies (the "Choose your cuisine" step shows + min-1 is required) iff the
 * chosen subcategory carries at least one isPrimaryEligible CUISINE tag, i.e. there is at
 * least one cuisine that could actually persist as the descriptor. A subcategory whose
 * CUISINE tags are ALL non-eligible is treated as cuisine-NOT-applicable (no cuisine step,
 * no forced pick, descriptor = subcategory name). Derived from the backend taxonomy, NOT
 * the prototype's hardcoded CUISINE_SUBS list.
 */
export function cuisineApplies(subcategory: TaxonomySubcategory | null): boolean {
  if (!subcategory) return false
  return cuisineOptions(subcategory).length > 0
}

/**
 * The primary descriptor cuisine id = the FIRST selected cuisine that is isPrimaryEligible.
 * This is the single source of truth shared by composeDescriptor (preview) and
 * buildIdentityBody (persist) so the previewed descriptor ALWAYS equals the stored one.
 * null when cuisine does not apply or no eligible cuisine is selected.
 */
function primaryDescriptorIdOf(subcategory: TaxonomySubcategory, selectedCuisineIds: string[]): string | null {
  const eligible = new Set(cuisineOptions(subcategory).map((t) => t.id))
  return selectedCuisineIds.find((id) => eligible.has(id)) ?? null
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
 * The live descriptor: "[primaryCuisineLabel, subcategoryLabel].filter(Boolean).join(' ')".
 * Previews ONLY the primary descriptor cuisine (the first selected isPrimaryEligible
 * cuisine, the one that becomes primaryDescriptorTagId), so the previewed descriptor
 * ALWAYS equals the stored descriptor. Any extra selected cuisines fold into
 * specialtyTagIds and are NOT shown in the descriptor. When cuisine does not apply (or no
 * eligible cuisine is selected yet) the descriptor is just the subcategory label (e.g.
 * "Barber", "Bar"). Returns '' when nothing is chosen yet.
 */
export function composeDescriptor(args: {
  subcategory: TaxonomySubcategory | null
  selectedCuisineIds: string[]
}): string {
  const { subcategory, selectedCuisineIds } = args
  if (!subcategory) return ''
  const parts: string[] = []
  const primaryId = primaryDescriptorIdOf(subcategory, selectedCuisineIds)
  if (primaryId) {
    const label = cuisineTags(subcategory).find((t) => t.id === primaryId)?.label
    if (label) parts.push(label)
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

  // Lockstep with composeDescriptor: the previewed cuisine IS the stored descriptor.
  const primaryDescriptorTagId = primaryDescriptorIdOf(subcategory, selectedCuisineIds)

  const extraCuisineIds = selectedCuisineIds.filter((id) => id !== primaryDescriptorTagId)
  const specialtyTagIds = Array.from(new Set([...selectedSpecialtyIds, ...extraCuisineIds]))

  return { subcategoryId: subcategory.id, primaryDescriptorTagId, specialtyTagIds }
}
