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
    // hidden Insights nav, no create-voucher/PIN quick actions, and the
    // least-privilege baseline nav until the role is positively known).
    viewerCapabilities: z
      .object({
        canViewInsights: z.boolean(),
        canManageVouchers: z.boolean().nullish(),
        role: z.string().nullish(),
        displayName: z.string().nullish(),
      })
      .nullish(),
    // Business Profile M1: two ADDITIVE read-only blocks for the day-2 Business
    // Profile page. `ownerContact` is the merchant's OWNER's personal contact
    // (shown to every active member, not just the owner - the backend resolves
    // this by merchantId, not the viewer's own membership). `agreement` mirrors
    // the signed MerchantContract, or null when the merchant has not signed yet.
    // Both nullish so an older backend / a merchant with no resolvable owner /
    // an unsigned merchant all parse cleanly.
    ownerContact: z
      .object({
        firstName: z.string().nullish(),
        lastName: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
        phoneCountryCode: z.string().nullish(),
        jobTitle: z.string().nullish(),
      })
      .nullish(),
    agreement: z
      .object({
        acceptedVersion: z.string().nullish(),
        acceptedAt: z.string().nullish(),
        signatureMethod: z.string().nullish(),
      })
      .nullish(),
    // Business Profile M2: the merchant row's PENDING identity edit requests (mirrors
    // src/api/merchant/profile/service.ts getMerchantProfile, which already
    // `include`s pendingEdits where status PENDING, take 1 - the field is already on
    // the wire, M1 simply had no reader for it yet). The M2 read shell surfaces this as
    // a calm "awaiting review" banner only - no withdraw control (that is the
    // Branches-style edit lane, which ships alongside Business Profile M3/M4 editing).
    // Loosely typed + .passthrough() per row so a future backend field addition never
    // breaks parsing; the array itself is optional so an older backend that has not
    // deployed this include still parses cleanly.
    pendingEdits: z
      .array(
        z
          .object({
            id: z.string(),
            status: z.string(), // PendingEditStatus enum value
            createdAt: z.string(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

export type MerchantProfile = z.infer<typeof merchantProfileSchema>
export type MerchantPendingEdit = NonNullable<MerchantProfile['pendingEdits']>[number]

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
