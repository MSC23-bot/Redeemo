'use client'

/**
 * GrantApprovalConfirm: SUPER_ADMIN grants the curated `approval:action`
 * capability to an admin (Team & Roles S2).
 *
 * Plain-language consequence copy (per spec §5.1): the grant applies to ANY
 * merchant, not just ones the grantee created themselves; a self-approval is
 * always allowed but always visibly audited (no separation-of-duties block).
 * Honest effect-timing note (spec §3.3): a grant is NOT session-revoked, so it
 * applies once their session next refreshes (within about 15 minutes).
 */
import { useRef } from 'react'
import { useGrantCapability } from '@/lib/team/useTeam'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { TeamAdmin } from '@/lib/api/team'

interface GrantApprovalConfirmProps {
  admin: TeamAdmin
  onSuccess: () => void
  onCancel: () => void
}

export function GrantApprovalConfirm({ admin, onSuccess, onCancel }: GrantApprovalConfirmProps) {
  const mutation = useGrantCapability(admin.id)
  const cancelRef = useRef<HTMLButtonElement>(null)

  async function handleConfirm() {
    if (mutation.isPending) return
    try {
      await mutation.mutateAsync('approval:action')
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Grant approval capability"
      onClose={onCancel}
      scrimTestId="grant-approval-scrim"
      panelTestId="grant-approval-dialog"
      initialFocusRef={cancelRef}
    >
      <h2 className="mb-3 text-base font-semibold text-foreground">
        Grant {admin.name} the ability to approve merchants?
      </h2>

      <p className="text-sm text-foreground" data-testid="grant-approval-consequence-copy">
        This lets them approve any merchant, not just ones they created themselves. Self-approvals
        are always audited: if they approve a merchant they onboarded, that is visibly flagged in
        the audit trail, never hidden.
      </p>

      <p className="mt-3 text-xs text-muted-foreground" data-testid="grant-approval-timing-note">
        This applies once their session next refreshes (within about 15 minutes), not necessarily
        immediately.
      </p>

      {mutation.error && (
        <div className="mt-4" data-testid="grant-approval-error-banner">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button
          ref={cancelRef}
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="grant-approval-cancel"
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={mutation.isPending} data-testid="grant-approval-submit">
          {mutation.isPending ? 'Granting...' : 'Grant approval'}
        </Button>
      </div>
    </Dialog>
  )
}
