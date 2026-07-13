'use client'

import { cn } from '@/lib/utils'
import type { DayTwoPickerId } from '../builder/builderModel'
import type { BuilderType } from '@/lib/voucher/terms'
import { TYPE_CARDS, BASE_MECHANIC_CARDS } from './constants'

// Voucher Builder shared core: the custom-lane type picker (7 cards; all 8 backend
// types, discount is one card whose fixed/percent kind is chosen in the fields). The
// two wrapper types (Time limited / Reusable) carry a "Builds on another voucher"
// pill (INVENTORY 2.1).

export function TypePicker({
  value,
  onChange,
}: {
  value: DayTwoPickerId | null
  onChange: (id: DayTwoPickerId) => void
}) {
  return (
    <div data-testid="builder-type-picker" className="grid gap-3 sm:grid-cols-2">
      {TYPE_CARDS.map((c) => {
        const active = c.id === value
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            aria-pressed={active}
            className={cn(
              'flex flex-col items-start gap-1 rounded-[14px] border bg-white p-4 text-left transition-all',
              active
                ? 'border-[#010C35] shadow-[var(--shadow-sm)]'
                : 'border-[#E5E7EB] hover:border-[#D1D5DB] hover:bg-[#F8F9FA]',
            )}
          >
            <span className="flex flex-wrap items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: 999, background: c.accent }} />
              <span className="text-[15px] font-bold text-[#010C35]">{c.label}</span>
              {c.wrapper ? (
                <span className="inline-flex items-center rounded-full bg-[#FEF6EC] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8A5A16]">
                  Builds on another voucher
                </span>
              ) : null}
            </span>
            <span className="text-[13px] leading-relaxed text-[#6B7390]">{c.blurb}</span>
          </button>
        )
      })}
    </div>
  )
}

// Wrapper Step 1: pick the base mechanic that runs during the schedule / interval.
export function BaseMechanicPicker({
  wrapper,
  value,
  onChange,
}: {
  wrapper: 'time' | 'reusable'
  value: BuilderType | null
  onChange: (id: BuilderType) => void
}) {
  const heading = wrapper === 'time' ? 'What runs during these times?' : 'What runs each time?'
  const helper =
    wrapper === 'time'
      ? 'A time limited voucher is one of your normal vouchers with a schedule attached. Pick the voucher, then set when it runs.'
      : 'A reusable voucher is one of your normal vouchers that a customer can use again and again. Pick the voucher, then set how often they can use it.'
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#8089A4]">Step 1</p>
        <p className="mt-1 text-[15px] font-bold text-[#010C35]">{heading}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">{helper}</p>
      </div>
      <div data-testid="base-mechanic-picker" className="grid gap-3 sm:grid-cols-2">
        {BASE_MECHANIC_CARDS.map((c) => {
          const active = c.id === value
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-start gap-1 rounded-[14px] border bg-white p-4 text-left transition-all',
                active
                  ? 'border-[#010C35] shadow-[var(--shadow-sm)]'
                  : 'border-[#E5E7EB] hover:border-[#D1D5DB] hover:bg-[#F8F9FA]',
              )}
            >
              <span className="flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: 999, background: c.accent }} />
                <span className="text-[15px] font-bold text-[#010C35]">{c.label}</span>
              </span>
              <span className="text-[13px] leading-relaxed text-[#6B7390]">{c.blurb}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
