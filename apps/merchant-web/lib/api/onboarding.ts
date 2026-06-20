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
