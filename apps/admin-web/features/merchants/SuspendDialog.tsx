'use client'

/**
 * SuspendDialog: admin suspends a live merchant.
 *
 * Suspension takes effect within seconds and is severe, so:
 *   - Mandatory reason textarea (trimmed, non-empty)
 *   - Serious consequence copy
 *   - Explicit confirmation checkbox
 *   - Submit disabled until reason is non-empty AND confirmed AND not pending
 *   - On error: NamedGateBanner inside the dialog
 *   - Accessible: role=dialog, aria-label, focus-on-open, Escape + scrim close
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useSuspend } from '@/lib/merchants/useMerchantActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Button } from '@/components/ui/button'

interface SuspendDialogProps {
  merchantId: string
  /**
   * Present when launched from the review screen (drives review + queue cache
   * invalidation). Omitted on the WP2 `/merchants` list, where only the
   * merchants directory is invalidated.
   */
  approvalId?: string
  onSuccess: () => void
  onCancel: () => void
}

export function SuspendDialog({ merchantId, approvalId, onSuccess, onCancel }: SuspendDialogProps) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const mutation = useSuspend(merchantId, approvalId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const trimmed = reason.trim()
  const canSubmit = trimmed.length > 0 && confirmed && !mutation.isPending

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      onCancel()
    }
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onCancel}
        data-testid="suspend-scrim"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-label="Suspend merchant"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl"
        data-testid="suspend-dialog"
      >
        <h2 className="mb-4 text-base font-semibold text-foreground">Suspend merchant</h2>

        {/* Reason textarea */}
        <label
          htmlFor="suspend-reason"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Reason for suspension (recorded in the audit log)
        </label>
        <textarea
          id="suspend-reason"
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this merchant is being suspended."
          rows={4}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="suspend-reason-textarea"
        />

        {/* Consequence disclosure */}
        <div
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          data-testid="suspend-consequence-copy"
        >
          Suspending takes this merchant non-operational within seconds: their offers stop, and their
          owner and branch staff are signed out.
        </div>

        {/* Explicit confirmation checkbox */}
        <label
          className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-foreground"
          data-testid="suspend-confirm-label"
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="suspend-confirm-checkbox"
          />
          <span>I understand this immediately suspends the merchant</span>
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
            data-testid="suspend-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="suspend-submit"
          >
            {mutation.isPending ? 'Suspending...' : 'Suspend merchant'}
          </Button>
        </div>
      </div>
    </div>
  )
}
