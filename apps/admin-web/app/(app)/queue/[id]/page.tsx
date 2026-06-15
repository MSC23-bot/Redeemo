'use client'

/**
 * Approval review page — /queue/[id]
 *
 * Shows the full review context for a single MERCHANT_ONBOARDING approval.
 * Gated on approval:read capability.
 *
 * Layout: two-column (main content left, sidebar right) on lg+, single column
 * on smaller screens. ActionBar is mounted below the two-column grid.
 *
 * M5 additions:
 *   - Claim / Release buttons in the topbar
 *   - ActionBar (claim-to-act state machine) below the two-column grid
 *   - RequestChangesDialog, RejectDialog, ApproveConfirm dialogs (local state)
 *   - Failed-approve checklist gate highlight passed to ChecklistSummary
 */
import { use, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertCircle, FileQuestion } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useReview } from '@/lib/review/useReview'
import { useClaim, useRelease } from '@/lib/review/useReviewActions'
import { Badge } from '@/features/shared/Badge'
import type { BadgeTone } from '@/features/shared/Badge'
import type { ReviewApproval } from '@/lib/api/review'
import { MerchantHeader } from '@/features/review/MerchantHeader'
import { ProfileCard } from '@/features/review/ProfileCard'
import { BranchTable } from '@/features/review/BranchTable'
import { DocumentList } from '@/features/review/DocumentList'
import { VoucherList } from '@/features/review/VoucherList'
import { ChecklistSummary } from '@/features/review/ChecklistSummary'
import { ThinAreaFlags } from '@/features/review/ThinAreaFlags'
import { ActivityTimeline } from '@/features/timeline/ActivityTimeline'
import { ActionBar } from '@/features/review/ActionBar'
import { RequestChangesDialog } from '@/features/review/RequestChangesDialog'
import { RejectDialog } from '@/features/review/RejectDialog'
import { ApproveConfirm } from '@/features/review/ApproveConfirm'
import { MerchantLifecycleCard } from '@/features/merchants/MerchantLifecycleCard'
import { SuspendDialog } from '@/features/merchants/SuspendDialog'
import { ReactivateConfirm } from '@/features/merchants/ReactivateConfirm'
import { ConfirmLocationDialog } from '@/features/merchants/ConfirmLocationDialog'
import { EditReviewPanel } from '@/features/review/EditReviewPanel'
import { Button } from '@/components/ui/button'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'

// Option B B1: the two merchant-requested identity-edit types route to the
// edit-review surface instead of the generic non-onboarding notice.
const EDIT_APPROVAL_TYPES = ['MERCHANT_IDENTITY_EDIT', 'BRANCH_IDENTITY_EDIT']

// ── Shared loading / error / forbidden ───────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20" data-testid="review-loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading review" />
    </div>
  )
}

function ForbiddenState() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center" data-testid="review-forbidden">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-semibold text-foreground">Access denied</h2>
      <p className="text-sm text-muted-foreground">
        You do not have permission to view approval reviews. Contact your administrator.
      </p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
      data-testid="review-error"
    >
      <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
      <p className="mb-4 text-sm text-destructive">
        Could not load this review. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-medium text-primary hover:underline"
      >
        Retry
      </button>
    </div>
  )
}

// ── Non-onboarding notice ─────────────────────────────────────────────────────

function NonOnboardingNotice({ type }: { type: string }) {
  return (
    <div
      className="rounded-lg border border-border bg-card px-6 py-10 text-center"
      data-testid="review-non-onboarding"
    >
      <p className="text-sm text-muted-foreground">
        This approval is of type <strong>{type}</strong>. The detailed review view is only
        available for merchant onboarding approvals.
      </p>
    </div>
  )
}

// ── Merchant-unavailable notice ───────────────────────────────────────────────
// MERCHANT_ONBOARDING approval whose merchant record could not be found (orphaned
// or removed). This is NOT a fetch error — there is nothing to retry — so it gets
// its own calm notice rather than the generic ErrorState.

