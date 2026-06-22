'use client'

import { cn } from '@/lib/utils'
import type { DayTwoPickerId } from './builderModel'

// Day-2 Vouchers B2: the decoupled type picker. ALL 8 types are selectable here
// (7 cards: discount is one card whose fixed/percent kind is chosen in the
// fields). This is the key divergence from the onboarding flagship picker, which
// disables Time limited + Reusable.

interface PickerCard {
  id: DayTwoPickerId
  label: string
  blurb: string
  accent: string
}

const CARDS: PickerCard[] = [
  { id: 'bogo', label: 'Buy one, get one free', blurb: 'The easiest to understand and the strongest at bringing people in.', accent: '#7C3AED' },
  { id: 'spend', label: 'Spend & save', blurb: 'Reward customers who spend a little more in one visit.', accent: '#E84A00' },
  { id: 'discount', label: 'Discount', blurb: 'A straight saving off the price, fixed or a percentage.', accent: '#E20C04' },
  { id: 'freebie', label: 'Freebie', blurb: 'Give a free item, on its own or with a purchase.', accent: '#16A34A' },
  { id: 'package', label: 'Package deal', blurb: 'Bundle a few items together at one set price.', accent: '#2563EB' },
  { id: 'time', label: 'Time limited', blurb: 'A saving on your quieter days or hours.', accent: '#D97706' },
  { id: 'reusable', label: 'Reusable', blurb: 'A small offer customers can come back and use again.', accent: '#0D9488' },
]

export function TypePicker({
  value,
  onChange,
}: {
  value: DayTwoPickerId | null
  onChange: (id: DayTwoPickerId) => void
}) {
  return (
    <div data-testid="builder-type-picker" className="grid gap-3 sm:grid-cols-2">
      {CARDS.map((c) => {
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
  )
}
