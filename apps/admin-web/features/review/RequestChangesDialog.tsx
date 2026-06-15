/**
 * RequestChangesDialog: admin sends a reason-for-changes message to the merchant.
 *
 * Features:
 *   - Textarea for the reason (mandatory, soft minimum 15 chars)
 *   - Quick-reason chips that append (or set if empty) to the textarea
 *   - Helper text: "Be specific and friendly. This message is emailed to the merchant."
 *   - Soft min-length nudge: shows a helper line and disables submit below the threshold
 *   - Calls useRequestChanges on submit; on success calls onSuccess (parent closes + refetches)
 *   - On error: shows NamedGateBanner inside the dialog
 *   - Accessible via the shared Dialog primitive: role=dialog, aria-label,
 *     focus-on-open, Escape + scrim close, Tab focus-trap, focus-restore.
 */
'use client'

import { useRef, useState } from 'react'
import { useRequestChanges } from '@/lib/review/useReviewActions'
import { NamedGateBanner } from './NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const QUICK_REASONS = [
  'Document expired',
  'Photo unclear',
  'Wrong category',
  'Branch address',
]

const SOFT_MIN = 15

interface RequestChangesDialogProps {
  approvalId: string
  onSuccess: () => void
  onCancel: () => void
}

export function RequestChangesDialog({
  approvalId,
  onSuccess,
  onCancel,
}: RequestChangesDialogProps) {
  const [reason, setReason] = useState('')
  const mutation = useRequestChanges(approvalId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const trimmed = reason.trim()
  const belowMin = trimmed.length < SOFT_MIN
  const canSubmit = !belowMin && !mutation.isPending

  function handleChipClick(chip: string) {
    setReason((prev) => {
      if (prev.trim() === '') return chip
      return `${prev.trimEnd()} ${chip}`
    })
    textareaRef.current?.focus()
  }

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
      label="Request changes"
      onClose={onCancel}
      scrimTestId="request-changes-scrim"
      panelTestId="request-changes-dialog"
      initialFocusRef={textareaRef}
    >
      <h2 className="mb-4 text-base font-semibold text-foreground">Request changes</h2>

      {/* Quick-reason chips */}
      <div className="mb-3 flex flex-wrap gap-2" data-testid="quick-reason-chips">
        {QUICK_REASONS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => handleChipClick(chip)}
            className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`quick-reason-chip-${chip.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Reason textarea */}
      <label
        htmlFor="request-changes-reason"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        Reason for changes (sent to the merchant by email)
      </label>
      <textarea
        id="request-changes-reason"
        ref={textareaRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Be specific and friendly, e.g. The food hygiene certificate has expired. Please upload a current one and re-submit."
        rows={4}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="request-changes-reason-textarea"
      />

      {/* Soft-min nudge */}
      {belowMin && trimmed.length > 0 && (
        <p
          className="mt-1.5 text-xs text-muted-foreground"
          data-testid="request-changes-min-nudge"
        >
          Add a little more detail so the merchant knows what to fix.
        </p>
      )}

      {/* Helper text */}
      <p className="mt-2 text-xs text-muted-foreground" data-testid="request-changes-helper">
        Be specific and friendly. This message is emailed to the merchant.
      </p>

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
          data-testid="request-changes-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="request-changes-submit"
        >
          {mutation.isPending ? 'Sending...' : 'Send request for changes'}
        </Button>
      </div>
    </Dialog>
  )
}
