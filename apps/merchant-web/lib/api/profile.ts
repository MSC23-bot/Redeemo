import { z } from 'zod'
import { apiFetch } from './client'

// M1 Slice 5 lifecycle source. GET /api/v1/merchant/profile returns the raw Merchant
// row (no wrapper). We pick ONLY the fields the StatusPill + two-home routing need
// and .passthrough() the rest so a future backend `select` narrowing cannot break
// this client. Direct browser->backend authed read (Bearer access token).
export const merchantProfileSchema = z
  .object({
    id: z.string(),
    businessName: z.string(),
    status: z.string(), // MerchantStatus enum value
    onboardingStep: z.string(), // OnboardingStep enum value
    // M2 F1: the staircase hub derives category-done from primaryCategoryId and
    // profile-done from description. Both are nullable on a fresh merchant row;
    // .nullish() tolerates absent/null. The rest stays .passthrough()-ed.
    primaryCategoryId: z.string().nullish(),
    description: z.string().nullish(),
    // M2 F2: the category/identity step preselects the current descriptor cuisine on
    // an edit and uses primaryCategoryId (the SUBCATEGORY id) to gate the
    // change-category confirm. Both nullable on a fresh row.
    primaryDescriptorTagId: z.string().nullish(),
  })
  .passthrough()

export type MerchantProfile = z.infer<typeof merchantProfileSchema>

export async function getMerchantProfile(): Promise<MerchantProfile> {
  return merchantProfileSchema.parse(
    await apiFetch('/api/v1/merchant/profile', { method: 'GET', auth: true }),
  )
}
