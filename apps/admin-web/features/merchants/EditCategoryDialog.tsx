'use client'

/**
 * EditCategoryDialog: a SUPER_ADMIN sets or changes a merchant's category on the
 * merchant's behalf (Option B B2.3-web).
 *
 * Two-stage flow (the backend route is two-step for a CHANGE):
 *   Stage 'pick'  - choose an ELIGIBLE category (>= 2 active RMV templates;
 *                   ineligible ones are shown but disabled) + a mandatory reason,
 *                   then "Review change" calls editCategory WITHOUT confirm.
 *                     - first-SET (no existing category) applies immediately
 *                       (provisioned) -> onSuccess.
 *                     - a CHANGE comes back { requiresConfirmation, message } ->
 *                       move to stage 'confirm' and show the consequence.
 *   Stage 'confirm' - show the discard-drafts consequence; "Discard drafts and
 *                     change category" calls editCategory WITH confirm:true ->
 *                     onSuccess on { changed }.
 *
 * Errors (CATEGORY_CHANGE_BLOCKED / NO_RMV_TEMPLATE / MERCHANT_NOT_FOUND) surface
 * via NamedGateBanner. The Edit affordance that opens this is gated on
 * merchant:edit-category (SUPER_ADMIN); the backend route is the real enforcement.
 */
import { useState } from 'react'
import { useEditMerchantCategory } from '@/lib/merchants/useMerchantActions'
import { useAdminCategories } from '@/lib/merchants/useAdminCategories'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface EditCategoryDialogProps {
  merchantId: string
  currentCategoryId: string | null
  onSuccess: () => void
  onCancel: () => void
}

export function EditCategoryDialog({ merchantId, currentCategoryId, onSuccess, onCancel }: EditCategoryDialogProps) {
  const { categories, isLoading } = useAdminCategories(true)
  const mutation = useEditMerchantCategory(merchantId)

  const [selectedCategoryId, setSelectedCategoryId] = useState(currentCategoryId ?? '')
  const [reason, setReason] = useState('')
  const [stage, setStage] = useState<'pick' | 'confirm'>('pick')
  const [confirmMessage, setConfirmMessage] = useState('')

  const trimmedReason = reason.trim()
  const isDifferent = selectedCategoryId !== '' && selectedCategoryId !== currentCategoryId
  const canReview = isDifferent && trimmedReason.length > 0 && !mutation.isPending

  async function handleReview() {
    if (!canReview) return
    try {
      const result = await mutation.mutateAsync({ primaryCategoryId: selectedCategoryId, reason: trimmedReason })
      if (result.requiresConfirmation) {
        setConfirmMessage(result.message ?? 'Changing category will discard the existing RMV drafts.')
        setStage('confirm')
      } else {
        // first-set (provisioned) or no-op (unchanged) applied immediately.
        onSuccess()
      }
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  async function handleConfirm() {
    if (mutation.isPending) return
    try {
      const result = await mutation.mutateAsync({ primaryCategoryId: selectedCategoryId, reason: trimmedReason, confirm: true })
      if (result.changed || result.provisioned || result.unchanged) onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Change category"
      onClose={onCancel}
      scrimTestId="edit-category-scrim"
      panelTestId="edit-category-dialog"
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Change category</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Recorded in the audit log as an admin change on the merchant&apos;s behalf.
      </p>

      {stage === 'pick' ? (
        <>
          <label htmlFor="edit-category-select" className="mb-1.5 block text-sm font-medium text-foreground">
            Category
          </label>
          <select
            id="edit-category-select"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            disabled={isLoading}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="edit-category-select"
          >
            <option value="" disabled>
              {isLoading ? 'Loading categories...' : 'Select a category'}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.eligible}>
                {c.eligible ? c.name : `${c.name} (no voucher templates)`}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Only categories with mandatory voucher templates can be assigned.
          </p>

          <label htmlFor="edit-category-reason" className="mb-1.5 mt-4 block text-sm font-medium text-foreground">
            Reason (recorded in the audit log)
          </label>
          <textarea
            id="edit-category-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why you are changing this merchant's category on their behalf."
            rows={3}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="edit-category-reason"
          />

          {mutation.error && (
            <div className="mt-3">
              <NamedGateBanner error={mutation.error} />
            </div>
          )}

          <div className="mt-5 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending} data-testid="edit-category-cancel">
              Cancel
            </Button>
            <Button type="button" onClick={handleReview} disabled={!canReview} data-testid="edit-category-review">
              {mutation.isPending ? 'Checking...' : 'Review change'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div
            className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            data-testid="edit-category-confirm-message"
          >
            {confirmMessage}
          </div>

          {mutation.error && (
            <div className="mt-3">
              <NamedGateBanner error={mutation.error} />
            </div>
          )}

          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStage('pick')}
              disabled={mutation.isPending}
              data-testid="edit-category-back"
            >
              Back
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={mutation.isPending} data-testid="edit-category-confirm">
              {mutation.isPending ? 'Applying...' : 'Discard drafts and change category'}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}
