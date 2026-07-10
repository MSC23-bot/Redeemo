'use client'

/**
 * SubmitRmvDialog: submit a DRAFT mandatory flagship (RMV) for go-live review on
 * the merchant's behalf (Option B B5.1, wired in Merchant 360 A3). Submitting only
 * QUEUES the voucher (DRAFT -> PENDING_APPROVAL); the separate actioner approve
 * stays the separation-of-duties backstop that flips it live. A required reason is
 * audited. Only ever mounted for a DRAFT voucher (the caller gates on status +
 * capability); VOUCHER_NOT_SUBMITTABLE / RMV_NOT_FOUND surface via NamedGateBanner.
 */
import { useRef, useState } from 'react'
import { useSubmitRmv } from '@/lib/vouchers/useAdminVoucherActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { AdminRmvVoucher } from '@/lib/api/vouchers'

interface SubmitRmvDialogProps {
  merchantId: string
  voucher: AdminRmvVoucher
  onSuccess: () => void
  onCancel: () => void
}

export function SubmitRmvDialog({
  merchantId,
  voucher,
  onSuccess,
  onCancel,
}: SubmitRmvDialogProps) {
  const mutation = useSubmitRmv(merchantId)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = useState('')

  const trimmedReason = reason.trim()
  const canSubmit = trimmedReason.length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync({ voucherId: voucher.id, reason: trimmedReason })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Submit mandatory voucher for review"
      onClose={onCancel}
      scrimTestId="submit-rmv-scrim"
      panelTestId="submit-rmv-dialog"
      initialFocusRef={reasonRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">
        Submit for review: {voucher.title}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        This queues the voucher for the go-live approval. Nothing goes live here; an admin
        actioner still approves it separately. Recorded in the audit log as a submit on the
        merchant&apos;s behalf.
      </p>

      <label htmlFor="submit-rmv-reason" className="mb-1.5 block text-sm font-medium text-foreground">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="submit-rmv-reason"
        ref={reasonRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are submitting this voucher on the merchant's behalf."
        rows={3}
        data-testid="submit-rmv-reason"
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

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
          data-testid="submit-rmv-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="submit-rmv-confirm"
        >
          {mutation.isPending ? 'Submitting...' : 'Submit for review'}
        </Button>
      </div>
    </Dialog>
  )
}
