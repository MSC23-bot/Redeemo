/**
 * ActionBar — claim-to-act state machine for the approval review screen.
 *
 * Gated on can('approval:action'); renders nothing if the admin lacks this cap.
 *
 * B2 (approval-queue-spec.md §A.2/§C.1): aligns the four claim states to the
 * spec's sticky action-bar copy + layout. The bar itself is made visually
 * sticky by its mounting container in page.tsx (`sticky bottom-0`); this
 * component only owns the per-state content, unchanged from M5:
 *
 *   APPROVED -> calm terminal note
 *   REJECTED -> calm terminal note
 *   CHANGES_REQUESTED -> waiting-on-merchant note (no actions)
 *   PENDING / unclaimed -> "Claim to act" (primary)
 *   PENDING / claimed-by-me -> honesty-lock hint + [Request changes] [Reject] [Approve and go live]
 *   PENDING / claimed-by-other -> read-only note "Claimed by <name>, {age} ago" +
 *     the SAME action set rendered DISABLED (spec §C.1: "Action buttons
 *     rendered DISABLED", so an operator can see what they would be able to
 *     do once the claim is released — not merely a blank space)
 *   PENDING / claimed-by-other (SUPER_ADMIN only) -> same, PLUS a functional
 *     "Force-release" button
 *
 * Claim SEMANTICS are unchanged from M5: the claimer's own Release stays in
 * the page topbar (page.tsx's `showTopbarRelease`), which is gated only on
 * "is the claimer" — NOT on approval:action. Moving it into this
 * capability-gated component would silently narrow who can release their own
 * claim (an authz behaviour change), so it deliberately stays put; the
 * SUPER_ADMIN Force-release stays here, as before, since force-releasing
 * someone ELSE's claim is already gated on approval:action via this
 * component's own top-level capability check.
 */
import { formatWaiting } from '@/lib/queue/urgency'
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

// ── Claimer initials avatar (mirrors QueueTable's MerchantAvatar pattern) ────

function ClaimerAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
    >
      {initials || '?'}
    </span>
  )
}

// ── The primary/reject/request-changes action set — shared between the
//    claimed-by-me (enabled) and claimed-by-other (disabled) blocks so the
//    two states never drift from each other's button labels/order. ───────────

function ActionSet({
  disabled,
  onRequestChanges,
  onReject,
  onApprove,
}: {
  disabled: boolean
  onRequestChanges: () => void
  onReject: () => void
  onApprove: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={onRequestChanges}
        disabled={disabled}
        aria-disabled={disabled}
        data-testid="action-bar-request-changes-btn"
      >
        Request changes
      </Button>
      <Button
        type="button"
        variant="destructive"
        onClick={onReject}
        disabled={disabled}
        aria-disabled={disabled}
        data-testid="action-bar-reject-btn"
      >
        Reject
      </Button>
      <Button
        type="button"
        onClick={onApprove}
        disabled={disabled}
        aria-disabled={disabled}
        data-testid="action-bar-approve-btn"
      >
        Approve and go live
      </Button>
    </div>
  )
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

  const { status, claimedBy, claimedAt } = approval
  const isSuperAdmin = role === 'SUPER_ADMIN'
  const claimedByMe = claimedBy?.id === adminId

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
    // Unclaimed (spec §C.1 rvUnclaimed): a single "Claim to act" button.
    return (
      <div
        className="flex items-center justify-between border-t border-border px-6 py-4"
        data-testid="action-bar-unclaimed"
      >
        <p className="text-sm text-muted-foreground">
          Claim this item to take action. Claims are exclusive to one operator.
        </p>
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            onClick={() => claim.mutate()}
            disabled={claim.isPending}
            data-testid="action-bar-claim-btn"
          >
            {claim.isPending ? 'Claiming...' : 'Claim to act'}
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
    // Claimed by me (spec §C.1 rvMe): honesty-lock hint + the full action set.
    return (
      <div
        className="border-t border-border bg-secondary/10 px-6 py-4"
        data-testid="action-bar-claimed-by-me"
      >
        <p className="mb-3 text-xs text-muted-foreground">
          You claimed this. A single operator can claim and approve today; a separate
          countersigner is not yet enforced.
        </p>
        <ActionSet
          disabled={false}
          onRequestChanges={onRequestChanges}
          onReject={onReject}
          onApprove={onApprove}
        />
      </div>
    )
  }

  // Claimed by another admin (spec §C.1 rvOther): read-only note + the SAME
  // action set rendered disabled, so the operator can see what they would be
  // able to do once the claim is released, rather than a blank space.
  const claimerName = claimedBy?.name ?? 'another admin'
  const claimedAgo = claimedAt ? formatWaiting(claimedAt) : null
  return (
    <div
      className="border-t border-border px-6 py-4"
      data-testid="action-bar-claimed-by-other"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClaimerAvatar name={claimerName} />
          <span>
            Claimed by{' '}
            <span className="font-medium text-foreground" data-testid="action-bar-claimer-name">
              {claimerName}
            </span>
            {claimedAgo && <> {claimedAgo} ago</>}. Only the claimer or a Super Admin can release
            it; you cannot act or steal the claim.
          </span>
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
      {/* Spec §C.1: "Action buttons rendered DISABLED (opacity:.5;pointer-events:none)".
          The shared Button variant already applies exactly that pair via its own
          `disabled:opacity-50 disabled:pointer-events-none` classes on `disabled`.
          Left in the accessibility tree (not aria-hidden): the native `disabled`
          attribute alone correctly communicates "cannot activate" to AT users,
          while still surfacing what they would be able to do once released. */}
      <ActionSet disabled onRequestChanges={onRequestChanges} onReject={onReject} onApprove={onApprove} />
    </div>
  )
}
