import { z } from 'zod'
import { apiFetch } from './client'

// M2 F2 (D5): the onboarding taxonomy read + the merchant identity write that back
// the category/identity step. Direct browser->backend authed calls (Bearer access
// token), same pattern as lib/api/onboarding.ts.
//
// Backend contracts (read the real code, do not guess):
//   GET  /api/v1/merchant/onboarding/taxonomy
//        -> { categories: [{ id, name, parentId, eligible, subcategories: [
//             { id, name, parentId, tags: [{ id, label, type, isPrimaryEligible }] } ] }] }
//        (src/api/merchant/onboarding/service.ts getOnboardingTaxonomy)
//   POST /api/v1/merchant/onboarding/identity
//        body { subcategoryId, primaryDescriptorTagId?, specialtyTagIds? }
//        (src/api/merchant/onboarding/routes.ts + setMerchantIdentityCore)

// A tag link on a subcategory. `type` is the Prisma TagType (CUISINE / SPECIALTY /
// HIGHLIGHT / DETAIL). F2 surfaces CUISINE + SPECIALTY only. .passthrough() so a
// future backend field cannot break this client.
export const taxonomyTagSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    type: z.string(), // TagType enum value
    isPrimaryEligible: z.boolean(),
  })
  .passthrough()

export const taxonomySubcategorySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    parentId: z.string().nullable(),
    tags: z.array(taxonomyTagSchema),
  })
  .passthrough()

export const taxonomyCategorySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    parentId: z.string().nullable(),
    eligible: z.boolean(),
    subcategories: z.array(taxonomySubcategorySchema),
  })
  .passthrough()

export const onboardingTaxonomySchema = z
  .object({
    categories: z.array(taxonomyCategorySchema),
  })
  .passthrough()

export type TaxonomyTag = z.infer<typeof taxonomyTagSchema>
export type TaxonomySubcategory = z.infer<typeof taxonomySubcategorySchema>
export type TaxonomyCategory = z.infer<typeof taxonomyCategorySchema>
export type OnboardingTaxonomy = z.infer<typeof onboardingTaxonomySchema>

export async function getOnboardingTaxonomy(): Promise<OnboardingTaxonomy> {
  return onboardingTaxonomySchema.parse(
    await apiFetch('/api/v1/merchant/onboarding/taxonomy', { method: 'GET', auth: true }),
  )
}

// The exact identity write body the backend zod expects:
//   { subcategoryId, primaryDescriptorTagId?, specialtyTagIds? }
export interface MerchantIdentityBody {
  subcategoryId: string
  primaryDescriptorTagId: string | null
  specialtyTagIds: string[]
}

export async function setMerchantIdentity(body: MerchantIdentityBody): Promise<unknown> {
  return apiFetch('/api/v1/merchant/onboarding/identity', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(body),
  })
}
