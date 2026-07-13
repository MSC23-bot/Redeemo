'use client'

/**
 * AssistedWizard: the full-screen assisted onboarding wizard shell (C2, spec
 * §A4). It is entered on an EXISTING draft merchant (created first via the
 * shipped create-draft form), and is resumable from the hub's in-progress list.
 *
 * It composes the SHIPPED admin on-behalf building blocks into a 9-step focus
 * flow. It never forks a dialog or a mutation and never calls a merchant-scope
 * endpoint: every write is an existing admin route, and any step lacking an
 * admin route is honestly gated (staff, contract).
 *
 * RESUME CONTRACT: the wizard step is DERIVED from the merchant's REAL state
 * (assistedWizard.deriveWizardState), not a stored pointer. The current step is
 * the `?step=` URL param when present (free movement via the rail + footer),
 * defaulting to the derived resume step. The rail reads the same derivation, so
 * rail marks and the resume landing never disagree.
 *
 * Two-layer capability gating: the PAGE fail-closes on merchant:read; each
 * affordance additionally gates on its own existing capability, exactly as the
 * source dialogs do. Backend requireAdminCapability stays the real enforcement.
 *
 * DIVERGENCE (recorded): the task fixes this route under the (app) group, so the
 * wizard renders inside the standard AdminShell chrome and substitutes an
 * in-content focus layout (persistent on-behalf header band + left step rail)
 * rather than a route that escapes the shell entirely. The behaviour (focus
 * flow, on-behalf framing, audited writes) is preserved.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { ForbiddenState } from '@/features/shared/ForbiddenState'
import { ErrorState } from '@/features/shared/ErrorState'
import { useMerchantDetail } from '@/lib/merchants/useMerchantDetail'
import {
  deriveWizardState,
  resolveStepParam,
  WIZARD_STEP_COUNT,
  stepDefByNum,
} from '@/lib/leads/assistedWizard'
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import { AssistedStepRail } from './AssistedStepRail'
import {
  Step1CategoryIdentity,
  Step2BusinessProfile,
  Step3Branches,
  Step4Vouchers,
  Step5Staff,
  Step6Documents,
  Step7Contract,
  Step8Review,
  Step9Handover,
  type StepCaps,
  type StepCallbacks,
} from './AssistedSteps'
// Shipped dialogs (unforked) mounted at shell level, keyed by open intent.
import { EditMerchantWebsiteDialog } from '@/features/merchants/EditMerchantWebsiteDialog'
import { EditMerchantIdentityDialog } from '@/features/merchants/EditMerchantIdentityDialog'
import { ProposeMerchantEditDialog } from '@/features/merchants/ProposeMerchantEditDialog'
import { EditCategoryDialog } from '@/features/merchants/EditCategoryDialog'
import { EditBranchDialog } from '@/features/merchants/EditBranchDialog'
import { AddBranchDialog } from '@/features/merchants/AddBranchDialog'
import { DeleteBranchConfirm } from '@/features/merchants/DeleteBranchConfirm'
import { SubmitMerchantDialog } from '@/features/merchants/SubmitMerchantDialog'
import type { BranchDetail } from '@/lib/api/merchants'

// ── States ────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20" data-testid="assisted-loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

// ── Dialog intents (reused shipped dialogs) ──────────────────────────────────────

type OpenDialog =
  | { kind: 'website' }
  | { kind: 'identity' }
  | { kind: 'propose-edit' }
  | { kind: 'category' }
  | { kind: 'branch'; branch: BranchDetail }
  | { kind: 'add-branch' }
  | { kind: 'delete-branch'; branch: BranchDetail }
  | { kind: 'submit' }
  | null

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ── Wizard ──────────────────────────────────────────────────────────────────────

function Wizard() {
  const params = useParams<{ merchantId: string }>()
  const id = params?.merchantId ?? ''
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { ready, can } = useSession()
  const canRead = ready && can('merchant:read')

  const caps: StepCaps = {
    canEdit: can('merchant:edit'),
    canEditIdentity: can('merchant:edit-identity'),
    canEditCategory: can('merchant:edit-category'),
    canProposeEdit: can('merchant:propose-edit'),
    canManageBranches: can('merchant:manage-branches'),
    canManageVouchers: can('merchant:manage-vouchers'),
    canManageDocuments: can('merchant:manage-documents'),
    canSubmit: can('merchant:submit'),
  }

  const { data, isLoading, isError, refetch } = useMerchantDetail(id, canRead)
  const [dialog, setDialog] = useState<OpenDialog>(null)

  if (!ready) return <LoadingState />
  if (!can('merchant:read')) {
    // leads-onboarding-spec.md §A4 assistedCapDenied names an aspirational
    // "merchant:assisted-onboard" capability that does not exist in the
    // mirror (see the module doc comment above): the real gate on this
    // wizard is merchant:read, so that is what is named here.
    return (
      <ForbiddenState
        heading="You cannot run assisted onboarding."
        capability="merchant:read"
        testId="assisted-forbidden"
      />
    )
  }

  if (isLoading) return <LoadingState />
  if (isError || !data) {
    return <ErrorState subject="this merchant" onRetry={refetch} testId="assisted-error" />
  }

  const derivation = deriveWizardState(data)
  const currentStep = resolveStepParam(searchParams?.get('step'), derivation.resumeStep)
  const currentDef = stepDefByNum(currentStep)
  const displayName = data.merchant.tradingName ?? data.merchant.businessName

  function goToStep(n: number) {
    const clamped = Math.min(WIZARD_STEP_COUNT, Math.max(1, n))
    router.replace(`${pathname}?step=${clamped}`, { scroll: false })
  }

  function closeDialog() {
    setDialog(null)
  }
  function onDialogSuccess() {
    setDialog(null)
    void refetch()
  }

  const cb: StepCallbacks = {
    onEditCategory: () => setDialog({ kind: 'category' }),
    onEditIdentity: () => setDialog({ kind: 'identity' }),
    onProposeEdit: () => setDialog({ kind: 'propose-edit' }),
    onEditWebsite: () => setDialog({ kind: 'website' }),
    onAddBranch: () => setDialog({ kind: 'add-branch' }),
    onEditBranch: (branch) => setDialog({ kind: 'branch', branch }),
    onDeleteBranch: (branch) => setDialog({ kind: 'delete-branch', branch }),
    onSubmitForReview: () => setDialog({ kind: 'submit' }),
  }

  return (
    <div className="space-y-4" data-testid="assisted-wizard">
      {/* Persistent on-behalf focus header (neutral dark band; admin stays neutral). */}
      <header
        className="flex flex-wrap items-center gap-3 rounded-lg bg-foreground px-4 py-3 text-background"
        data-testid="assisted-header"
      >
        <Link
          href="/leads"
          className="flex items-center gap-1.5 rounded-sm text-sm opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="assisted-exit-link"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Exit to admin
        </Link>
        <span aria-hidden="true" className="opacity-40">
          |
        </span>
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background/15 text-xs font-semibold"
          aria-hidden="true"
        >
          {initials(displayName)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">{displayName}</span>
            <Badge tone="warn">Assisted · on behalf</Badge>
          </div>
          <p className="mt-0.5 text-xs opacity-80">
            Acting on behalf, in person. Every step is audited. Nothing goes live until the go-live
            review.
          </p>
        </div>
        <Link href="/leads" className="ml-auto" data-testid="assisted-save-later-link">
          <Button type="button" variant="outline" size="sm">
            Save and continue later
          </Button>
        </Link>
      </header>

      {/* Body: left step rail + step content. */}
      <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background md:flex-row">
        <AssistedStepRail currentStep={currentStep} statuses={derivation.statuses} onGo={goToStep} />

        <div className="min-w-0 flex-1 p-5 md:p-6" data-testid="assisted-step-content">
          <div className="mx-auto max-w-3xl">
            {currentStep === 1 && <Step1CategoryIdentity data={data} caps={caps} cb={cb} />}
            {currentStep === 2 && <Step2BusinessProfile data={data} caps={caps} cb={cb} />}
            {currentStep === 3 && <Step3Branches data={data} caps={caps} cb={cb} />}
            {currentStep === 4 && <Step4Vouchers data={data} caps={caps} />}
            {currentStep === 5 && <Step5Staff />}
            {currentStep === 6 && <Step6Documents data={data} caps={caps} />}
            {currentStep === 7 && <Step7Contract derivation={derivation} />}
            {currentStep === 8 && <Step8Review data={data} caps={caps} cb={cb} derivation={derivation} />}
            {currentStep === 9 && <Step9Handover data={data} derivation={derivation} />}

            {/* Footer nav: free movement (spec §c "Nothing is live yet · move freely"). */}
            <div
              className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5"
              data-testid="assisted-step-nav"
            >
              {currentStep > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => goToStep(currentStep - 1)}
                  data-testid="assisted-prev-step"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Previous step
                </Button>
              ) : (
                <span />
              )}
              <span className="text-xs text-muted-foreground">
                Nothing is live yet · move freely
              </span>
              {currentStep < WIZARD_STEP_COUNT ? (
                <Button type="button" onClick={() => goToStep(currentStep + 1)} data-testid="assisted-next-step">
                  Next step
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs (existing components, unforked). */}
      {dialog?.kind === 'website' && (
        <EditMerchantWebsiteDialog
          merchantId={data.merchant.id}
          currentWebsiteUrl={data.merchant.websiteUrl}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'identity' && (
        <EditMerchantIdentityDialog
          merchantId={data.merchant.id}
          currentVatNumber={data.merchant.vatNumber}
          currentCompanyNumber={data.merchant.companyNumber}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'propose-edit' && (
        <ProposeMerchantEditDialog
          merchantId={data.merchant.id}
          current={{
            businessName: data.merchant.businessName,
            tradingName: data.merchant.tradingName,
            description: data.merchant.description,
          }}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'category' && (
        <EditCategoryDialog
          merchantId={data.merchant.id}
          currentCategoryId={data.merchant.primaryCategoryId}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'branch' && (
        <EditBranchDialog
          branchId={dialog.branch.id}
          merchantId={data.merchant.id}
          current={{
            phone: dialog.branch.phone,
            email: dialog.branch.email,
            websiteUrl: dialog.branch.websiteUrl,
            isActive: dialog.branch.isActive,
          }}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'add-branch' && (
        <AddBranchDialog merchantId={data.merchant.id} onSuccess={onDialogSuccess} onCancel={closeDialog} />
      )}
      {dialog?.kind === 'delete-branch' && (
        <DeleteBranchConfirm
          branchId={dialog.branch.id}
          branchName={dialog.branch.name}
          merchantId={data.merchant.id}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'submit' && (
        <SubmitMerchantDialog
          merchantId={data.merchant.id}
          isResubmit={data.merchant.onboardingStep === 'NEEDS_CHANGES'}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
    </div>
  )
}

export function AssistedWizard() {
  return <Wizard />
}
