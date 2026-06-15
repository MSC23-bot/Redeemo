/**
 * RejectDialog: admin rejects a merchant application.
 *
 * Requirements:
 *   - Mandatory reason textarea
 *   - Explicit confirmation: copy about consequences + a checkbox acknowledgement
 *   - Submit disabled until both reason is non-empty AND checkbox is checked
 *   - Calls useReject on submit
 *   - On error: shows NamedGateBanner inside the dialog
 *   - Accessible via the shared Dialog primitive: role=dialog, aria-label,
 *     focus-on-open, Escape + scrim close, Tab focus-trap, focus-restore.
 */
'use client'

import { useRef, useState } from 'react'
import { useReject } from '@/lib/review/useReviewActions'
import { NamedGateBanner } from './NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface RejectDialogProps {
  approvalId: string
  onSuccess: () => void
  onCancel: () => void
}

export function RejectDialog({ approvalId, onSuccess, onCancel }: RejectDialogProps) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const mutation = useReject(approvalId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const trimmed = reason.trim()
  const canSubmit = trimmed.length > 0 && confirmed && !mutation.isPending

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
      label="Reject application"
      onClose={onCancel}
      scrimTestId="reject-scrim"
      panelTestId="reject-dialog"
      initialFocusRef={textareaRef}
    >
      <h2 className="mb-4 text-base font-semibold text-foreground">Reject application</h2>

      {/* Reason textarea */}
      <label
        htmlFor="reject-reason"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        Reason for rejection (sent to the merchant by email)
      </label>
      <textarea
        id="reject-reason"
        ref={textareaRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain clearly why this application is being rejected."
        rows={4}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="reject-reason-textarea"
      />

      {/* Consequence disclosure */}
      <div
        className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        data-testid="reject-consequence-copy"
      >
        Rejecting sets this merchant to inactive and emails them. This cannot be self-undone by the merchant.
      </div>

      {/* Explicit confirmation checkbox */}
      <label
        className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-foreground"
        data-testid="reject-confirm-label"
      >
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="reject-confirm-checkbox"
        />
        <span>I understand this rejects the merchant</span>
      </label>

      {/* Error banner */}
      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="reject-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="reject-submit"
        >
          {mutation.isPending ? 'Rejecting...' : 'Reject application'}
        </Button>
      </div>
    </Dialog>
  )
}
