'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  tierBadge,
  tierOf,
  countTermTiers,
  CUSTOM_CHAR_LIMIT,
  type Clause,
  type CustomTerm,
  type Tier,
} from '@/lib/voucher/terms'
import { TextField } from './fields'

// Vouchers V1: the interactive terms checklist for the Day-2 builder, closing the
// gap where lib/voucher/terms.ts (clause pools, tiers, stacking thresholds) was
// fully built + tested but the builder only exposed a free-text textarea. The UI
// mirrors the onboarding flagship builder's terms card (M2 F5) so merchants meet
// ONE terms model everywhere. Structured types only - TIME_LIMITED / REUSABLE
// keep free text (the engine has no clause pools for them).

function badgeStyle(tier: Tier): React.CSSProperties {
  if (tier === 'restrictive') return { background: '#FEECEC', color: '#B91C1C' }
  return { background: '#FEF6EC', color: '#B45309' }
}

export interface TermsSectionProps {
  clauses: Clause[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  customs: CustomTerm[]
  onAddCustom: (term: CustomTerm) => void
  onRemoveCustom: (index: number) => void
}

export function TermsSection({ clauses, selectedIds, onToggle, customs, onAddCustom, onRemoveCustom }: TermsSectionProps) {
  const [customDraft, setCustomDraft] = React.useState('')
  const selectedClauses = clauses.filter((c) => selectedIds.has(c.id))
  const counts = countTermTiers(selectedClauses, customs)

  function addCustom() {
    const text = customDraft.trim()
    if (!text || customDraft.length > CUSTOM_CHAR_LIMIT) return
    onAddCustom({ text, tier: tierOf(text) })
    setCustomDraft('')
  }

  return (
    <div data-testid="terms-section" className="rounded-[16px] border border-[#E5E7EB] bg-white p-5">
      <div className="mb-3">
        <h3 className="text-[15px] font-bold text-[#010C35]">Your terms</h3>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">
          Pick from this set so customers always know what to expect. The fewer you pick, the more people will redeem. Caution terms may put some customers off; Restrictive terms can stop people redeeming altogether.
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {clauses.map((c) => {
          const checked = selectedIds.has(c.id)
          const badge = tierBadge[c.tier]
          return (
            <li key={c.id}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] p-2 hover:bg-[#FBFAF9]">
                {/* The wrapping label supplies the accessible name so it includes
                    BOTH the clause text AND the tier badge (Caution/Restrictive). */}
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(c.id)}
                  className="mt-0.5 size-4 accent-[#E20C04]"
                />
                <span className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="text-[13px] leading-relaxed text-[#1F2A4A]">{c.label}</span>
                  {badge ? (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={badgeStyle(c.tier)}
                    >
                      {badge}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {customs.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {customs.map((c, i) => (
            <li key={`${c.text}-${i}`} className="flex items-start gap-2 rounded-[10px] bg-[#FBFAF9] p-2">
              <span className="flex flex-1 flex-wrap items-center gap-2">
                <span className="text-[13px] leading-relaxed text-[#1F2A4A]">{c.text}</span>
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: '#EFEAFE', color: '#5B21B6' }}
                >
                  Custom
                </span>
                {c.tier === 'restrictive' ? (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={badgeStyle('restrictive')}
                  >
                    Restrictive
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                aria-label={`Remove term: ${c.text}`}
                onClick={() => onRemoveCustom(i)}
                className="text-xs font-semibold text-[#B91C1C] hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-col gap-1.5">
        <TextField label="Add your own term" value={customDraft} onChange={setCustomDraft} placeholder="Add your own term" />
        <p className="text-xs text-[#8089A4]">
          Keep it simple and fair. {Math.max(0, CUSTOM_CHAR_LIMIT - customDraft.length)} characters left of {CUSTOM_CHAR_LIMIT}.
        </p>
        {customDraft.trim() && tierOf(customDraft) === 'restrictive' ? (
          <p className="text-xs font-medium text-[#B91C1C]">This reads as restrictive. Try to simplify before adding.</p>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          className="w-fit"
          onClick={addCustom}
          disabled={customDraft.trim().length === 0 || customDraft.length > CUSTOM_CHAR_LIMIT}
        >
          Add term
        </Button>
      </div>

      {counts.tooRestrictive ? (
        <p className="mt-3 rounded-[10px] bg-[#FEECEC] p-3 text-[13px] leading-relaxed text-[#B91C1C]">
          Your voucher is too restrictive. Drop a term or two, especially the strictest, so customers can actually redeem.
        </p>
      ) : counts.becomingRestrictive ? (
        <p className="mt-3 rounded-[10px] bg-[#FEF6EC] p-3 text-[13px] leading-relaxed text-[#B45309]">
          Your voucher is becoming restrictive. Easing off can help more customers redeem it, and a clean, simple voucher always scores better.
        </p>
      ) : null}
    </div>
  )
}
