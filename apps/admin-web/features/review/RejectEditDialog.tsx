/**
 * RejectEditDialog (Option B B1): admin rejects a merchant-requested identity edit.
 *
 * Rejecting touches NO live data, so there is no consequence checkbox (unlike
 * the onboarding reject). A reason is mandatory (soft minimum 15 chars) and is
 * emailed to the merchant. On error: NamedGateBanner inside the dialog.
 */
'use client'

import { useRef, useState } from 'react'
import { useRejectEdit } from '@/lib/review/useEditReview'
import { NamedGateBanner } from './NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const SOFT_MIN = 15

interface RejectEditDialogProps {
  approvalId: string
  onSuccess: () => void
  onCancel: () => void
}

export function RejectEditDialog({ approvalId, onSuccess, onCancel }: RejectEditDialogProps) {
  const [reason, setReason] = useState('')
  const mutation = useRejectEdit(approvalId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const trimmed = reason.trim()
  const belowMin = trimmed.length < SOFT_MIN
  const canSubmit = !belowMin && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync(trimmed)
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Reject edit"
      onClose={onCancel}
      scrimTestId="reject-edit-scrim"
      panelTestId="reject-edit-dialog"
      initialFocusRef={textareaRef}
    >
      <h2 className="mb-4 text-base font-semibold text-foreground">Reject edit</h2>

      <label
        htmlFor="reject-edit-reason"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        Reason for rejecting (sent to the merchant by email)
      </label>
      <textarea
        id="reject-edit-reason"
        ref={textareaRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain clearly why this change cannot be applied. The merchant's listing will not change."
        rows={4}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="reject-edit-reason-textarea"
      />

      {belowMin && trimmed.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground" data-testid="reject-edit-min-nudge">
          Add a little more detail so the merchant understands.
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground" data-testid="reject-edit-helper">
        The live listing is not changed. This message is emailed to the merchant.
      </p>

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="reject-edit-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="reject-edit-submit"
        >
          {mutation.isPending ? 'Rejecting...' : 'Reject edit'}
        </Button>
      </div>
    </Dialog>
  )
}
