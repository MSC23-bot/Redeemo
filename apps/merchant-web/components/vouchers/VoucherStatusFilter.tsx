'use client'

import { cn } from '@/lib/utils'
import { FILTER_TABS, type VoucherFilterId } from '@/lib/voucher/displayState'

// Day-2 Vouchers B3: the All / Live / In review / Draft / Finished filter tabs
// (spec §3.3). Client-side filtering of the already-loaded custom rows.

export function VoucherStatusFilter({
  value,
  counts,
  onChange,
}: {
  value: VoucherFilterId
  counts: Record<VoucherFilterId, number>
  onChange: (id: VoucherFilterId) => void
}) {
  return (
    <div role="tablist" aria-label="Filter vouchers" className="flex flex-wrap gap-2">
      {FILTER_TABS.map((t) => {
        const active = t.id === value
        const count = counts[t.id] ?? 0
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
              active
                ? 'border-[#010C35] bg-[#010C35] text-white'
                : 'border-[#E5E7EB] bg-white text-[#1F2A4A] hover:bg-[#F8F9FA]',
            )}
          >
            {t.label}
            <span className={cn('text-xs font-bold', active ? 'text-white/80' : 'text-[#8089A4]')}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
