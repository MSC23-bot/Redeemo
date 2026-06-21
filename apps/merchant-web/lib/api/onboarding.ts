import { z } from 'zod'
import { apiFetch } from './client'

// M2 F1 onboarding reads. These back the client-derived staircase hub + the
// changes-needed banner. Direct browser->backend authed reads (Bearer access
// token), same pattern as lib/api/profile.ts.

// GET /api/v1/merchant/onboarding/checklist -> the 4 submit gates. .passthrough()
// so a future backend field cannot break this client.
export const onboardingChecklistSchema = z
  .object({
    branch_created: z.boolean(),
    contract_signed: z.boolean(),
    rmv_configured: z.boolean(),
    all_complete: z.boolean(),
  })
  .passthrough()

export type OnboardingChecklist = z.infer<typeof onboardingChecklistSchema>

export async function getOnboardingChecklist(): Promise<OnboardingChecklist> {
  return onboardingChecklistSchema.parse(
    await apiFetch('/api/v1/merchant/onboarding/checklist', { method: 'GET', auth: true }),
  )
}

// GET /api/v1/merchant/onboarding/status -> { status, comment, actionedAt } (the
// admin's onboarding approval state + the changes-requested reason). All three are
// null when no approval row exists yet (the merchant has never submitted). The
// changes banner renders `comment` ONLY in the changes state (D8c).
export const onboardingStatusSchema = z
  .object({
    status: z.string().nullable(),
    comment: z.string().nullable(),
    actionedAt: z.string().nullable(),
  })
  .passthrough()

export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  return onboardingStatusSchema.parse(
    await apiFetch('/api/v1/merchant/onboarding/status', { method: 'GET', auth: true }),
  )
}

// GET /api/v1/merchant/vouchers/rmv -> the merchant's flagship RMV rows. We only
// need the status of each to count active (PENDING_APPROVAL/ACTIVE) flagships for
// the "1 of 2" partial; this MIRRORS the checklist's rmv_configured rule so the hub
// and the backend gate agree on which rows count.
const rmvRowSchema = z.object({ status: z.string() }).passthrough()

const RMV_ACTIVE_STATUSES = new Set(['PENDING_APPROVAL', 'ACTIVE'])

export async function countActiveRmvVouchers(): Promise<number> {
  const rows = z
    .array(rmvRowSchema)
    .parse(await apiFetch('/api/v1/merchant/vouchers/rmv', { method: 'GET', auth: true }))
  return rows.filter((r) => RMV_ACTIVE_STATUSES.has(r.status)).length
}

// POST /api/v1/merchant/onboarding/submit -> sends the business for review. The
// backend re-checks all gates and throws ONBOARDING_GATES_INCOMPLETE (handled
// defensively by the caller). No body.
export async function submitOnboarding(): Promise<unknown> {
  return apiFetch('/api/v1/merchant/onboarding/submit', { method: 'POST', auth: true })
}

// M2 F6: the merchant-agreement contract step.
//
// GET /api/v1/merchant/onboarding/contract -> { version, text }. The backend owns
// the canonical version (CONTRACT_VERSION) + the draft agreement text. The signer
// reads `text` in the full-agreement modal and signs against `version`.
// .passthrough() so a future backend field cannot break this client.
export const onboardingContractSchema = z
  .object({
    version: z.string(),
    text: z.string(),
  })
  .passthrough()

export type OnboardingContract = z.infer<typeof onboardingContractSchema>

export async function getContract(): Promise<OnboardingContract> {
  return onboardingContractSchema.parse(
    await apiFetch('/api/v1/merchant/onboarding/contract', { method: 'GET', auth: true }),
  )
}

// POST /api/v1/merchant/onboarding/contract/accept body { version } -> marks the
// merchant's contractStatus SIGNED (which flips the checklist contract_signed gate).
// This is the agreement STEP completion; it does NOT submit the business for review
// (the final submit is the F1 hub Submit). The typed signer name + date are UI/legal
// affordances captured on-screen; the backend only needs the accepted `version`.
// Defensively the backend may throw CONTRACT_ALREADY_SIGNED if it is re-accepted.
export async function acceptContract(version: string): Promise<unknown> {
  return apiFetch('/api/v1/merchant/onboarding/contract/accept', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ version }),
  })
}
