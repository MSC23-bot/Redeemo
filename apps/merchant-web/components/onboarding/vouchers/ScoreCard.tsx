'use client'

import { Card } from '@/components/ui/card'
import { PLATFORM_FRAMING, type ScoreResult, type CalKey } from '@/lib/voucher/scoring'

// M2 F5: the "How this voucher stacks up" advisory score widget (S0 §4 + §7).
//
// CC-1 (LOCKED): this is ADVISORY. It NEVER blocks save/submit. It surfaces the meter
// (Too weak / Good / Great), the strengths, and the improvements, all from one fact
// set, so they can never disagree. The page/form leave Save + Submit ENABLED
// regardless of the score.

const METER_LABEL: Record<CalKey, string> = { weak: 'Too weak', good: 'Good', great: 'Great' }
const METER_COLOR: Record<CalKey, string> = { weak: '#B91C1C', good: '#B45309', great: '#0F7A3E' }
const METER_BG: Record<CalKey, string> = { weak: '#FEECEC', good: '#FEF6EC', great: '#E9F7EF' }

export function ScoreCard({ score }: { score: ScoreResult | null }) {
  if (!score) {
    return (
      <Card className="border-[#E5E7EB] p-5">
        <h2 className="font-display text-lg font-semibold text-[#010C35]">Pick what runs first</h2>
        <p className="mt-1 text-sm text-[#6B7390]">
          Choose the voucher in Step 1, then your score and live customer preview appear here.
        </p>
      </Card>
    )
  }

  return (
    <Card className="border-[#E5E7EB] p-5">
      <h2 className="font-display text-lg font-semibold text-[#010C35]">How this voucher stacks up</h2>

      {/* Meter */}
      <div data-testid="score-meter" className="mt-3 flex flex-col gap-2">
        <div className="flex gap-1.5">
          {score.meter.map((k) => {
            const active = k === score.calKey
            return (
              <span
                key={k}
                data-active={active}
                className="h-2 flex-1 rounded-full"
                style={{ background: active ? METER_COLOR[k] : '#EDE7E2' }}
              />
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold"
            style={{ background: METER_BG[score.calKey], color: METER_COLOR[score.calKey] }}
          >
            {METER_LABEL[score.calKey]}
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-[#455373]">{score.desc}</p>
      </div>

      {/* Strengths */}
      {score.strengths.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#0F7A3E]">What is strong about your voucher</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {score.strengths.map((s) => (
              <li key={s} className="flex gap-2 text-[13px] leading-relaxed text-[#1F2A4A]">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#0F7A3E]" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Improvements */}
      {score.improvements.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#B45309]">What could make it better</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {score.improvements.map((s) => (
              <li key={s} className="flex gap-2 text-[13px] leading-relaxed text-[#1F2A4A]">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#B45309]" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 border-t border-[#EFEAE6] pt-3 text-xs leading-relaxed text-[#8089A4]">
        {PLATFORM_FRAMING}
      </p>
    </Card>
  )
}