function MerchantUnavailableNotice() {
  return (
    <div
      className="rounded-lg border border-border bg-card px-6 py-10 text-center"
      data-testid="review-merchant-unavailable"
    >
      <FileQuestion className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">Merchant record unavailable</p>
      <p className="mt-1 text-sm text-muted-foreground">
        The merchant for this approval could not be found (it may have been removed).
      </p>
    </div>
  )
}

// ── Claim-state badge ─────────────────────────────────────────────────────────

function claimBadge(
  approval: ReviewApproval,
  adminId: string | null
): { tone: BadgeTone; label: string } {
  if (approval.status === 'CHANGES_REQUESTED') {
    return { tone: 'warn', label: 'Waiting on merchant' }
  }
  if (approval.claimedBy?.id === adminId) {
    return { tone: 'info', label: 'Claimed by you' }
  }
  if (approval.claimedBy != null) {
    return { tone: 'info', label: `Claimed by ${approval.claimedBy.name ?? 'an admin'}` }
  }
  return { tone: 'neutral', label: 'Unclaimed' }
}

function ClaimStateBadge({
  approval,
  adminId,
}: {
  approval: ReviewApproval
  adminId: string | null
}) {
  const { tone, label } = claimBadge(approval, adminId)
  return (
    <span data-testid="review-claim-badge">
      <Badge tone={tone}>{label}</Badge>
    </span>
  )
}

// ── Dialog type ───────────────────────────────────────────────────────────────

type OpenDialog =
  | 'request-changes'
  | 'reject'
  | 'approve'
  | 'suspend'
  | 'reactivate'
  | null

// ── Page ──────────────────────────────────────────────────────────────────────

interface ReviewPageProps {
  params: Promise<{ id: string }>
}

