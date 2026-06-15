'use client'

/**
 * EditMerchantWebsiteDialog: admin edits a merchant's website on the merchant's
 * behalf (Option B B2.1).
 *
 * The edit is a direct change to the merchant record, so:
 *   - The website Input is prefilled and clearable (empty -> null, which clears it).
 *   - A mandatory reason textarea (trimmed, non-empty); Save is disabled until the
 *     reason is non-empty AND not pending. The reason is recorded in the audit log.
 *   - On error: NamedGateBanner inside the dialog.
 *   - Accessible via the shared Dialog primitive (role=dialog, aria-label,
 *     focus-on-open, Escape + scrim close, Tab focus-trap, focus-restore).
 */
import { useRef, useState } from 'react'
import { useEditMerchantProfile } from '@/lib/merchants/useMerchantActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface EditMerchantWebsiteDialogProps {
  merchantId: string
  currentWebsiteUrl: string | null
  onSuccess: () => void
  onCancel: () => void
}

export function EditMerchantWebsiteDialog({
  merchantId,
  currentWebsiteUrl,
  onSuccess,
  onCancel,
}: EditMerchantWebsiteDialogProps) {
  const [websiteUrl, setWebsiteUrl] = useState(currentWebsiteUrl ?? '')
  const [reason, setReason] = useState('')
  const mutation = useEditMerchantProfile(merchantId)
  const websiteRef = useRef<HTMLInputElement>(null)

  const trimmedReason = reason.trim()
  const canSubmit = trimmedReason.length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    // An empty website field clears the value (null); a non-empty field trims.
    const trimmedWebsite = websiteUrl.trim()
    try {
      await mutation.mutateAsync({
        websiteUrl: trimmedWebsite.length > 0 ? trimmedWebsite : null,
        reason: trimmedReason,
      })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Edit merchant website"
      onClose={onCancel}
      scrimTestId="edit-merchant-website-scrim"
      panelTestId="edit-merchant-website-dialog"
      initialFocusRef={websiteRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Edit website</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Recorded in the audit log as an admin change on the merchant&apos;s behalf.
      </p>

      {/* Website */}
      <label
        htmlFor="edit-merchant-website-input"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        Website URL
      </label>
      <Input
        id="edit-merchant-website-input"
        ref={websiteRef}
        type="text"
        value={websiteUrl}
        onChange={(e) => setWebsiteUrl(e.target.value)}
        placeholder="https://example.co.uk"
        data-testid="edit-merchant-website-input"
      />
      <p className="mt-1 text-xs text-muted-foreground">Leave blank to clear the website.</p>

      {/* Reason */}
      <label
        htmlFor="edit-merchant-website-reason"
        className="mb-1.5 mt-4 block text-sm font-medium text-foreground"
      >
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="edit-merchant-website-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are making this change on the merchant's behalf."
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="edit-merchant-website-reason"
      />

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
          data-testid="edit-merchant-website-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="edit-merchant-website-submit"
        >
          {mutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Dialog>
  )
}
