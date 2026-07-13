'use client'

import { scoreVoucher, PLATFORM_FRAMING, type CalKey } from '@/lib/voucher/scoring'
import { buildScoreInput } from './scoreInput'
import type { BuilderState } from '../builder/builderModel'

// Voucher Builder shared core: the "How this voucher stacks up" ADVISORY score panel.
//
// CC-1 (LOCKED, owner ruling 2026-07-13): the score is advisory and never disables
// Save/Submit. The prototype's hard submit-gate is not ported; instead a Too weak
// submit surfaces a soft warning dialog in the builder (see DayTwoBuilder), and this
// panel renders the Too weak state fully while the footer keeps Submit enabled.
//
// The panel scores the 5 structured types AND the TIME_LIMITED / REUSABLE wrappers
// (once a base mechanic is picked); the input assembly is shared with the submit
// warning via buildScoreInput so panel and warning always agree.

const CAL_STYLE: Record<CalKey, { color: string; bg: string; border: string }> = {
  weak: { color: '#B45309', bg: '#FEF6EC', border: '#F3D8AE' },
  good: { color: '#0F7A3E', bg: '#E9F7EF', border: '#BFE6CF' },
  great: { color: '#0F7A3E', bg: '#E9F7EF', border: '#BFE6CF' },
}
const METER: CalKey[] = ['weak', 'good', 'great']
const METER_LABEL: Record<CalKey, string> = { weak: 'Too weak', good: 'Good', great: 'Great' }

export function ScorePanel({ state, categoryName }: { state: BuilderState; categoryName: string | null }) {
  const input = buildScoreInput(state, categoryName)

  // Wrapper Step-1 empty state: no base mechanic chosen yet (INVENTORY 2.8 preview).
  if (input == null) {
    return (
      <div data-testid="builder-score" className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 text-center">
        <p className="text-sm font-bold text-[#010C35]">Pick what runs first</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6B7390]">
          Choose the voucher in Step 1, then your score and live customer preview appear here.
        </p>
      </div>
    )
  }

  const result = scoreVoucher(input)

  const active = CAL_STYLE[result.calKey]

  return (
    <div
      data-testid="builder-score"
      className="rounded-[18px] border bg-white p-5"
      style={{ borderColor: active.border, boxShadow: '0 1px 2px rgba(1,12,53,0.04),0 18px 44px -32px rgba(1,12,53,0.3)' }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#010C35]">How this voucher stacks up</p>
        <span data-cal={result.calKey} className="rounded-full px-2.5 py-1 text-xs font-extrabold" style={{ background: active.bg, color: active.color }}>
          {result.label}
        </span>
      </div>

      {/* 3-segment meter (FULL.html calMeter). */}
      <div className="mt-3 flex gap-1.5">
        {METER.map((k) => {
          const on = k === result.calKey
          const s = CAL_STYLE[k]
          return (
            <div
              key={k}
              className="flex-1 rounded-[9px] py-[7px] text-center text-[12px] font-bold"
              style={on ? { background: s.bg, color: s.color, boxShadow: `inset 0 0 0 1.5px ${s.border}` } : { background: '#F3F4F6', color: '#8089A4' }}
            >
              {METER_LABEL[k]}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[#4B5366]">{result.desc}</p>

      {result.strengths.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#0F7A3E]">What is strong about your voucher</p>
          <ul className="mt-1 flex flex-col gap-1 text-[13px] text-[#4B5366]">
            {result.strengths.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-[#0F7A3E]">&#10003;</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.improvements.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#B45309]">What could make it better</p>
          <ul className="mt-1 flex flex-col gap-1 text-[13px] text-[#4B5366]">
            {result.improvements.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-[#B45309]">&#9432;</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-[#8089A4]">{PLATFORM_FRAMING}</p>
    </div>
  )
}
