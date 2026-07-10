'use client'

/**
 * DeactivateConfirm: SUPER_ADMIN deactivates an admin account (Team & Roles S2).
 *
 * Serious-consequence confirm dialog (no reason field — the backend route
 * takes none). Deactivation is immediate: it denies refresh and revokes every
 * session (H4), so the account is fully cut off within moments, not just at
 * the token's TTL. Self-deactivation is disallowed: the roster row's
 * Deactivate button is already disabled with a visible reason on the
 * signed-in admin's own row (the primary gate), and the backend's
 * ADMIN_SELF_ACTION_FORBIDDEN (400) is the defence-in-depth backstop should
 * this dialog ever be reached for that row.
 */
import { useRef } from 'react'
import { useDeactivateAdmin } from '@/lib/team/useTeam'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { TeamAdmin } from '@/lib/api/team'

interface DeactivateConfirmProps {
  admin: TeamAdmin
  onSuccess: () => void
  onCancel: () => void
}

export function DeactivateConfirm({ admin, onSuccess, onCancel }: DeactivateConfirmProps) {
  const mutation = useDeactivateAdmin(admin.id)
  const cancelRef = useRef<HTMLButtonElement>(null)

  async function handleConfirm() {
    if (mutation.isPending) return
    try {
      await mutation.mutateAsync()
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Deactivate admin account"
      onClose={onCancel}
      scrimTestId="deactivate-admin-scrim"
      panelTestId="deactivate-admin-dialog"
      initialFocusRef={cancelRef}
    >
      <h2 className="mb-3 text-base font-semibold text-foreground">Deactivate {admin.name}?</h2>

      <div
        className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        data-testid="deactivate-admin-consequence-copy"
      >
        This immediately signs {admin.name} out everywhere and blocks them from signing back in.
        This does not delete their account or history.
      </div>

      {mutation.error && (
        <div className="mt-4" data-testid="deactivate-admin-error-banner">
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
          data-testid="deactivate-admin-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleConfirm}
          disabled={mutation.isPending}
          data-testid="deactivate-admin-submit"
        >
          {mutation.isPending ? 'Deactivating...' : 'Deactivate account'}
        </Button>
      </div>
    </Dialog>
  )
}
