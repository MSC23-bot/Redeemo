'use client'

/**
 * SubmitMerchantDialog (B3-web): the admin confirms submitting a merchant's
 * onboarding application for review ON THE MERCHANT'S BEHALF.
 *
 *   - Reason is mandatory (recorded in the audit log). There is NO confirmation
 *     checkbox: the mandatory reason is the gate.
 *   - The copy states the legal boundary: this QUEUES review only. It does NOT
 *     approve, take live, verify, or accept the contract on the merchant's behalf.
 *   - Copy is "Submit for review" by default and "Resubmit for review" when the
 *     merchant is in the changes-requested state (driven by the page from
 *     onboardingStep === 'NEEDS_CHANGES').
 *   - On error: NamedGateBanner inside the dialog.
 *   - Accessible via the shared Dialog primitive (focus-trap, Escape + scrim close,
 *     focus-restore).
 *
 * Opened from SubmitForReviewCard only when all submit gates pass; the backend
 * route (`merchant:submit`) is the real enforcement.
 */
import { useRef, useState } from 'react'
import { useSubmitMerchant } from '@/lib/merchants/useMerchantActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface SubmitMerchantDialogProps {
  merchantId: string
  isResubmit: boolean
  onSuccess: () => void
  onCancel: () => void
}

export function SubmitMerchantDialog({
  merchantId,
  isResubmit,
  onSuccess,
  onCancel,
}: SubmitMerchantDialogProps) {
  const [reason, setReason] = useState('')
  const mutation = useSubmitMerchant(merchantId)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  const trimmedReason = reason.trim()
  const canSubmit = trimmedReason.length > 0 && !mutation.isPending
  const title = isResubmit ? 'Resubmit for review' : 'Submit for review'

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync({ reason: trimmedReason })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label={title}
      onClose={onCancel}
      scrimTestId="submit-merchant-scrim"
      panelTestId="submit-merchant-dialog"
      initialFocusRef={reasonRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        This submits the merchant&apos;s application for review on their behalf. It does not approve the
        merchant, take them live, verify them, or accept their contract. The merchant&apos;s contract
        acceptance and the admin review are separate steps.
      </p>

      <label
        htmlFor="submit-merchant-reason-input"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="submit-merchant-reason-input"
        ref={reasonRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are submitting on the merchant's behalf."
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="submit-merchant-reason"
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
          data-testid="submit-merchant-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="submit-merchant-submit"
        >
          {mutation.isPending ? 'Submitting...' : title}
        </Button>
      </div>
    </Dialog>
  )
}
