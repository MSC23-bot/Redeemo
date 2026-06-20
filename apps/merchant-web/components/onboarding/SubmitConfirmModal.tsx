'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// M2 F1: the submit-for-review confirm modal. The hub's "Submit for review" is the
// FIRST gate (only enabled at all_complete); this modal's checkbox is the SECOND
// gate. Confirm is disabled until the checkbox is ticked. Confirm -> onConfirm()
// (the page POSTs /onboarding/submit + refetches). The page handles the
// ONBOARDING_GATES_INCOMPLETE error and passes it back in via `error`.

interface SubmitConfirmModalProps {
  onClose: () => void
  onConfirm: () => void
  submitting: boolean
  error?: string | null
}

export function SubmitConfirmModal({ onClose, onConfirm, submitting, error }: SubmitConfirmModalProps) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <Dialog
      label="Submit your business for review"
      onClose={onClose}
      panelTestId="submit-confirm-panel"
      scrimTestId="submit-confirm-scrim"
    >
      <div className="w-full max-w-[480px] rounded-[22px] bg-white p-7 shadow-[0_44px_100px_-30px_rgba(1,12,53,0.55)]">
        <h3 className="font-display text-[23px] font-semibold leading-tight text-[#010C35]">
          Submit your business for review
        </h3>
        <p className="mt-3 text-[14.5px] leading-relaxed text-[#566079]">
          You are sending your business to Redeemo to review. Once we approve it, your business, branches, and
          vouchers go live on the Redeemo app and website. After that, edits to key details go through a quick
          review before they show, so listings stay accurate and trustworthy. Please make sure everything is
          correct.
        </p>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[13px] border border-[#EEF1F4] bg-[#FBFCFD] p-4">
          <input
            type="checkbox"
            aria-label="Confirm my details are correct"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 size-[18px] shrink-0 accent-[#E20C04]"
          />
          <span className="text-sm font-semibold leading-relaxed text-[#1F2A4A]">
            I confirm my details are correct and I am ready to submit.
          </span>
        </label>

        {error ? (
          <p role="alert" className="mt-3 text-[13px] font-medium text-[#B91C1C]">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={submitting}>
            Go back and check
          </Button>
          <Button
            type="button"
            variant="gradient"
            className="flex-1"
            disabled={!confirmed || submitting}
            onClick={() => {
              if (confirmed && !submitting) onConfirm()
            }}
          >
            {submitting ? 'Submitting...' : 'Submit for review'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
