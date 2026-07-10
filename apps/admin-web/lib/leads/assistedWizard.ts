/**
 * Assisted onboarding wizard: step model + resume-derivation (C2).
 *
 * Design contract: docs/superpowers/specs/2026-07-10-admin-panel-module-specs/
 * leads-onboarding-spec.md (ASSISTED 9-STEP WIZARD) + plan Phase C/C2.
 *
 * RESUME CONTRACT (spec ambiguity #2, resolved by the plan): the wizard step is
 * NOT a stored `stepN` pointer (the prototype's `stepN` 1/2/4 + "/5" label is
 * broken). It is DERIVED from the draft merchant's REAL state: which steps'
 * data already exists. `deriveWizardState` maps a `MerchantDetail` payload to a
 * per-step completion status AND the step to resume on (the first incomplete
 * blocking step). The progress rail reads the same derivation, so the rail and
 * the resume landing can never disagree.
 *
 * Step order follows the prototype rail (spec STEP-ORDER CORRECTION):
 *   1 Category and identity · 2 Business profile · 3 Branches · 4 Vouchers ·
 *   5 Staff and access (optional) · 6 Documents (optional) · 7 Contract ·
 *   8 Go-live review · 9 Handover.
 *
 * Two steps NEVER block progress and are honestly gated, because no admin
 * on-behalf route exists for them:
 *   - Step 5 Staff: there is no admin invite-staff-on-behalf route; the step is
 *     informational + skippable.
 *   - Step 7 Contract (OD6): there is no admin contract-signing route; the owner
 *     signs via the claim/portal path. The step SHOWS the real gate status
 *     (submitChecklist.contract_signed) and is skippable.
 *
 * Every "blocking" completion is derived ONLY from real backend signals on the
 * merchant detail payload (category, branch count, the LIVE submitChecklist,
 * documentsCount, lifecycle status). No mutation here calls a merchant-scope
 * endpoint; the wizard reuses the shipped admin on-behalf routes.
 */
import type { MerchantDetail } from '@/lib/api/merchants'

// ── Step model ────────────────────────────────────────────────────────────────

export type WizardStepId =
  | 'category'
  | 'profile'
  | 'branches'
  | 'vouchers'
  | 'staff'
  | 'documents'
  | 'contract'
  | 'review'
  | 'handover'

/**
 * A step's derived status.
 *   - complete   : the step's real data exists (a green tick on the rail).
 *   - incomplete : a BLOCKING step whose data is missing (drives the resume
 *                  landing + the amber "attention" mark).
 *   - optional   : a non-blocking step with no data yet (never blocks go-live;
 *                  neutral "optional" mark).
 *   - gated      : no admin on-behalf route exists (staff / contract); shown as
 *                  honestly gated, never blocks progress.
 */
export type WizardStepStatus = 'complete' | 'incomplete' | 'optional' | 'gated'

export interface WizardStepDef {
  id: WizardStepId
  /** 1-based rail position. */
  num: number
  title: string
  sub: string
  /** Non-blocking (optional or gated) steps never gate the resume landing. */
  blocking: boolean
}

export const WIZARD_STEPS: readonly WizardStepDef[] = [
  { id: 'category', num: 1, title: 'Category and identity', sub: 'Set the trade and the legal identity', blocking: true },
  { id: 'profile', num: 2, title: 'Business profile', sub: 'Public web presence and description', blocking: false },
  { id: 'branches', num: 3, title: 'Branches', sub: 'At least the main branch, on behalf', blocking: true },
  { id: 'vouchers', num: 4, title: 'Vouchers', sub: 'Co-build the two flagship vouchers', blocking: true },
  { id: 'staff', num: 5, title: 'Staff and access', sub: 'Optional; owner is admin by default', blocking: false },
  { id: 'documents', num: 6, title: 'Documents', sub: 'Optional; verification uploads', blocking: false },
  { id: 'contract', num: 7, title: 'Contract', sub: 'Owner signs via the portal', blocking: false },
  { id: 'review', num: 8, title: 'Go-live review', sub: 'The real go-live gates + submit', blocking: true },
  { id: 'handover', num: 9, title: 'Handover', sub: 'Owner claims the account', blocking: false },
] as const

export const WIZARD_STEP_COUNT = WIZARD_STEPS.length

export function stepDefByNum(num: number): WizardStepDef {
  return WIZARD_STEPS.find((s) => s.num === num) ?? WIZARD_STEPS[0]
}

export function stepDefById(id: WizardStepId): WizardStepDef {
  return WIZARD_STEPS.find((s) => s.id === id) ?? WIZARD_STEPS[0]
}

/**
 * Clamp/resolve a raw `?step=` value to a valid 1..9 step number. An unknown,
 * missing, or out-of-range value falls back to `fallback` (the derived resume
 * step) so a hand-typed or stale URL never lands on a blank surface.
 */
export function resolveStepParam(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > WIZARD_STEP_COUNT) return fallback
  return n
}

// ── Derivation ──────────────────────────────────────────────────────────────

