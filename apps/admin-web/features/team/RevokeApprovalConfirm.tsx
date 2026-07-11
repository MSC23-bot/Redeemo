'use client'

/**
 * RevokeApprovalConfirm: SUPER_ADMIN revokes the `approval:action` capability
 * from an admin (Team & Roles S2).
 *
 * Honest effect-timing note (spec §3.3 escape hatch): unlike a grant, a revoke
 * ALSO revokes the grantee's sessions, so it takes effect on their very next
 * request, not merely at their next token refresh.
 */
import { useRef } from 'react'
import { useRevokeCapability } from '@/lib/team/useTeam'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { TeamAdmin } from '@/lib/api/team'

interface RevokeApprovalConfirmProps {
  admin: TeamAdmin
  onSuccess: () => void
  onCancel: () => void
}

export function RevokeApprovalConfirm({ admin, onSuccess, onCancel }: RevokeApprovalConfirmProps) {
  const mutation = useRevokeCapability(admin.id)
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
      label="Revoke approval capability"
      onClose={onCancel}
      scrimTestId="revoke-approval-scrim"
      panelTestId="revoke-approval-dialog"
      initialFocusRef={cancelRef}
    >
      <h2 className="mb-3 text-base font-semibold text-foreground">
        Remove {admin.name}&apos;s ability to approve merchants?
      </h2>

      <p className="text-sm text-foreground" data-testid="revoke-approval-consequence-copy">
        They will no longer be able to approve any merchant. This takes effect immediately: they
        are signed out of their current session and must sign in again.
      </p>

      {mutation.error && (
        <div className="mt-4" data-testid="revoke-approval-error-banner">
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
          data-testid="revoke-approval-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleConfirm}
          disabled={mutation.isPending}
          data-testid="revoke-approval-submit"
        >
          {mutation.isPending ? 'Revoking...' : 'Revoke approval'}
        </Button>
      </div>
    </Dialog>
  )
}
