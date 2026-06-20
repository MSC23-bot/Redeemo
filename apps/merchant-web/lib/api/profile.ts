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
  })
  .passthrough()

export type MerchantProfile = z.infer<typeof merchantProfileSchema>

export async function getMerchantProfile(): Promise<MerchantProfile> {
  return merchantProfileSchema.parse(
    await apiFetch('/api/v1/merchant/profile', { method: 'GET', auth: true }),
  )
}
