'use client'

import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { money } from '@/lib/voucher/builderCopy'

// Voucher Builder shared core: the submit confirmation modal (A10). Two variants:
//
// - normal: prototype-verbatim confirm copy (FULL.html confirmTitle / confirmBody /
//   confirmPrimaryLabel, ~L14555). On confirm the custom lane returns to the list as
//   In review, no toast.
// - weak: the soft weak-submit warning (owner ruling 2026-07-13, copy owner-approved).
//   CC-1 stays non-gating: the warning never blocks; "Submit anyway" proceeds through
//   the exact same affirmative path as the normal confirm. Never two dialogs in
//   sequence: the weak variant REPLACES the normal confirm for a Too weak verdict.

export function SubmitConfirmModal({
  weak = false,
  title,
  saving,
  merchantName,
  pending,
  onConfirm,
  onCancel,
}: {
  /** Render the weak-submit warning variant instead of the normal confirm. */
  weak?: boolean
  title: string
  saving: number
  merchantName?: string | null
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (weak) {
    return (
      <Dialog label="This offer may feel too weak" onClose={onCancel} panelTestId="submit-confirm-modal">
        <div className="flex w-[min(92vw,420px)] flex-col gap-4 p-1">
          <div>
            <h2 className="font-display text-xl font-semibold text-[#010C35]">This offer may feel too weak</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#4B5366]">
              Redeemo thinks this voucher may not be strong enough to stand out to members. You can still submit it for review, but improving the saving or relaxing the terms may help it perform better.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="secondary" onClick={onCancel} disabled={pending}>
              Keep editing
            </Button>
            <Button variant="gradient" onClick={onConfirm} disabled={pending}>
              {pending ? 'Submitting...' : 'Submit anyway'}
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog label="Confirm this is your voucher" onClose={onCancel} panelTestId="submit-confirm-modal">
      <div className="flex w-[min(92vw,420px)] flex-col gap-4 p-1">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#010C35]">Confirm this is your voucher</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#4B5366]">
            Confirm this voucher is correct and yours. It goes to Redeemo for review, and goes live once approved.
          </p>
        </div>

        <div className="rounded-[12px] border border-[#E5E7EB] bg-[#FFF9F5] p-3">
          <p className="text-sm font-semibold text-[#010C35]">{title || 'Your voucher'}</p>
          <p className="mt-0.5 text-[12px] text-[#6B7390]">
            {saving > 0 ? `Save about £${money(saving)}` : 'A new voucher'}
            {merchantName ? ` · ${merchantName}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Keep editing
          </Button>
          <Button variant="gradient" onClick={onConfirm} disabled={pending}>
            {pending ? 'Submitting...' : 'Yes, this is my voucher'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
