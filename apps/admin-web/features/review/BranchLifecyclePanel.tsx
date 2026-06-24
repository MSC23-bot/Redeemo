'use client'

/**
 * BranchLifecyclePanel (Branches PR-5, D5): self-contained review surface for a
 * BRANCH_CREATE / BRANCH_CLOSE approval. Owns the review fetch + the
 * confirm-location / Approve / Reject dialog state, so the queue review page only
 * has to branch on the approval type and mount this. Mirrors EditReviewPanel /
 * VoucherReviewPanel.
 *
 * CREATE: shows the proposed branch (name / address / contact / location) + a
 *   location-confirm step (reuse the M6 confirm-location flow). Approve is GATED
 *   until the location is confirmed (POSTCODE_CENTROID / NEEDS_REVIEW -> show the
 *   Confirm-location button; the backend also re-checks and surfaces
 *   MAIN_BRANCH_LOCATION_UNCONFIRMED in the confirm dialog).
 * CLOSE: shows the branch + the merchant's close reason. Approve deactivates the
 *   branch; Reject reverts it to LIVE.
 *
 * The data read uses approval:read (canRead, gated upstream); the Confirm-location
 * action is gated on branch:confirm-location (canConfirmLocation); the
 * Approve/Reject actions are gated on approval:apply-edit (canApplyEdit). The
 * backend is the real authority for all three.
 *
 * NEVER renders a branch redemptionPin (the read shape does not carry one).
 */
import { useState } from 'react'
import { Loader2, AlertCircle, MapPin } from 'lucide-react'
import { useBranchLifecycleReview } from '@/lib/review/useBranchLifecycleReview'
import { Badge } from '@/features/shared/Badge'
import type { BadgeTone } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import type { BranchLifecycleReviewContext, BranchLifecycleReviewBranch } from '@/lib/api/branchLifecycleReview'
import { ApproveBranchLifecycleConfirm } from './ApproveBranchLifecycleConfirm'
import { RejectBranchLifecycleDialog } from './RejectBranchLifecycleDialog'
import { BranchLifecycleConfirmLocationDialog } from './BranchLifecycleConfirmLocationDialog'

interface BranchLifecyclePanelProps {
  approvalId: string
  /** ready && can('approval:read'): gates the data fetch. */
  canRead: boolean
  /** can('approval:apply-edit'): gates the Approve/Reject actions. */
  canApplyEdit: boolean
  /** can('branch:confirm-location'): gates the CREATE confirm-location step. */
  canConfirmLocation: boolean
}

type OpenDialog = 'approve' | 'reject' | 'confirm-location' | null

// A confirmed location is in CONFIRMED_LOCATION_SET (mirror of the backend's
// single source of truth in src/api/shared/location.ts). A CREATE approve is
// blocked client-side until the branch reaches one of these; the backend
// re-checks and surfaces MAIN_BRANCH_LOCATION_UNCONFIRMED as defence-in-depth.
const CONFIRMED_LOCATION_SET = ['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED']

function isLocationConfirmed(confidence: string): boolean {
  return CONFIRMED_LOCATION_SET.includes(confidence)
}

function locationConfidenceTone(confidence: string): BadgeTone {
  if (confidence === 'MANUALLY_CONFIRMED') return 'success'
  if (confidence === 'ADDRESS_GEOCODED') return 'info'
  if (confidence === 'POSTCODE_CENTROID') return 'warn'
  return 'neutral'
}

function locationConfidenceLabel(confidence: string): string {
  const map: Record<string, string> = {
    MANUALLY_CONFIRMED: 'Confirmed',
    ADDRESS_GEOCODED: 'Geocoded',
    POSTCODE_CENTROID: 'Postcode centroid',
    NEEDS_REVIEW: 'Needs review',
    UNKNOWN: 'Unknown',
  }
  return map[confidence] ?? confidence
}

