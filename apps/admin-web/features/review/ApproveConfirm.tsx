/**
 * ApproveConfirm — admin approves a merchant application and takes them live.
 *
 * Serious-tone dialog explaining the consequences of approve.
 * On a failed approve (ONBOARDING_GATES_INCOMPLETE, etc.): shows NamedGateBanner
 * inside and calls onGateFail so the parent can highlight the failed checklist rows.
 * On success: calls onSuccess (parent closes, refetch reflects live state).
 * Never optimistically marks approved.
 */
'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useApprove } from '@/lib/review/useReviewActions'
import { NamedGateBanner, failedChecklistGates } from './NamedGateBanner'
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

  // Move focus to Cancel (the safe default) when the dialog opens, so keyboard
  // focus does not stay on the trigger behind the scrim.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onCancel}
        data-testid="approve-scrim"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-label="Approve and go live?"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl"
        data-testid="approve-confirm-dialog"
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
      </div>
    </div>
  )
}
