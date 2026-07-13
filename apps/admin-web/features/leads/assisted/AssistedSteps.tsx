'use client'

/**
 * AssistedSteps: the nine step-content panels of the assisted onboarding wizard
 * (C2, spec §A4/§B3). Each panel is a THIN presentational wrapper over the
 * SHIPPED admin on-behalf building blocks: it never forks a dialog or a
 * mutation, it mounts/opens them.
 *
 *   1 Category and identity  -> EditCategoryDialog / EditMerchantIdentityDialog /
 *                               ProposeMerchantEditDialog (via shell callbacks)
 *   2 Business profile       -> EditMerchantWebsiteDialog (via shell callback)
 *   3 Branches               -> BranchesTab + Add/Edit/Delete branch dialogs
 *   4 Vouchers               -> VouchersTab (RMV co-build; self-contained)
 *   5 Staff and access       -> HONESTLY GATED (no admin invite-on-behalf route)
 *   6 Documents              -> DocumentsTab (MerchantDocumentsCard; self-contained)
 *   7 Contract               -> ContractCeremony (D65 in-person signing). OD6
 *                               correction (owner decision 2026-07-10, spec
 *                               2026-07-10-d65-in-person-signing): the rep
 *                               WITNESSES the owner signing on the rep's device
 *                               (admin-never-signs preserved: the rep is the
 *                               witness, never the signatory). The portal
 *                               claim/click-to-agree path stays the fallback.
 *   8 Go-live review         -> SubmitForReviewCard + SubmitMerchantDialog
 *   9 Handover               -> honest claim-handover copy + owner-contact block
 *
 * Two-layer capability gating: the wizard PAGE fail-closes on merchant:read;
 * each step's ACTIONS gate on their own existing capability exactly as the
 * source surfaces do (edit-category / edit-identity / propose-edit / edit /
 * manage-branches / manage-vouchers / manage-documents / submit). The backend
 * requireAdminCapability stays the real enforcement.
 */
import Link from 'next/link'
import {
  Globe,
  Pencil,
  Lock,
  Users,
  FileText,
  ShieldCheck,
  Info,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Mail,
  Phone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/features/shared/Badge'
import { BranchesTab } from '@/features/merchants/m360/BranchesTab'
import { VouchersTab } from '@/features/merchants/m360/VouchersTab'
import { DocumentsTab } from '@/features/merchants/m360/DocumentsTab'
import { SubmitForReviewCard } from '@/features/merchants/SubmitForReviewCard'
import { ContractCeremony } from './ContractCeremony'
import type { MerchantDetail, BranchDetail } from '@/lib/api/merchants'
import type { WizardDerivation } from '@/lib/leads/assistedWizard'

// ── Shared step scaffolding ─────────────────────────────────────────────────────

function StepHeading({ step, title, intro }: { step: number; title: string; intro: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Step {step} of 9
      </p>
      <h1 className="mt-1 text-xl font-semibold text-foreground">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{intro}</p>
    </div>
  )
}

/** The pervasive "on behalf + audited" note (spec §c/§d honesty convention). */
function OnBehalfNote() {
  return (
    <p
      className="rounded-md border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground"
      data-testid="assisted-on-behalf-note"
    >
      Every change here is saved on the merchant&apos;s behalf and written to the audit trail.
      Nothing goes live until the go-live review.
    </p>
  )
}

function ReadCard({
  label,
  value,
  icon,
  action,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
          <p className="mt-1 flex items-center gap-2 text-foreground">
            {icon}
            <span className="break-words">{value}</span>
          </p>
        </div>
        {action}
      </div>
    </section>
  )
}

function EditButton({
  onClick,
  testId,
  label = 'Edit',
}: {
  onClick: () => void
  testId: string
  label?: string
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} data-testid={testId}>
      <Pencil className="size-4" aria-hidden="true" />
      {label}
    </Button>
  )
}

