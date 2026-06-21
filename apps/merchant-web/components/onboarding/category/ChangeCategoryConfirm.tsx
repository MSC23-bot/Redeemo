'use client'

import { Dialog } from '@/components/ui/dialog'

// M2 F2: the high-consequence confirm shown ONLY when an existing identity's
// TOP-LEVEL category is being changed. The backend discards DRAFT flagship RMVs on
// a top-level change (setMerchantIdentityCore), so the merchant must opt in. On a
// fresh first-set the form skips this entirely. Copy is the prototype's
// "Change your business category?" guard.

interface ChangeCategoryConfirmProps {
  onCancel: () => void
  onConfirm: () => void
}

export function ChangeCategoryConfirm({ onCancel, onConfirm }: ChangeCategoryConfirmProps) {
  return (
    <Dialog
      label="Change your business category?"
      onClose={onCancel}
      panelTestId="change-category-panel"
      scrimTestId="change-category-scrim"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-[11px] border border-[#F3DFC0] bg-[#FEF6EC] text-[#B45309]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </span>
        <h3 className="font-display text-[19px] font-semibold tracking-tight text-[#010C35]">
          Change your business category?
        </h3>
      </div>

      <p className="mt-3.5 text-[13.5px] leading-relaxed text-[#566079]">
        Your category sets the two mandatory starter vouchers for your business. Changing it can change those
        starter vouchers and the suggestions you see when building vouchers. This is rare once you are set up, so
        please only continue if it is genuinely wrong.
      </p>

      <div className="mt-3.5 flex items-start gap-2.5 rounded-[12px] border border-[#EEE8E0] bg-[#FBFAF8] px-3.5 py-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8089A4" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span className="text-[12.5px] leading-snug text-[#566079]">
          Your live vouchers and redemptions are not deleted. We will guide you through any starter vouchers that
          need updating.
        </span>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 flex-1 rounded-[13px] border-[1.5px] border-[#E3E0DA] bg-white text-[15px] font-bold text-[#576079] transition-colors hover:bg-[#F6F5F2]"
        >
          Keep my category
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-12 flex-[1.3] rounded-[13px] bg-[#E20C04] text-[15px] font-bold text-white transition-colors hover:bg-[#C70A03]"
        >
          Choose a new category
        </button>
      </div>
    </Dialog>
  )
}
