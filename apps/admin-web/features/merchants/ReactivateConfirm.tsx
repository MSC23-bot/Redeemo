'use client'

/**
 * ReactivateConfirm: admin reactivates a suspended merchant.
 *
 * Confirmation dialog (no reason field). Restores the merchant's access and
 * offers. On error (e.g. MERCHANT_NOT_SUSPENDED): NamedGateBanner inside.
 * Accessible: role=dialog, aria-label, focus-on-open (Cancel), Escape + scrim close.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useReactivate } from '@/lib/merchants/useMerchantActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Button } from '@/components/ui/button'

interface ReactivateConfirmProps {
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

export function ReactivateConfirm({
  merchantId,
  approvalId,
  onSuccess,
  onCancel,
}: ReactivateConfirmProps) {
  const mutation = useReactivate(merchantId, approvalId)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus the safe default (Cancel) on open.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onCancel}
        data-testid="reactivate-scrim"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-label="Reactivate merchant"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl"
        data-testid="reactivate-confirm-dialog"
      >
        <h2 className="mb-3 text-base font-semibold text-foreground">Reactivate merchant?</h2>

        <p className="text-sm text-foreground" data-testid="reactivate-consequence-copy">
          Reactivate this merchant and restore their access and offers?
        </p>

        {/* Error banner */}
        {mutation.error && (
          <div className="mt-4" data-testid="reactivate-error-banner">
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
            data-testid="reactivate-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={mutation.isPending}
            data-testid="reactivate-submit"
          >
            {mutation.isPending ? 'Reactivating...' : 'Reactivate merchant'}
          </Button>
        </div>
      </div>
    </div>
  )
}
