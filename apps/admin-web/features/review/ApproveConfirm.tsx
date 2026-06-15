/**
 * ApproveConfirm — admin approves a merchant application and takes them live.
 *
 * Serious-tone dialog explaining the consequences of approve.
 * On a failed approve (ONBOARDING_GATES_INCOMPLETE, etc.): shows NamedGateBanner
 * inside and calls onGateFail so the parent can highlight the failed checklist rows.
 * On success: calls onSuccess (parent closes, refetch reflects live state).
 * Never optimistically marks approved.
 *
 * Accessible via the shared Dialog primitive: role=dialog, aria-label,
 * focus-on-open (Cancel), Escape + scrim close, Tab focus-trap, focus-restore.
 */
'use client'

import { useRef } from 'react'
import { useApprove } from '@/lib/review/useReviewActions'
import { NamedGateBanner, failedChecklistGates } from './NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type FailedGates = { branch_created?: boolean; contract_signed?: boolean; rmv_configured?: boolean }

interface ApproveConfirmProps {
  approvalId: string
  onSuccess: () => void
  onCancel: () => void
  /** Called when the server rejects with ONBOARDING_GATES_INCOMPLETE; passes the failed gate flags. */
  onGateFail?: (gates: FailedGates) => void
}

export function ApproveConfirm({
  approvalId,
  onSuccess,
  onCancel,
  onGateFail,
}: ApproveConfirmProps) {
  const mutation = useApprove(approvalId)
  const cancelRef = useRef<HTMLButtonElement>(null)

  async function handleApprove() {
    if (mutation.isPending) return
    try {
      await mutation.mutateAsync()
      onSuccess()
    } catch (err) {
      const gates = failedChecklistGates(err)
      if (gates && onGateFail) {
        onGateFail(gates)
      }
    }
  }

  return (
    <Dialog
      label="Approve and go live?"
      onClose={onCancel}
      scrimTestId="approve-scrim"
      panelTestId="approve-confirm-dialog"
      initialFocusRef={cancelRef}
    >
      <h2 className="mb-3 text-base font-semibold text-foreground">Approve and go live?</h2>

      <p
        id="approve-consequences-copy"
        className="text-sm text-foreground"
        data-testid="approve-consequences-copy"
      >
        The server re-checks every go-live gate, activates the 2 mandatory RMV vouchers,
        emails the owner that they are live, and makes this merchant visible to customers.
      </p>

      {/* Error banner (only shown after a failed attempt) */}
      {mutation.error && (
        <div className="mt-4" data-testid="approve-error-banner">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <Button
          ref={cancelRef}
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="approve-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleApprove}
          disabled={mutation.isPending}
          aria-describedby="approve-consequences-copy"
          data-testid="approve-submit"
        >
          {mutation.isPending ? 'Approving...' : 'Approve and go live'}
        </Button>
      </div>
    </Dialog>
  )
}
