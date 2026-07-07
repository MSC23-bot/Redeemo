import { z } from 'zod'
import { apiFetch } from './client'

// Business Profile M4 / fidelity polish: the SENSITIVE_FIELDS proposed-changes bag
// a MerchantPendingEdit row carries (businessName, tradingName, description,
// logoUrl, bannerUrl). Hoisted above merchantProfileSchema (and exported) so the
// read-shell's `pendingEdits` rows (which merchantProfileSchema types) and the
// full edit-request lane's `merchantPendingEditSchema` (below) share ONE typed
// shape instead of the read-shell falling back to an untyped passthrough bag.
export const merchantProposedChangesSchema = z
  .object({
    // businessName never clears to null (the backend always keeps a value here),
    // so it stays a plain optional string.
    businessName: z.string().optional(),
    // tradingName / description / logoUrl / bannerUrl map to NULLABLE Merchant
    // columns and can be cleared to null through the reviewed lane (the M4
    // PublicIdentityEditModal's `changedBody()` sends `tradingName: null` on
    // clear - see PublicIdentityEditModal.tsx). `.optional()` alone rejects
    // `null` (it only tolerates `undefined`), so a legitimate null-clear
    // response from createMerchantEditRequest/listMerchantEditRequests/
    // withdrawMerchantEditRequest previously threw on `.parse()` even though
    // the backend write succeeded (Codex nullable-clear finding). `.nullable()`
    // added so the round trip survives a null value.
    tradingName: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    bannerUrl: z.string().nullable().optional(),
  })
  .passthrough()

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
    // deployed this include still parses cleanly. `proposedChanges` typed via the
    // shared merchantProposedChangesSchema (fidelity polish) so the read-shell
    // banner can diff it against the live profile instead of only knowing id/status/
    // createdAt; `.optional()` so a payload without it (older backend) still parses.
    pendingEdits: z
      .array(
        z
          .object({
            id: z.string(),
            status: z.string(), // PendingEditStatus enum value
            createdAt: z.string(),
            proposedChanges: merchantProposedChangesSchema.optional(),
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

// --- Public identity edit-request (sensitive-field governed lane) ----------
// Business Profile M4: mirrors the Branches PendingEdit lane (lib/api/branch.ts)
// exactly - same PendingEditStatus enum, same passthrough-per-row shape. The
// backend model is `MerchantPendingEdit` (prisma/schema.prisma): a single-row-
// per-merchant governed edit awaiting admin review (createMerchantEditRequestCore
// enforces ONE PENDING row per merchant -> 409 PENDING_EDIT_EXISTS on a second
// attempt). `proposedChanges` is a partial bag of the SENSITIVE_FIELDS
// (businessName, tradingName, logoUrl, bannerUrl, description); .passthrough() so
// a future server key never breaks the parse.
export const merchantPendingEditStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'])

// merchantProposedChangesSchema is defined above (hoisted next to the imports) so
// merchantProfileSchema's `pendingEdits` rows can share the same typed shape.

export const merchantPendingEditSchema = z
  .object({
    id: z.string(),
    merchantId: z.string(),
    proposedChanges: merchantProposedChangesSchema,
    status: merchantPendingEditStatusSchema,
    reviewedBy: z.string().nullish(),
    reviewNote: z.string().nullish(),
    createdAt: z.string(),
    reviewedAt: z.string().nullish(),
  })
  .passthrough()

export type MerchantPendingEditFull = z.infer<typeof merchantPendingEditSchema>

// The reviewed-lane submit body: ONLY the SENSITIVE subset, exactly the fields
// `createMerchantEditRequestCore` allow-lists (SENSITIVE_FIELDS in
// src/api/merchant/profile/service.ts). Callers send just the CHANGED keys.
export interface MerchantEditRequestBody {
  businessName?: string
  tradingName?: string | null
  description?: string
  logoUrl?: string
  bannerUrl?: string
}

// POST /api/v1/merchant/profile/edit-request -> MerchantPendingEdit. 400
// NO_SENSITIVE_FIELDS when the body carries none of the sensitive keys; 409
// PENDING_EDIT_EXISTS when one is already in review.
export async function createMerchantEditRequest(
  changes: MerchantEditRequestBody,
): Promise<MerchantPendingEditFull> {
  const pendingEdit = await apiFetch('/api/v1/merchant/profile/edit-request', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(changes),
  })
  return merchantPendingEditSchema.parse(pendingEdit)
}

// GET /api/v1/merchant/profile/edit-requests -> ALL statuses; callers filter
// status === 'PENDING' when they need the in-review subset.
export async function listMerchantEditRequests(): Promise<MerchantPendingEditFull[]> {
  const list = await apiFetch('/api/v1/merchant/profile/edit-requests', { method: 'GET', auth: true })
  return z.array(merchantPendingEditSchema).parse(list)
}

// DELETE /api/v1/merchant/profile/edit-requests/:id -> withdraws (status
// WITHDRAWN). 404 PENDING_EDIT_NOT_FOUND when it is not PENDING / not found.
export async function withdrawMerchantEditRequest(editId: string): Promise<MerchantPendingEditFull> {
  const result = await apiFetch(`/api/v1/merchant/profile/edit-requests/${editId}`, {
    method: 'DELETE',
    auth: true,
  })
  return merchantPendingEditSchema.parse(result)
}

// M2 F3 (D4): the Tier-1 business-profile PATCH body. The backend
// `updateMerchantProfile` (PATCH /api/v1/merchant/profile) accepts the SENSITIVE set
// (businessName, tradingName, logoUrl, bannerUrl, description) directly in the draft
// window (B1) and the simple-direct set (websiteUrl, vatNumber, companyNumber)
// always. Every field is optional so a partial save ("Save and finish later") sends
// only the filled keys. Nulls clear a value (e.g. VAT switched to No clears
// vatNumber).
//
// Business Profile M3: `primaryCategoryId` + `confirm` extend the same body for the
// day-2 category-change path. The backend routes a `primaryCategoryId` key through
// `setMerchantCategoryCore` (src/api/merchant/profile/service.ts), which delegates an
// actual CHANGE (merchant already has a category) to `handleCategoryChange`
// (src/api/merchant/voucher/service.ts): it throws `CATEGORY_CHANGE_BLOCKED` once any
// RMV has been submitted/activated, otherwise returns a `{ requiresConfirmation,
// message }` preview UNLESS `confirm: true` rides in the same body, in which case it
// applies the change (discarding DRAFT RMVs) and returns the refreshed profile like
// every other field. This is the SUBCATEGORY-only day-2 path (mirrors the merchant's
// already-set `primaryCategoryId`); it does not touch `primaryDescriptorTagId` or the
// specialty tag set (that full identity write is `setMerchantIdentityCore`, which is
// onboarding-draft-window-only and unreachable here).
export interface MerchantProfileUpdateBody {
  businessName?: string
  tradingName?: string | null
  logoUrl?: string
  bannerUrl?: string
  description?: string
  websiteUrl?: string | null
  vatNumber?: string | null
  companyNumber?: string | null
  primaryCategoryId?: string
  confirm?: boolean
}

// Business Profile M3: the ONE non-profile shape the PATCH endpoint can return - the
// category-change confirmation preview (no `confirm: true` yet, and there IS an
// existing different category to move away from). `.passthrough()` so a future
// backend field addition never breaks parsing.
const categoryChangeConfirmationSchema = z
  .object({
    requiresConfirmation: z.literal(true),
    message: z.string(),
  })
  .passthrough()

export type CategoryChangeConfirmation = z.infer<typeof categoryChangeConfirmationSchema>
export type MerchantProfileUpdateResult = MerchantProfile | CategoryChangeConfirmation

// Both MerchantProfile and CategoryChangeConfirmation are `.passthrough()` zod
// schemas, so their inferred types carry a `[k: string]: unknown` index signature.
// A plain `'requiresConfirmation' in result` check therefore does not narrow the
// union for TypeScript (the passthrough index signature on the OTHER member also
// "has" that key, typed `unknown`) - callers should use this type-predicate helper
// instead so `result.message` etc. resolve to their real types after the check.
export function isCategoryChangeConfirmation(
  result: MerchantProfileUpdateResult,
): result is CategoryChangeConfirmation {
  return (result as { requiresConfirmation?: unknown }).requiresConfirmation === true
}

export async function updateMerchantProfile(
  body: MerchantProfileUpdateBody,
): Promise<MerchantProfileUpdateResult> {
  const raw = await apiFetch('/api/v1/merchant/profile', {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify(body),
  })
  // Try the confirmation-preview shape first: `requiresConfirmation` is not a field
  // on MerchantProfile, so a strict-enough check here never misparses a real profile
  // (a profile response never carries `requiresConfirmation: true`).
  const confirmation = categoryChangeConfirmationSchema.safeParse(raw)
  if (confirmation.success) return confirmation.data
  return merchantProfileSchema.parse(raw)
}
