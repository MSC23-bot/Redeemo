/**
 * ActionBar — claim-to-act state machine for the approval review screen.
 *
 * Gated on can('approval:action'); renders nothing if the admin lacks this cap.
 *
 * States:
 *   APPROVED -> calm terminal note
 *   REJECTED -> calm terminal note
 *   CHANGES_REQUESTED -> waiting-on-merchant note (no actions)
 *   PENDING / unclaimed -> "Claim and review" (primary)
 *   PENDING / claimed-by-me -> hint line + [Request changes] [Reject] [Approve and go live]
 *   PENDING / claimed-by-other (OPERATIONS) -> read-only note "Claimed by <name>"
 *   PENDING / claimed-by-other (SUPER_ADMIN) -> same note + "Force-release" button
 *
 * The claimer's own Release lives in the page topbar (see page.tsx).
 * The SUPER_ADMIN Force-release lives here so it is separate from the topbar Release.
 */
import type { ReviewApproval } from '@/lib/api/review'
import type { AdminRole, AdminCapability } from '@/lib/auth/session'
import type { UseMutationResult } from '@tanstack/react-query'
import type { ClaimResponse, ReleaseResponse } from '@/lib/api/approvals'
import { NamedGateBanner } from './NamedGateBanner'
import { Button } from '@/components/ui/button'

interface ActionBarProps {
  approval: ReviewApproval
  adminId: string | null
  role: AdminRole | null
  can: (cap: AdminCapability) => boolean
  onRequestChanges: () => void
  onReject: () => void
  onApprove: () => void
  claim: UseMutationResult<ClaimResponse, Error, void>
  release: UseMutationResult<ReleaseResponse, Error, void>
}

export function ActionBar({
  approval,
  adminId,
  role,
  can,
  onRequestChanges,
  onReject,
  onApprove,
  claim,
  release,
}: ActionBarProps) {
  // Capability gate: render nothing if the admin cannot action approvals.
  if (!can('approval:action')) return null

  const { status, claimedBy } = approval
  const isSuperAdmin = role === 'SUPER_ADMIN'
  const claimedByMe = claimedBy?.id === adminId
  const claimedByOther = claimedBy != null && !claimedByMe

  // Terminal states: no actions.
  if (status === 'APPROVED') {
    return (
      <div
        className="border-t border-border px-6 py-4 text-sm text-muted-foreground"
        data-testid="action-bar-approved"
      >
        This onboarding application was approved.
      </div>
    )
  }

  if (status === 'REJECTED') {
    return (
      <div
        className="border-t border-border px-6 py-4 text-sm text-muted-foreground"
        data-testid="action-bar-rejected"
      >
        This application was rejected.
      </div>
    )
  }

  if (status === 'CHANGES_REQUESTED') {
    return (
      <div
        className="border-t border-border px-6 py-4 text-sm text-muted-foreground"
        data-testid="action-bar-changes-requested"
      >
        Waiting on the merchant to make changes and resubmit.
      </div>
    )
  }

  // PENDING: branch on claim state.

  if (claimedBy == null) {
    // Unclaimed: single claim button.
    return (
      <div
        className="flex items-center justify-between border-t border-border px-6 py-4"
        data-testid="action-bar-unclaimed"
      >
        <p className="text-sm text-muted-foreground">
          Claim this approval to begin your review.
        </p>
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            onClick={() => claim.mutate()}
            disabled={claim.isPending}
            data-testid="action-bar-claim-btn"
          >
            {claim.isPending ? 'Claiming...' : 'Claim and review'}
          </Button>
          {claim.error && (
            <div data-testid="action-bar-claim-error">
              <NamedGateBanner error={claim.error} />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (claimedByMe) {
    // Claimed by me: full action bar.
    return (
      <div
        className="border-t border-border bg-secondary/10 px-6 py-4"
        data-testid="action-bar-claimed-by-me"
      >
        <p className="mb-3 text-xs text-muted-foreground">
          Approving re-checks gates server-side, activates RMVs, and emails the owner.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onRequestChanges}
            data-testid="action-bar-request-changes-btn"
          >
            Request changes
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onReject}
            data-testid="action-bar-reject-btn"
          >
            Reject
          </Button>
          <Button
            type="button"
            onClick={onApprove}
            data-testid="action-bar-approve-btn"
          >
            Approve and go live
          </Button>
        </div>
      </div>
    )
  }

  // Claimed by another admin.
  const claimerName = claimedBy?.name ?? 'another admin'
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4"
      data-testid="action-bar-claimed-by-other"
    >
      <p className="text-sm text-muted-foreground">
        Claimed by{' '}
        <span className="font-medium text-foreground" data-testid="action-bar-claimer-name">
          {claimerName}
        </span>{' '}
        for review.
      </p>
      {isSuperAdmin && (
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => release.mutate()}
            disabled={release.isPending}
            data-testid="action-bar-force-release-btn"
          >
            {release.isPending ? 'Releasing...' : 'Force-release'}
          </Button>
          {release.error && (
            <div data-testid="action-bar-release-error">
              <NamedGateBanner error={release.error} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
