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
    // M2 F3 (D4, Tier-1 ONLY): the business-profile step prefills from these fields.
    // The sensitive set (businessName, tradingName, logoUrl, bannerUrl, description)
    // writes DIRECTLY in the draft window via B1; the simple-direct set (websiteUrl,
    // vatNumber, companyNumber) always writes direct. All are nullable on a fresh row
    // except businessName, which the backend Merchant row always carries.
    tradingName: z.string().nullish(),
    logoUrl: z.string().nullish(),
    bannerUrl: z.string().nullish(),
    websiteUrl: z.string().nullish(),
    vatNumber: z.string().nullish(),
    companyNumber: z.string().nullish(),
    // Shell wave: the viewer's OWN coarse capability set, derived server-side from
    // the membership (OWNER/BRANCH_MANAGER can view Insights; STAFF cannot;
    // canManageVouchers mirrors assertCanManageVouchers; role + displayName feed the
    // account-menu identity line and nav filtering). The whole object is OPTIONAL and
    // every added field tolerates absence so a backend that has not deployed a field
    // yet, or a loading state, still parses cleanly; consumers FAIL CLOSED (absent ->
    // hidden Insights nav, no create-voucher/PIN quick actions, role-neutral nav).
    viewerCapabilities: z
      .object({
        canViewInsights: z.boolean(),
        canManageVouchers: z.boolean().nullish(),
        role: z.string().nullish(),
        displayName: z.string().nullish(),
      })
      .nullish(),
  })
  .passthrough()

export type MerchantProfile = z.infer<typeof merchantProfileSchema>

export async function getMerchantProfile(): Promise<MerchantProfile> {
  return merchantProfileSchema.parse(
    await apiFetch('/api/v1/merchant/profile', { method: 'GET', auth: true }),
  )
}

// M2 F3 (D4): the Tier-1 business-profile PATCH body. The backend
// `updateMerchantProfile` (PATCH /api/v1/merchant/profile) accepts the SENSITIVE set
// (businessName, tradingName, logoUrl, bannerUrl, description) directly in the draft
// window (B1) and the simple-direct set (websiteUrl, vatNumber, companyNumber)
// always. Every field is optional so a partial save ("Save and finish later") sends
// only the filled keys. Nulls clear a value (e.g. VAT switched to No clears
// vatNumber).
export interface MerchantProfileUpdateBody {
  businessName?: string
  tradingName?: string | null
  logoUrl?: string
  bannerUrl?: string
  description?: string
  websiteUrl?: string | null
  vatNumber?: string | null
  companyNumber?: string | null
}

export async function updateMerchantProfile(
  body: MerchantProfileUpdateBody,
): Promise<MerchantProfile> {
  return merchantProfileSchema.parse(
    await apiFetch('/api/v1/merchant/profile', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(body),
    }),
  )
}
