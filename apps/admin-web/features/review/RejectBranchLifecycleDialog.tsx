'use client'

/**
 * RejectBranchLifecycleDialog (Branches PR-5): admin rejects a branch CREATE or
 * CLOSE request.
 *
 * Rejecting touches no customer-visible state (a CREATE branch stays
 * PENDING_CREATE / CHANGES_REQUESTED and invisible; a CLOSE reverts to LIVE), so
 * there is no consequence checkbox. A reason is mandatory (soft minimum 15 chars)
 * and is sent to the merchant. On error: NamedGateBanner inside the dialog.
 * Mirrors RejectEditDialog.
 */
import { useRef, useState } from 'react'
import { useRejectBranchLifecycle } from '@/lib/review/useBranchLifecycleReview'
import { NamedGateBanner } from './NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const SOFT_MIN = 15

interface RejectBranchLifecycleDialogProps {
  approvalId: string
  kind: 'create' | 'close'
  onSuccess: () => void
  onCancel: () => void
}

export function RejectBranchLifecycleDialog({
  approvalId,
  kind,
  onSuccess,
  onCancel,
}: RejectBranchLifecycleDialogProps) {
  const [reason, setReason] = useState('')
  const mutation = useRejectBranchLifecycle(approvalId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const trimmed = reason.trim()
  const belowMin = trimmed.length < SOFT_MIN
  const canSubmit = !belowMin && !mutation.isPending

  const title = kind === 'create' ? 'Reject new branch' : 'Reject close request'
  const helper =
    kind === 'create'
      ? 'The branch will not go live. This message is sent to the merchant.'
      : 'The branch stays live. This message is sent to the merchant.'

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
      label={title}
      onClose={onCancel}
      scrimTestId="reject-branch-lifecycle-scrim"
      panelTestId="reject-branch-lifecycle-dialog"
      initialFocusRef={textareaRef}
    >
      <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>

      <label
        htmlFor="reject-branch-lifecycle-reason"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        Reason for rejecting (sent to the merchant)
      </label>
      <textarea
        id="reject-branch-lifecycle-reason"
        ref={textareaRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={
          kind === 'create'
            ? 'Explain clearly why this branch cannot go live. The merchant can adjust and resubmit.'
            : 'Explain clearly why this branch cannot be closed. The branch stays live.'
        }
        rows={4}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="reject-branch-lifecycle-reason-textarea"
      />

      {belowMin && trimmed.length > 0 && (
        <p
          className="mt-1.5 text-xs text-muted-foreground"
          data-testid="reject-branch-lifecycle-min-nudge"
        >
          Add a little more detail so the merchant understands.
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground" data-testid="reject-branch-lifecycle-helper">
        {helper}
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
          data-testid="reject-branch-lifecycle-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="reject-branch-lifecycle-submit"
        >
          {mutation.isPending ? 'Rejecting...' : title}
        </Button>
      </div>
    </Dialog>
  )
}
