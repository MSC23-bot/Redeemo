/**
 * ApproveEditConfirm (Option B B1 + Branches PR-3): admin applies a
 * merchant-requested identity OR photo edit to the live listing.
 *
 * The server applies ONLY the allow-listed fields (identity) or the photo delta
 * (PR-3: add URLs become APPROVED BranchPhoto rows, remove IDs deleted) and emails
 * the merchant owner. On a state error (APPROVAL_NOT_ACTIONABLE /
 * PENDING_EDIT_NOT_ACTIONABLE): NamedGateBanner inside. The legacy
 * EDIT_PHOTO_APPLY_NOT_SUPPORTED code is no longer thrown for a photo approve
 * (PR-3 closed it); its NamedGateBanner mapping stays defined for safety. Never
 * optimistically marks applied.
 *
 * Voucher governed-flows PR-B: also reused for VOUCHER_EDIT approve, with
 * `title` / `consequenceCopy` overridden by the caller for CHANGE vs END copy
 * (defaults below are unchanged for the identity-edit lane).
 */
'use client'

import { useRef } from 'react'
import { useApproveEdit } from '@/lib/review/useEditReview'
import { NamedGateBanner } from './NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const DEFAULT_TITLE = 'Apply this change?'
const DEFAULT_CONSEQUENCE_COPY =
  'The requested fields are applied to the live listing and the merchant owner is emailed. ' +
  'Only the fields shown in the diff are changed.'

interface ApproveEditConfirmProps {
  approvalId: string
  onSuccess: () => void
  onCancel: () => void
  /** Dialog title + aria-label. Defaults to "Apply this change?". */
  title?: string
  /** Consequence copy shown above the actions. Defaults to the identity-edit text. */
  consequenceCopy?: string
}

export function ApproveEditConfirm({
  approvalId,
  onSuccess,
  onCancel,
  title = DEFAULT_TITLE,
  consequenceCopy = DEFAULT_CONSEQUENCE_COPY,
}: ApproveEditConfirmProps) {
  const mutation = useApproveEdit(approvalId)
  const cancelRef = useRef<HTMLButtonElement>(null)

  async function handleApprove() {
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
      label={title}
      onClose={onCancel}
      scrimTestId="approve-edit-scrim"
      panelTestId="approve-edit-confirm-dialog"
      initialFocusRef={cancelRef}
    >
      <h2 className="mb-3 text-base font-semibold text-foreground">{title}</h2>

      <p
        id="approve-edit-consequences-copy"
        className="text-sm text-foreground"
        data-testid="approve-edit-consequences-copy"
      >
        {consequenceCopy}
      </p>

      {mutation.error && (
        <div className="mt-4" data-testid="approve-edit-error-banner">
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
          data-testid="approve-edit-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleApprove}
          disabled={mutation.isPending}
          aria-describedby="approve-edit-consequences-copy"
          data-testid="approve-edit-submit"
        >
          {mutation.isPending ? 'Applying...' : 'Apply change'}
        </Button>
      </div>
    </Dialog>
  )
}