function formatAddress(branch: BranchLifecycleReviewBranch): string {
  return [branch.addressLine1, branch.addressLine2, branch.city, branch.postcode]
    .filter(Boolean)
    .join(', ')
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

export function BranchLifecyclePanel({
  approvalId,
  canRead,
  canApplyEdit,
  canConfirmLocation,
}: BranchLifecyclePanelProps) {
  const { data, isLoading, isError, refetch } = useBranchLifecycleReview(approvalId, canRead)
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null)

  function handleDialogSuccess() {
    setOpenDialog(null)
    refetch()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="branch-lifecycle-loading">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading branch review" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
        data-testid="branch-lifecycle-error"
      >
        <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
        <p className="mb-4 text-sm text-destructive">
          Could not load this branch request. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={refetch}
          className="text-sm font-medium text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  const { kind, branch } = data
  const isCreate = kind === 'create'
  const confirmed = isLocationConfirmed(branch.locationConfidence)
  // For a CREATE, Approve is blocked until the location is confirmed.
  const approveBlockedByLocation = isCreate && !confirmed

  return (
    <div className="space-y-6">
      <BranchLifecycleCard
        context={data}
        approveBlockedByLocation={approveBlockedByLocation}
        canConfirmLocation={canConfirmLocation}
        canApplyEdit={canApplyEdit}
        onConfirmLocation={() => setOpenDialog('confirm-location')}
        onApprove={() => setOpenDialog('approve')}
        onReject={() => setOpenDialog('reject')}
      />

      {openDialog === 'approve' && (
        <ApproveBranchLifecycleConfirm
          approvalId={approvalId}
          kind={kind}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
        />
      )}
      {openDialog === 'reject' && (
        <RejectBranchLifecycleDialog
          approvalId={approvalId}
          kind={kind}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
        />
      )}
      {openDialog === 'confirm-location' && (
        <BranchLifecycleConfirmLocationDialog
          approvalId={approvalId}
          branchId={branch.id}
          branchName={branch.name}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
        />
      )}
    </div>
  )
}

// ── The card ──────────────────────────────────────────────────────────────────

interface BranchLifecycleCardProps {
  context: BranchLifecycleReviewContext
  approveBlockedByLocation: boolean
  canConfirmLocation: boolean
  canApplyEdit: boolean
  onConfirmLocation: () => void
  onApprove: () => void
  onReject: () => void
}

function BranchLifecycleCard({
  context,
  approveBlockedByLocation,
  canConfirmLocation,
  canApplyEdit,
  onConfirmLocation,
  onApprove,
  onReject,
}: BranchLifecycleCardProps) {
  const { kind, branch, merchant, closeReason } = context
  const isCreate = kind === 'create'

  return (
    <div className="rounded-lg border border-border bg-card p-6" data-testid="branch-lifecycle-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {isCreate ? 'New branch request' : 'Branch close request'}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground" data-testid="branch-lifecycle-merchant-name">
            {merchant.businessName}
          </p>
        </div>
        <span data-testid="branch-lifecycle-kind-badge">
          <Badge tone={isCreate ? 'info' : 'warn'}>
            {isCreate ? 'Add branch' : 'Close branch'}
          </Badge>
        </span>
      </div>

      {/* Branch detail */}
      <div className="divide-y divide-border rounded-md border border-border" data-testid="branch-lifecycle-detail">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="font-medium text-foreground" data-testid="branch-lifecycle-branch-name">
            {branch.name}
          </span>
          {branch.isMainBranch && <Badge tone="info">Main</Badge>}
        </div>
        <div className="px-4">
          <DetailRow label="Address" value={formatAddress(branch)} />
          <DetailRow label="Locality" value={branch.localityName} />
          <DetailRow label="Phone" value={branch.phone} />
          <DetailRow label="Email" value={branch.email} />
          <DetailRow label="Website" value={branch.websiteUrl} />
        </div>
      </div>

      {/* CREATE: location confirmation step */}
      {isCreate && (
        <div
          className="mt-5 rounded-md border border-border bg-secondary/20 px-4 py-3"
          data-testid="branch-lifecycle-location-step"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">Location</span>
              <Badge tone={locationConfidenceTone(branch.locationConfidence)}>
                {locationConfidenceLabel(branch.locationConfidence)}
              </Badge>
            </div>
            {canConfirmLocation && approveBlockedByLocation && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={onConfirmLocation}
                data-testid="branch-lifecycle-confirm-location-btn"
              >
                Confirm location
              </Button>
            )}
          </div>
          {approveBlockedByLocation && (
            <p
              className="mt-2 text-xs text-muted-foreground"
              data-testid="branch-lifecycle-location-gate-note"
            >
              Confirm the precise branch location before approving. The branch cannot go live with an
              unconfirmed location.
            </p>
          )}
        </div>
      )}

      {/* CLOSE: the merchant's close reason */}
      {!isCreate && (
        <div className="mt-5" data-testid="branch-lifecycle-close-reason">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Close reason
          </p>
          <p className="text-sm text-foreground" data-testid="branch-lifecycle-close-reason-text">
            {closeReason && closeReason.trim().length > 0
              ? closeReason
              : 'No reason was provided.'}
          </p>
        </div>
      )}

      {/* Actions: gated on approval:apply-edit. Hidden entirely without the cap. */}
      {canApplyEdit && (
        <div className="mt-6 flex flex-col items-end gap-2" data-testid="branch-lifecycle-actions">
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onReject}
              data-testid="branch-lifecycle-reject-btn"
            >
              {isCreate ? 'Reject branch' : 'Reject close'}
            </Button>
            <Button
              type="button"
              onClick={onApprove}
              disabled={approveBlockedByLocation}
              data-testid="branch-lifecycle-approve-btn"
            >
              {isCreate ? 'Approve branch' : 'Approve close'}
            </Button>
          </div>
          {approveBlockedByLocation && (
            <p
              className="text-xs text-muted-foreground"
              data-testid="branch-lifecycle-approve-blocked-note"
            >
              Confirm the location first to enable approval.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