/** A skippable-step gate banner (spec §d BC-1 honesty labels). */
function GatedBanner({
  title,
  body,
  testId,
  tone = 'gated',
}: {
  title: string
  body: React.ReactNode
  testId: string
  tone?: 'gated' | 'optional'
}) {
  return (
    <div
      className="rounded-lg border border-dashed border-border bg-card p-4"
      data-testid={testId}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          {tone === 'gated' ? (
            <Lock className="size-4" aria-hidden="true" />
          ) : (
            <Info className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <div className="mt-1 space-y-2 text-sm text-muted-foreground">{body}</div>
        </div>
      </div>
    </div>
  )
}

// ── Step callback + prop shapes ─────────────────────────────────────────────────

export interface StepCaps {
  canEdit: boolean
  canEditIdentity: boolean
  canEditCategory: boolean
  canProposeEdit: boolean
  canManageBranches: boolean
  canManageVouchers: boolean
  canManageDocuments: boolean
  canSubmit: boolean
  /** D65: witness the in-person contract-signing ceremony (merchant:sign-agreement). */
  canSignAgreement: boolean
}

export interface StepCallbacks {
  onEditCategory: () => void
  onEditIdentity: () => void
  onProposeEdit: () => void
  onEditWebsite: () => void
  onAddBranch: () => void
  onEditBranch: (branch: BranchDetail) => void
  onDeleteBranch: (branch: BranchDetail) => void
  onSubmitForReview: () => void
  /** D65: called once the ceremony confirms signing (refetch + advance to go-live). */
  onContractSigned: () => void
}

// ── Step 1 · Category and identity ─────────────────────────────────────────────

export function Step1CategoryIdentity({
  data,
  caps,
  cb,
}: {
  data: MerchantDetail
  caps: StepCaps
  cb: StepCallbacks
}) {
  const { merchant } = data
  return (
    <div className="space-y-5" data-testid="assisted-step-category">
      <StepHeading
        step={1}
        title="Category and identity"
        intro="Set the trade and the legal identity. Category is a hard prerequisite for building the flagship vouchers in step 4; changing the top-level category later discards any draft flagship vouchers."
      />
      <OnBehalfNote />

      {/* Category (merchant:edit-category, SUPER_ADMIN; hidden when locked) */}
      <ReadCard
        label="Category"
        value={merchant.category ?? 'Not set'}
        action={
          caps.canEditCategory && !merchant.categoryLocked ? (
            <EditButton onClick={cb.onEditCategory} testId="assisted-category-edit" />
          ) : undefined
        }
      />
      {merchant.categoryLocked && (
        <p className="-mt-3 px-1 text-xs text-muted-foreground" data-testid="assisted-category-locked-note">
          Category is locked while this merchant has submitted or live vouchers.
        </p>
      )}

      {/* Business identity text (name/trading/description): propose lane */}
      <section className="rounded-lg border border-border bg-card p-4" data-testid="assisted-identity-text-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-muted-foreground">Business identity</h2>
            <dl className="mt-1 grid gap-1 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <span className="text-muted-foreground">Business name:</span>
                <span>{merchant.businessName}</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <span className="text-muted-foreground">Trading name:</span>
                <span>{merchant.tradingName ?? 'Not set'}</span>
              </div>
              <div className="flex items-start gap-2 text-foreground">
                <span className="shrink-0 text-muted-foreground">Description:</span>
                <span>{merchant.description ?? 'Not set'}</span>
              </div>
            </dl>
            {caps.canProposeEdit && merchant.hasPendingIdentityEdit && (
              <p className="mt-2 text-xs text-muted-foreground" data-testid="assisted-identity-pending-note">
                An identity edit is already awaiting review. Action that request in the approval queue
                before proposing another.
              </p>
            )}
          </div>
          {caps.canProposeEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={cb.onProposeEdit}
              disabled={merchant.hasPendingIdentityEdit}
              data-testid="assisted-identity-propose"
            >
              <Pencil className="size-4" aria-hidden="true" />
              Propose changes
            </Button>
          )}
        </div>
      </section>

      {/* Business registration (VAT/company): merchant:edit-identity, SUPER_ADMIN */}
      <section className="rounded-lg border border-border bg-card p-4" data-testid="assisted-registration-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-muted-foreground">Business registration</h2>
            <dl className="mt-1 grid gap-1 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <span className="text-muted-foreground">VAT number:</span>
                <span>{merchant.vatNumber ?? 'Not set'}</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <span className="text-muted-foreground">Company number:</span>
                <span>{merchant.companyNumber ?? 'Not set'}</span>
              </div>
            </dl>
          </div>
          {caps.canEditIdentity && (
            <EditButton onClick={cb.onEditIdentity} testId="assisted-identity-edit" />
          )}
        </div>
      </section>
    </div>
  )
}

// ── Step 2 · Business profile ───────────────────────────────────────────────────

export function Step2BusinessProfile({
  data,
  caps,
  cb,
}: {
  data: MerchantDetail
  caps: StepCaps
  cb: StepCallbacks
}) {
  const { merchant } = data
  return (
    <div className="space-y-5" data-testid="assisted-step-profile">
      <StepHeading
        step={2}
        title="Business profile"
        intro="The public web presence. This step is optional and never blocks go-live: the owner can finish the richer public profile in the Merchant Portal."
      />
      <OnBehalfNote />

      {/* Website: direct edit (merchant:edit) */}
      <ReadCard
        label="Public website"
        value={merchant.websiteUrl ?? 'Not set'}
        icon={<Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        action={caps.canEdit ? <EditButton onClick={cb.onEditWebsite} testId="assisted-website-edit" /> : undefined}
      />

      {/* Public description (read; edited via the step-1 identity propose lane) */}
      <ReadCard label="Customer-facing description" value={merchant.description ?? 'Not set'} />

      <GatedBanner
        tone="optional"
        testId="assisted-profile-richer-note"
        title="Richer public profile is completed by the owner"
        body={
          <>
            <p>
              The public website above is editable on the merchant&apos;s behalf. The customer-facing
              description is edited through the identity propose lane in step 1.
            </p>
            <p>
              Richer public-profile fields (logo, cover image, business type, head-office address,
              service options, social links) are net-new and not stored today. The owner completes
              them in the Merchant Portal after handover.
            </p>
          </>
        }
      />
    </div>
  )
}

// ── Step 3 · Branches ────────────────────────────────────────────────────────────

export function Step3Branches({
  data,
  caps,
  cb,
}: {
  data: MerchantDetail
  caps: StepCaps
  cb: StepCallbacks
}) {
  return (
    <div className="space-y-5" data-testid="assisted-step-branches">
      <StepHeading
        step={3}
        title="Branches"
        intro="Add at least the main branch on the merchant's behalf. Go-live needs one branch with a confirmed location. The redemption PIN is set with the merchant at branch creation and is never read back."
      />
      <OnBehalfNote />
      <BranchesTab
        data={data}
        canEdit={caps.canEdit}
        canManageBranches={caps.canManageBranches}
        onAddBranch={cb.onAddBranch}
        onEditBranch={cb.onEditBranch}
        onDeleteBranch={cb.onDeleteBranch}
      />
    </div>
  )
}

// ── Step 4 · Vouchers ────────────────────────────────────────────────────────────

export function Step4Vouchers({
  data,
  caps,
}: {
  data: MerchantDetail
  caps: StepCaps
}) {
  return (
    <div className="space-y-5" data-testid="assisted-step-vouchers">
      <StepHeading
        step={4}
        title="Vouchers"
        intro="Co-build the two flagship vouchers (RMVs) this business needs to go live, on the merchant's behalf. Draft flagships can be edited and submitted for review; custom vouchers are a day-2 addition after go-live."
      />
      <OnBehalfNote />
      <VouchersTab merchantId={data.merchant.id} canManageVouchers={caps.canManageVouchers} />
    </div>
  )
}

// ── Step 5 · Staff and access (honestly gated, optional) ─────────────────────────

export function Step5Staff() {
  return (
    <div className="space-y-5" data-testid="assisted-step-staff">
      <StepHeading
        step={5}
        title="Staff and access"
        intro="Staff is optional and never blocks go-live. The owner is automatically the account admin and the default user for every branch."
      />
      <GatedBanner
        testId="assisted-staff-gated"
        title="Adding staff on behalf is not available here"
        body={
          <>
            <p>
              There is no admin invite-staff-on-behalf route today: portal managers and till/branch
              users are invited by a secure claim link that the person sets their own password from,
              which the operator never sees or sets.
            </p>
            <p>
              Skip this step for now. After go-live, an admin can add, suspend, reactivate, or reset
              staff on the owner&apos;s behalf from Merchant 360, and the owner can manage staff in the
              Merchant Portal.
            </p>
          </>
        }
      />
      <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="assisted-staff-skip-note">
        <Users className="size-4 shrink-0" aria-hidden="true" />
        This step is optional. Continue to the next step.
      </p>
    </div>
  )
}

// ── Step 6 · Documents (optional; self-contained) ────────────────────────────────

export function Step6Documents({
  data,
  caps,
}: {
  data: MerchantDetail
  caps: StepCaps
}) {
  return (
    <div className="space-y-5" data-testid="assisted-step-documents">
      <StepHeading
        step={6}
        title="Documents"
        intro="Verification documents are optional and never block go-live. Uploads go to moderation; nothing is auto-approved. Capturing them on the assisted side is net-new."
      />
      <OnBehalfNote />
      {caps.canManageDocuments ? (
        <DocumentsTab merchantId={data.merchant.id} canManageDocuments={caps.canManageDocuments} />
      ) : (
        <>
          <DocumentsTab merchantId={data.merchant.id} canManageDocuments={false} />
          <p className="text-xs text-muted-foreground" data-testid="assisted-documents-gated">
            Uploading documents on behalf needs the merchant:manage-documents capability.
          </p>
        </>
      )}
    </div>
  )
}

// ── Step 7 · Contract (D65 in-person signing ceremony) ───────────────────────────

/**
 * OD6 correction (owner decision 2026-07-10, spec 2026-07-10-d65-in-person-signing):
 * the earlier "no admin signing route, honestly gated" model is superseded. The
 * merchant now signs in person via the witnessed ceremony: the owner reviews and
 * types their full name (the signature of record) on the rep's device, and the rep
 * is recorded as the witness (admin-never-signs preserved). The portal
 * claim/click-to-agree path remains the fallback for a self-onboarding owner.
 */
export function Step7Contract({
  data,
  caps,
  cb,
  derivation,
}: {
  data: MerchantDetail
  caps: StepCaps
  cb: StepCallbacks
  derivation: WizardDerivation
}) {
  const signed = derivation.facts.contractSigned
  const businessLegalName = data.merchant.businessName

  return (
    <div className="space-y-5" data-testid="assisted-step-contract">
      <StepHeading
        step={7}
        title="Contract"
        intro="The 12-month merchant agreement. The owner reviews and signs it themselves, in person on this device. The operator witnesses the signing and can never sign on the owner's behalf."
      />

      {signed ? (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"
          data-testid="assisted-contract-signed"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Agreement signed by the owner</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The merchant agreement is signed. This is one of the go-live gates in step 8. The
                signed evidence is on the merchant&apos;s 360.
              </p>
            </div>
          </div>
        </div>
      ) : caps.canSignAgreement ? (
        <ContractCeremony
          merchantId={data.merchant.id}
          businessLegalName={businessLegalName}
          onDone={cb.onContractSigned}
        />
      ) : (
        <GatedBanner
          testId="assisted-contract-gated"
          title="Signing the contract needs the sign-agreement capability"
          body={
            <>
              <p>
                Witnessing the in-person signing needs the merchant:sign-agreement capability, which
                your role does not hold. The owner can still sign the 12-month agreement from the
                Merchant Portal via the claim/setup link.
              </p>
              <p>
                The contract gate is currently <strong>not met</strong>. It shows as unmet in the
                go-live review (step 8) until the agreement is signed. This step never blocks moving
                between steps.
              </p>
            </>
          }
        />
      )}
    </div>
  )
}

// ── Step 8 · Go-live review ──────────────────────────────────────────────────────

/**
 * State-aware copy for the "already actioned, not needing changes" card:
 * live / genuinely queued (PENDING_APPROVAL without NEEDS_CHANGES) / suspended
 * / inactive. NEEDS_CHANGES is NOT handled here: it renders its own distinct
 * "Changes requested" branch in Step8Review, because it is not a queued state
 * and "in the approval queue" would be dishonest for it (adversarial-review
 * F1/N2).
 */
function reviewSubmittedCopy(
  status: string,
  live: boolean
): { heading: string; body: string; positive: boolean } {
  if (live) {
    return {
      heading: 'This merchant is live',
      body: 'The merchant has been approved and is live. Continue to handover.',
      positive: true,
    }
  }
  if (status === 'SUSPENDED') {
    return {
      heading: 'This merchant is suspended',
      body: 'The account is suspended, so there is nothing to action in the go-live review. Reactivate the merchant first if onboarding needs to continue.',
      positive: false,
    }
  }
  if (status === 'INACTIVE') {
    return {
      heading: 'This merchant is inactive',
      body: 'The account is inactive, so there is nothing to action in the go-live review.',
      positive: false,
    }
  }
  // PENDING_APPROVAL without NEEDS_CHANGES: genuinely queued.
  return {
    heading: 'Submitted for review',
    body: 'The application is in the approval queue. An admin actioner reviews and approves it separately.',
    positive: true,
  }
}

/** Read-only fallback when the operator lacks merchant:submit (first-submit or resubmit). */
function SubmitCapabilityGatedNote({ data }: { data: MerchantDetail }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="assisted-review-submit-gated">
      <p className="text-sm text-muted-foreground">
        Submitting on the merchant&apos;s behalf needs the merchant:submit capability, which your
        role does not hold. The gates below still show the real go-live readiness.
      </p>
      <SubmitChecklistReadonly data={data} />
    </div>
  )
}

export function Step8Review({
  data,
  caps,
  cb,
  derivation,
}: {
  data: MerchantDetail
  caps: StepCaps
  cb: StepCallbacks
  derivation: WizardDerivation
}) {
  const { merchant } = data
  const { facts } = derivation
  const submittedCopy = reviewSubmittedCopy(merchant.status, facts.live)

  return (
    <div className="space-y-5" data-testid="assisted-step-review">
      <StepHeading
        step={8}
        title="Go-live review"
        intro="The real go-live gates. Submitting queues the merchant into the approval queue; an admin actioner approves it separately. Submitting does not take the merchant live by itself."
      />

      {facts.needsChanges ? (
        // NEEDS_CHANGES is bounced-for-changes, not queued: the submit card
        // reappears in resubmit mode (its own onboardingStep-driven copy) so
        // the operator can actually fix and resubmit, instead of the dead-end
        // "in the approval queue" copy (adversarial-review F1).
        <div className="space-y-3">
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 p-4"
            data-testid="assisted-review-needs-changes"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Changes requested</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Changes requested by the review team: update the application and resubmit.
                </p>
              </div>
            </div>
          </div>

          {caps.canSubmit ? (
            <SubmitForReviewCard
              onboardingStep={merchant.onboardingStep}
              submitChecklist={merchant.submitChecklist}
              onSubmit={cb.onSubmitForReview}
            />
          ) : (
            <SubmitCapabilityGatedNote data={data} />
          )}
        </div>
      ) : facts.submitted ? (
        <div
          className="rounded-lg border border-border bg-secondary/30 p-4"
          data-testid="assisted-review-submitted"
        >
          <div className="flex items-start gap-3">
            {submittedCopy.positive ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-foreground">{submittedCopy.heading}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{submittedCopy.body}</p>
            </div>
          </div>
        </div>
      ) : caps.canSubmit ? (
        <SubmitForReviewCard
          onboardingStep={merchant.onboardingStep}
          submitChecklist={merchant.submitChecklist}
          onSubmit={cb.onSubmitForReview}
        />
      ) : (
        <SubmitCapabilityGatedNote data={data} />
      )}

      <p className="text-xs text-muted-foreground" data-testid="assisted-review-gate-note">
        These are the material go-live gates the platform enforces: at least one branch, the
        merchant agreement signed by the owner, and the two mandatory (RMV) vouchers configured. A
        main branch and its confirmed location are enforced by the branch step and the backend at
        submit time.
      </p>
    </div>
  )
}

/** A read-only echo of the three live submit gates (when submit is not permitted). */
function SubmitChecklistReadonly({ data }: { data: MerchantDetail }) {
  const c = data.merchant.submitChecklist
  const rows: Array<{ key: string; label: string; met: boolean }> = [
    { key: 'branch_created', label: 'At least one branch exists', met: c.branch_created },
    { key: 'contract_signed', label: 'Merchant agreement signed by the owner', met: c.contract_signed },
    { key: 'rmv_configured', label: 'Two mandatory (RMV) vouchers configured', met: c.rmv_configured },
  ]
  return (
    <ul className="mt-3 grid gap-1.5" data-testid="assisted-review-checklist-readonly">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2 text-sm text-foreground" data-met={r.met ? 'true' : 'false'}>
          {r.met ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="sr-only">{r.met ? 'Met:' : 'Not met:'}</span>
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Step 9 · Handover ────────────────────────────────────────────────────────────

export function Step9Handover({ data, derivation }: { data: MerchantDetail; derivation: WizardDerivation }) {
  const owner = data.merchant.owner
  const { facts } = derivation
  return (
    <div className="space-y-5" data-testid="assisted-step-handover">
      <StepHeading
        step={9}
        title="Handover"
        intro="Hand the account to the owner. They set their own password and take ownership. The operator never sets or sees a password."
      />

      {!facts.live && (
        <GatedBanner
          testId="assisted-handover-not-live-note"
          title="Handover completes after go-live"
          body={
            <p>
              This merchant is not live yet. Complete the go-live review (step 8) first; the account
              is handed over once it is approved and live.
            </p>
          }
        />
      )}

      {/* Honest claim path: no claim token/link is exposed to the client. The
          account-setup (claim) email is triggered when the draft is created; while
          email sending is dark, the handover is manual. We NEVER invent a backend
          read for a token. */}
      <div className="rounded-lg border border-border bg-card p-4" data-testid="assisted-handover-claim">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">The owner claims the account by email</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A secure account-setup (claim) email is triggered for the owner when the draft is
              created. The tokenised link is never shown here or written to logs: the transfer/claim
              mechanism is real, and the owner sets their own password from that link.
            </p>
            <p className="mt-2 text-sm text-muted-foreground" data-testid="assisted-handover-email-dark">
              Email sending is not switched on yet, so today the handover is manual: reach the owner
              on the contact details below and walk them through the account-setup link. No claim
              token is available to copy from this screen.
            </p>
          </div>
        </div>
      </div>

      {/* Owner-contact block (real, curated read; no invented fields). */}
      <section className="rounded-lg border border-border bg-card p-4" data-testid="assisted-handover-owner">
        <h2 className="text-sm font-medium text-muted-foreground">Owner contact</h2>
        {owner ? (
          <dl className="mt-2 grid gap-1.5 text-sm">
            <div className="flex items-center gap-2 text-foreground">
              <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{owner.name}</span>
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{owner.email}</span>
              {owner.emailVerified ? (
                <Badge tone="success">Verified</Badge>
              ) : (
                <Badge tone="neutral">Unverified</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{owner.phone ?? 'No phone on file'}</span>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground" data-testid="assisted-handover-owner-empty">
            No active account owner is on file for this merchant yet.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href={`/merchants/${data.merchant.id}`} data-testid="assisted-handover-360-link">
          <Button type="button" variant="outline">
            <FileText className="size-4" aria-hidden="true" />
            Open the merchant&apos;s 360
          </Button>
        </Link>
        <Link href="/leads" data-testid="assisted-handover-finish-link">
          <Button type="button">
            Finish and exit to admin
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
