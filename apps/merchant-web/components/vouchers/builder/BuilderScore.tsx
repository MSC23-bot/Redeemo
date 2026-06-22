'use client'

import { scoreVoucher, PLATFORM_FRAMING, type CalKey, type ScoreType } from '@/lib/voucher/scoring'
import { buildClauseList } from '@/lib/voucher/terms'
import { resolveCategoryKey } from '@/lib/voucher/config'
import {
  effectiveTitle,
  effectiveDescription,
  effectiveSaving,
  effectiveSavingPercent,
  descIsUntouched,
  isStructuredPickerId,
  type BuilderState,
} from './builderModel'

// Day-2 Vouchers B2: the ADVISORY "How this voucher stacks up" panel. CC-1 (locked):
// the score is ADVISORY, never a submit gate. It only renders for the 5 structured
// scored types (the score engine has no model for TIME_LIMITED / REUSABLE). All
// inputs derive from the same builder state the preview uses, so they never disagree.

const METER_COLOUR: Record<CalKey, string> = {
  weak: '#B91C1C',
  good: '#D97706',
  great: '#16A34A',
}

export function BuilderScore({
  state,
  categoryName,
}: {
  state: BuilderState
  categoryName: string | null
}) {
  if (!isStructuredPickerId(state.pickerId)) return null

  const categoryKey = resolveCategoryKey(categoryName)
  const type = state.pickerId as ScoreType
  const f = state.fields
  // The built-in selected clauses for the live type (default selection) - drives
  // the term-stacking inputs to the score. Customs are not surfaced in the day-2
  // builder UI yet, so the score uses the built-in defaults only.
  const selectedClauses = buildClauseList({
    type: state.pickerId,
    categoryKey,
    spendAmt: f.spendAmount,
    freeNeedsPurchase: f.freeNeedsPurchase,
    discountKind: f.discountKind,
    discMin: f.discMin,
  })

  const result = scoreVoucher({
    type,
    savingValue: effectiveSaving(state),
    savingPercent: effectiveSavingPercent(state),
    previewTitle: effectiveTitle(state),
    previewDesc: effectiveDescription(state),
    descUntouched: descIsUntouched(state),
    hasPhoto: !!state.imageUrl,
    freeStandalone: state.pickerId === 'freebie' && !f.freeNeedsPurchase,
    reuseFrequent: false,
    selectedClauses,
    customs: [],
  })

  return (
    <div data-testid="builder-score" className="rounded-[16px] border border-[#E5E7EB] bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#010C35]">How this voucher stacks up</p>
        <span
          data-cal={result.calKey}
          className="rounded-full px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide"
          style={{ background: `${METER_COLOUR[result.calKey]}1A`, color: METER_COLOUR[result.calKey] }}
        >
          {result.label}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-[#4B5366]">{result.desc}</p>

      {result.strengths.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#16A34A]">Strengths</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-[#4B5366]">
            {result.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.improvements.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#D97706]">To improve</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-[#4B5366]">
            {result.improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-[#8089A4]">{PLATFORM_FRAMING}</p>
    </div>
  )
}
