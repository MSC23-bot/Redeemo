'use client'

/**
 * EditBranchDialog: admin edits a branch's contact fields + active state on the
 * merchant's behalf (Option B B2.1).
 *
 *   - phone / email / websiteUrl Inputs are prefilled and clearable (empty ->
 *     null, which clears the field).
 *   - isActive is a styled checkbox (mirrors SuspendDialog's confirm checkbox; we
 *     deliberately do NOT add a Switch primitive).
 *   - A mandatory reason textarea (trimmed, non-empty); Save is disabled until the
 *     reason is non-empty AND not pending. The reason is recorded in the audit log.
 *   - The submit body carries ONLY the four editable fields + reason.
 *   - On error: NamedGateBanner inside the dialog.
 *   - Accessible via the shared Dialog primitive (role=dialog, aria-label,
 *     focus-on-open, Escape + scrim close, Tab focus-trap, focus-restore).
 */
import { useRef, useState } from 'react'
import { useEditBranch } from '@/lib/merchants/useMerchantActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface EditBranchDialogProps {
  branchId: string
  merchantId: string
  current: {
    phone: string | null
    email: string | null
    websiteUrl: string | null
    isActive: boolean
  }
  onSuccess: () => void
  onCancel: () => void
}

/** Trim a free-text field; empty -> null (clears the value server-side). */
function toNullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function EditBranchDialog({
  branchId,
  merchantId,
  current,
  onSuccess,
  onCancel,
}: EditBranchDialogProps) {
  const [phone, setPhone] = useState(current.phone ?? '')
  const [email, setEmail] = useState(current.email ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(current.websiteUrl ?? '')
  const [isActive, setIsActive] = useState(current.isActive)
  const [reason, setReason] = useState('')
  const mutation = useEditBranch(merchantId)
  const phoneRef = useRef<HTMLInputElement>(null)

  const trimmedReason = reason.trim()
  const canSubmit = trimmedReason.length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync({
        branchId,
        input: {
          phone: toNullable(phone),
          email: toNullable(email),
          websiteUrl: toNullable(websiteUrl),
          isActive,
          reason: trimmedReason,
        },
      })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Edit branch"
      onClose={onCancel}
      scrimTestId="edit-branch-scrim"
      panelTestId="edit-branch-dialog"
      initialFocusRef={phoneRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Edit branch</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Recorded in the audit log as an admin change on the merchant&apos;s behalf.
      </p>

      {/* Phone */}
      <label
        htmlFor="edit-branch-phone"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        Phone
      </label>
      <Input
        id="edit-branch-phone"
        ref={phoneRef}
        type="text"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+44 7700 900000"
        data-testid="edit-branch-phone"
      />

      {/* Email */}
      <label
        htmlFor="edit-branch-email"
        className="mb-1.5 mt-4 block text-sm font-medium text-foreground"
      >
        Email
      </label>
      <Input
        id="edit-branch-email"
        type="text"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="branch@example.co.uk"
        data-testid="edit-branch-email"
      />

      {/* Website */}
      <label
        htmlFor="edit-branch-website"
        className="mb-1.5 mt-4 block text-sm font-medium text-foreground"
      >
        Website URL
      </label>
      <Input
        id="edit-branch-website"
        type="text"
        value={websiteUrl}
        onChange={(e) => setWebsiteUrl(e.target.value)}
        placeholder="https://example.co.uk"
        data-testid="edit-branch-website"
      />
      <p className="mt-1 text-xs text-muted-foreground">Leave a field blank to clear it.</p>

      {/* Active state */}
      <label
        className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-foreground"
        data-testid="edit-branch-active-label"
      >
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="edit-branch-active-checkbox"
        />
        <span>Branch is active (visible to customers)</span>
      </label>

      {/* Reason */}
      <label
        htmlFor="edit-branch-reason"
        className="mb-1.5 mt-4 block text-sm font-medium text-foreground"
      >
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="edit-branch-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are making this change on the merchant's behalf."
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="edit-branch-reason"
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
          data-testid="edit-branch-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="edit-branch-submit"
        >
          {mutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Dialog>
  )
}
