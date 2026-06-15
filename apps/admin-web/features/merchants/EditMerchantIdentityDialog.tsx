'use client'

/**
 * EditMerchantIdentityDialog: a SUPER_ADMIN edits a merchant's registered
 * identity fields (vatNumber / companyNumber) on the merchant's behalf
 * (Option B B2.2).
 *
 *   - vatNumber / companyNumber Inputs are prefilled and clearable (empty ->
 *     null, which clears the field server-side).
 *   - A mandatory confirmation checkbox AND a mandatory reason textarea. Save is
 *     disabled until BOTH the checkbox is ticked AND the reason is non-empty (and
 *     not pending). The route also requires confirm:true on the wire (backend
 *     confirmation, not just this checkbox).
 *   - The submit body carries ONLY vat/company + reason + confirm.
 *   - On error: NamedGateBanner inside the dialog.
 *   - Accessible via the shared Dialog primitive (role=dialog, aria-label,
 *     focus-on-open, Escape + scrim close, Tab focus-trap, focus-restore).
 *
 * The Edit affordance that opens this dialog is gated on merchant:edit-identity
 * (SUPER_ADMIN only); the backend route is the real enforcement.
 */
import { useRef, useState } from 'react'
import { useEditMerchantIdentity } from '@/lib/merchants/useMerchantActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface EditMerchantIdentityDialogProps {
  merchantId: string
  currentVatNumber: string | null
  currentCompanyNumber: string | null
  onSuccess: () => void
  onCancel: () => void
}

/** Trim a free-text field; empty -> null (clears the value server-side). */
function toNullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function EditMerchantIdentityDialog({
  merchantId,
  currentVatNumber,
  currentCompanyNumber,
  onSuccess,
  onCancel,
}: EditMerchantIdentityDialogProps) {
  const [vatNumber, setVatNumber] = useState(currentVatNumber ?? '')
  const [companyNumber, setCompanyNumber] = useState(currentCompanyNumber ?? '')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const mutation = useEditMerchantIdentity(merchantId)
  const vatRef = useRef<HTMLInputElement>(null)

  const trimmedReason = reason.trim()
  const canSubmit = trimmedReason.length > 0 && confirmed && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync({
        vatNumber: toNullable(vatNumber),
        companyNumber: toNullable(companyNumber),
        reason: trimmedReason,
        confirm: true,
      })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Edit business registration"
      onClose={onCancel}
      scrimTestId="edit-merchant-identity-scrim"
      panelTestId="edit-merchant-identity-dialog"
      initialFocusRef={vatRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Edit business registration</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Recorded in the audit log as an admin change on the merchant&apos;s behalf.
      </p>

      {/* VAT number */}
      <label
        htmlFor="edit-merchant-vat"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        VAT number
      </label>
      <Input
        id="edit-merchant-vat"
        ref={vatRef}
        type="text"
        value={vatNumber}
        onChange={(e) => setVatNumber(e.target.value)}
        placeholder="GB123456789"
        data-testid="edit-merchant-identity-vat"
      />

      {/* Company number */}
      <label
        htmlFor="edit-merchant-company"
        className="mb-1.5 mt-4 block text-sm font-medium text-foreground"
      >
        Company number
      </label>
      <Input
        id="edit-merchant-company"
        type="text"
        value={companyNumber}
        onChange={(e) => setCompanyNumber(e.target.value)}
        placeholder="12345678"
        data-testid="edit-merchant-identity-company"
      />
      <p className="mt-1 text-xs text-muted-foreground">Leave a field blank to clear it.</p>

      {/* Reason */}
      <label
        htmlFor="edit-merchant-identity-reason"
        className="mb-1.5 mt-4 block text-sm font-medium text-foreground"
      >
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="edit-merchant-identity-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are changing this merchant's registered identity on their behalf."
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="edit-merchant-identity-reason"
      />

      {/* Confirmation */}
      <label
        className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-foreground"
        data-testid="edit-merchant-identity-confirm-label"
      >
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="edit-merchant-identity-confirm"
        />
        <span>I confirm I am changing this merchant&apos;s registered identity on their behalf.</span>
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
          data-testid="edit-merchant-identity-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="edit-merchant-identity-submit"
        >
          {mutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Dialog>
  )
}