export default function ReviewPage({ params }: ReviewPageProps) {
  const { id } = use(params)
  const { ready, can, adminId, role } = useSession()
  const canRead = ready && can('approval:read')
  const { data, isLoading, isError, refetch } = useReview(id, canRead)

  // M5: action mutations.
  const claimMutation = useClaim(id)
  const releaseMutation = useRelease(id)

  // M5: dialog open state.
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null)

  // M6: confirm-location dialog targets a specific branch (id); null when closed.
  const [confirmLocationBranchId, setConfirmLocationBranchId] = useState<string | null>(null)

  // M5: failed-approve gate highlight (passed to ChecklistSummary).
  const [failedGates, setFailedGates] = useState<{
    branch_created?: boolean
    contract_signed?: boolean
    rmv_configured?: boolean
  } | null>(null)

  function handleDialogSuccess() {
    setOpenDialog(null)
    refetch()
  }

  if (!ready) {
    return <LoadingState />
  }

  if (!can('approval:read')) {
    return <ForbiddenState />
  }

  // Determine whether the Release button should show in the topbar.
  // Claimer's own release: shown in the topbar when claimed-by-me and PENDING.
  // SUPER_ADMIN force-release on claimed-by-other: shown in ActionBar only.
  const showTopbarRelease =
    data != null &&
    data.approval.status === 'PENDING' &&
    data.approval.claimedBy?.id === adminId

  return (
    <div className="space-y-6">
      {/* Topbar: breadcrumb + back link (left), claim badge + optional Release (right) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/queue"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            aria-label="Back to approval queue"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Approval queue</span>
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground font-medium">
            {data?.merchant?.businessName ?? 'Review'}
          </span>
        </nav>

        <div className="flex items-center gap-3">
          {data && <ClaimStateBadge approval={data.approval} adminId={adminId} />}
          {showTopbarRelease && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => releaseMutation.mutate()}
              disabled={releaseMutation.isPending}
              data-testid="topbar-release-btn"
            >
              {releaseMutation.isPending ? 'Releasing...' : 'Release'}
            </Button>
          )}
        </div>
      </div>
      {/* Topbar release error: shown only for the claimer's own Release path. */}
      {showTopbarRelease && releaseMutation.error && (
        <div data-testid="topbar-release-error">
          <NamedGateBanner error={releaseMutation.error} />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState onRetry={refetch} />
      ) : EDIT_APPROVAL_TYPES.includes(data.approval.type) ? (
        // Option B B1 — merchant-requested identity edit (its own field-diff
        // surface with Approve-edit / Reject-edit). The actions are gated on
        // approval:apply-edit; the diff read uses approval:read (already checked).
        <EditReviewPanel
          approvalId={id}
          canRead={canRead}
          canApplyEdit={can('approval:apply-edit')}
        />
      ) : data.approval.type !== 'MERCHANT_ONBOARDING' ? (
        <NonOnboardingNotice type={data.approval.type} />
      ) : !data.merchant ? (
        // Degenerate MERCHANT_ONBOARDING approval whose merchant record is
        // missing. The merchant-keyed timeline cannot mount here (no merchant
        // id), so only the calm notice is shown.
        <div className="space-y-6">
          <MerchantUnavailableNotice />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Merchant header — full width */}
          <MerchantHeader merchant={data.merchant} approval={data.approval} />

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            {/* Left: main content */}
            <div className="space-y-6 min-w-0">
              <VoucherList vouchers={data.vouchers} />
              <BranchTable
                branches={data.branches}
                canConfirmLocation={can('branch:confirm-location')}
                onConfirmLocation={(branchId) => setConfirmLocationBranchId(branchId)}
              />
              <DocumentList documents={data.documents} />
              {data.thinAreas && <ThinAreaFlags thinAreas={data.thinAreas} />}
              <ActivityTimeline merchantId={data.merchant.id} />
            </div>

            {/* Right: sidebar */}
            <div className="space-y-6">
              {data.checklist && (
                <ChecklistSummary
                  checklist={data.checklist}
                  highlight={failedGates ?? undefined}
                />
              )}
              {can('merchant:suspend') && (
                <MerchantLifecycleCard
                  status={data.merchant.status}
                  onSuspend={() => setOpenDialog('suspend')}
                  onReactivate={() => setOpenDialog('reactivate')}
                />
              )}
              <ProfileCard merchant={data.merchant} owner={data.owner} />
            </div>
          </div>

          {/* ActionBar — full width, below the two-column grid */}
          <div
            className="rounded-lg border border-border bg-card overflow-hidden"
            data-testid="action-bar-container"
          >
            <ActionBar
              approval={data.approval}
              adminId={adminId}
              role={role}
              can={can}
              onRequestChanges={() => { setFailedGates(null); setOpenDialog('request-changes') }}
              onReject={() => { setFailedGates(null); setOpenDialog('reject') }}
              onApprove={() => { setFailedGates(null); setOpenDialog('approve') }}
              claim={claimMutation}
              release={releaseMutation}
            />
          </div>
        </div>
      )}

      {/* Dialogs — rendered outside the content tree so they portal correctly */}
      {openDialog === 'request-changes' && (
        <RequestChangesDialog
          approvalId={id}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
        />
      )}
      {openDialog === 'reject' && (
        <RejectDialog
          approvalId={id}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
        />
      )}
      {openDialog === 'approve' && (
        <ApproveConfirm
          approvalId={id}
          onSuccess={() => {
            setFailedGates(null)
            handleDialogSuccess()
          }}
          onCancel={() => setOpenDialog(null)}
          onGateFail={(gates) => {
            setFailedGates(gates)
            // Keep the dialog open so the banner is visible; page already refreshed
            // (mutation onError invalidated queries).
          }}
        />
      )}

      {/* M6: merchant lifecycle dialogs; only mount when the merchant is present. */}
      {openDialog === 'suspend' && data?.merchant && (
        <SuspendDialog
          merchantId={data.merchant.id}
          approvalId={id}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
        />
      )}
      {openDialog === 'reactivate' && data?.merchant && (
        <ReactivateConfirm
          merchantId={data.merchant.id}
          approvalId={id}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
        />
      )}

      {/* M6: confirm-location dialog, keyed to a specific branch id. */}
      {confirmLocationBranchId && data?.branches && (() => {
        const branch = data.branches.find((b) => b.id === confirmLocationBranchId)
        if (!branch) return null
        return (
          <ConfirmLocationDialog
            branchId={branch.id}
            branchName={branch.name}
            approvalId={id}
            onSuccess={() => {
              setConfirmLocationBranchId(null)
              refetch()
            }}
            onCancel={() => setConfirmLocationBranchId(null)}
          />
        )
      })()}
    </div>
  )
}
