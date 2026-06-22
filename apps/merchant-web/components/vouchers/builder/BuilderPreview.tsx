'use client'

import {
  effectiveTitle,
  effectiveDescription,
  effectiveSaving,
  type BuilderState,
} from './builderModel'

// Day-2 Vouchers B2: the live customer-preview card. Title/description/saving all
// derive from the builder state via lib/voucher/compose (or the merchant override).
// This is what the customer will see on the Redeemo app.

function money(n: number): string {
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? String(r) : r.toFixed(2)
}

export function BuilderPreview({ state }: { state: BuilderState }) {
  const title = effectiveTitle(state)
  const description = effectiveDescription(state)
  const saving = effectiveSaving(state)

  return (
    <div className="rounded-[16px] border border-[#E5E7EB] bg-[#FFF9F5] p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-[#8089A4]">Customer preview</p>
      <p data-testid="builder-preview-title" className="mt-2 font-display text-xl font-semibold text-[#010C35]">
        {title || 'Your voucher title appears here'}
      </p>
      {saving > 0 ? (
        <p data-testid="builder-preview-saving" className="mt-1 text-sm font-semibold text-[#16A34A]">
          Save about £{money(saving)}
        </p>
      ) : null}
      <p data-testid="builder-preview-description" className="mt-2 text-sm leading-relaxed text-[#4B5366]">
        {description || 'A short description of the offer appears here.'}
      </p>
    </div>
  )
}
