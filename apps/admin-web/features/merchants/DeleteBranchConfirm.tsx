'use client'

/**
 * DeleteBranchConfirm: a SUPER_ADMIN soft-deletes a branch on the merchant's
 * behalf (Option B B2.4-web).
 *
 * This is a DESTRUCTIVE action: it permanently removes the branch AND deactivates
 * its staff logins. The dialog DISCLOSES that cascade and requires a mandatory
 * reason; Save is disabled until the reason is non-empty and not pending. On
 * error: NamedGateBanner (BRANCH_IS_MAIN / BRANCH_LAST_ACTIVE / BRANCH_NOT_FOUND).
 *
 * The Delete affordance that opens this is gated on merchant:manage-branches
 * (SUPER_ADMIN) and hidden on the main branch; the backend route is the real
 * enforcement.
 */
import { useState } from 'react'
import { useDeleteBranch } from '@/lib/merchants/useMerchantActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DeleteBranchConfirmProps {
  branchId: string
  branchName: string
  merchantId: string
  onSuccess: () => void
  onCancel: () => void
}

export function DeleteBranchConfirm({ branchId, branchName, merchantId, onSuccess, onCancel }: DeleteBranchConfirmProps) {
  const [reason, setReason] = useState('')
  const mutation = useDeleteBranch(merchantId)

  const canSubmit = reason.trim().length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync({ branchId, reason: reason.trim() })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog label="Delete branch" onClose={onCancel} scrimTestId="delete-branch-scrim" panelTestId="delete-branch-confirm">
      <h2 className="mb-1 text-base font-semibold text-foreground">Delete branch</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Recorded in the audit log as an admin change on the merchant&apos;s behalf.
      </p>

      <div
        className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground"
        data-testid="delete-branch-warning"
      >
        Deleting <span className="font-medium">{branchName}</span> permanently removes the branch and
        deactivates its staff logins. This cannot be undone.
      </div>

      <label htmlFor="delete-branch-reason" className="mb-1.5 mt-4 block text-sm font-medium text-foreground">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="delete-branch-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are deleting this branch on the merchant's behalf."
        rows={2}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="delete-branch-reason"
      />

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending} data-testid="delete-branch-cancel">
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={handleSubmit} disabled={!canSubmit} data-testid="delete-branch-submit">
          {mutation.isPending ? 'Deleting...' : 'Delete branch'}
        </Button>
      </div>
    </Dialog>
  )
}