export interface WizardDerivation {
  /** Per-step derived status, keyed by step id. */
  statuses: Record<WizardStepId, WizardStepStatus>
  /** The step to resume on: the first incomplete BLOCKING step, else review/handover. */
  resumeStep: number
  /** Real signals surfaced to the step content (avoids re-deriving in each step). */
  facts: {
    categorySet: boolean
    descriptionSet: boolean
    websiteSet: boolean
    branchCount: number
    branchCreated: boolean
    rmvConfigured: boolean
    contractSigned: boolean
    documentsCount: number
    /** all three live submit gates pass (branch + contract + RMV). */
    allGatesComplete: boolean
    /** the backend submittable-state gate (REGISTERED first-submit / NEEDS_CHANGES resubmit). */
    canSubmitOnBehalf: boolean
    /** the merchant has been submitted at least once (past REGISTERED). */
    submitted: boolean
    /**
     * The review team bounced this application back for changes (verified
     * backend contract: status PENDING_APPROVAL AND onboardingStep
     * NEEDS_CHANGES; the same condition the merchant resubmit gate uses).
     * Distinct from `submitted` (which is already true here): a needsChanges
     * merchant is NOT sitting in the approval queue, it needs the operator to
     * fix the application and resubmit it.
     */
    needsChanges: boolean
    /** the merchant is live. */
    live: boolean
  }
}

/**
 * Derive the wizard's per-step status and resume step from a merchant detail
 * payload. Pure: no fetching, no mutation. This is the single source of truth
 * the rail and the resume landing both read.
 */
export function deriveWizardState(detail: MerchantDetail): WizardDerivation {
  const m = detail.merchant
  const branchCount = detail.branches.length
  const checklist = m.submitChecklist

  const categorySet = Boolean(m.primaryCategoryId ?? m.category)
  const descriptionSet = Boolean(m.description && m.description.trim() !== '')
  const websiteSet = Boolean(m.websiteUrl && m.websiteUrl.trim() !== '')
  const branchCreated = checklist.branch_created || branchCount >= 1
  const rmvConfigured = checklist.rmv_configured
  const contractSigned = checklist.contract_signed
  const documentsCount = m.documentsCount ?? 0
  const allGatesComplete = checklist.all_complete
  const canSubmitOnBehalf = m.canSubmitOnBehalf

  // "submitted" = the merchant has left the initial REGISTERED draft state at
  // least once (PENDING_APPROVAL / ACTIVE / INACTIVE / SUSPENDED). DELETED is
  // never treated as submitted. This is the honest proxy for "the go-live
  // review step has been actioned".
  const status = m.status
  const submitted = status !== 'REGISTERED' && status !== 'DELETED'
  const live = status === 'ACTIVE'
  // needsChanges: the exact verified backend contract for a bounced-with-
  // request-changes merchant. It is a SUBSET of `submitted` (PENDING_APPROVAL
  // is never REGISTERED/DELETED), so it must be checked ahead of "submitted"
  // wherever the two would otherwise disagree on how to present step 8.
  const needsChanges = status === 'PENDING_APPROVAL' && m.onboardingStep === 'NEEDS_CHANGES'

  const statuses: Record<WizardStepId, WizardStepStatus> = {
    category: categorySet ? 'complete' : 'incomplete',
    // Business profile never blocks go-live: complete once a website is set,
    // otherwise optional (the owner can finish the public profile in the portal).
    profile: websiteSet || descriptionSet ? 'complete' : 'optional',
    branches: branchCreated ? 'complete' : 'incomplete',
    vouchers: rmvConfigured ? 'complete' : 'incomplete',
    // No admin invite-staff-on-behalf route exists: honestly gated, never blocks.
    staff: 'gated',
    documents: documentsCount > 0 ? 'complete' : 'optional',
    // OD6: no admin contract-signing route. Complete only reflects the REAL gate
    // (the owner signed via the portal/claim path); otherwise honestly gated.
    contract: contractSigned ? 'complete' : 'gated',
    // Go-live review is complete once the merchant has actually been submitted
    // AND is not sitting in the changes-requested state: needsChanges keeps
    // the rail (and the resume landing) reading "needs attention", because the
    // operator still has to fix the application and resubmit it.
    review: submitted && !needsChanges ? 'complete' : 'incomplete',
    // Handover follows go-live; complete once the merchant is live.
    handover: live ? 'complete' : 'gated',
  }

  return {
    statuses,
    resumeStep: deriveResumeStep({ categorySet, branchCreated, rmvConfigured, submitted, live }),
    facts: {
      categorySet,
      descriptionSet,
      websiteSet,
      branchCount,
      branchCreated,
      rmvConfigured,
      contractSigned,
      documentsCount,
      allGatesComplete,
      canSubmitOnBehalf,
      submitted,
      needsChanges,
      live,
    },
  }
}

/**
 * The resume landing: the first incomplete BLOCKING step, walking the blocking
 * spine (category -> branches -> vouchers -> review). Non-blocking steps
 * (profile, staff, documents, contract) never change where a resume lands.
 *   - no category            -> step 1 (Category and identity)
 *   - no branch              -> step 3 (Branches)
 *   - no RMV                 -> step 4 (Vouchers)
 *   - not yet submitted      -> step 8 (Go-live review: submit, or see the gate)
 *   - submitted, not live    -> step 8 (review shows the in-queue OR the
 *                               needs-changes/resubmit state; needsChanges is
 *                               a subset of submitted, so it lands here too)
 *   - live                   -> step 9 (Handover)
 */
function deriveResumeStep(f: {
  categorySet: boolean
  branchCreated: boolean
  rmvConfigured: boolean
  submitted: boolean
  live: boolean
}): number {
  if (!f.categorySet) return 1
  if (!f.branchCreated) return 3
  if (!f.rmvConfigured) return 4
  if (!f.submitted) return 8
  if (!f.live) return 8
  return 9
}
