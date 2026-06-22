'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from '@/lib/icons'
import {
  deriveDisplayState,
  matchesFilter,
  filterBucketOf,
  type VoucherFilterId,
} from '@/lib/voucher/displayState'
import { VoucherCard, type VoucherCardData } from './VoucherCard'
import { VoucherStatusFilter } from './VoucherStatusFilter'

// Day-2 Vouchers B3: the list body. Flagship vouchers pinned/locked at the top;
// custom vouchers filtered client-side by the derived display state. The
// per-row action menu is injected via renderActions (B5) so this component owns
// no management logic.

export function VouchersList({
  flagship,
  custom,
  canCreate,
  onCreate,
  onOpen,
  renderActions,
}: {
  flagship: VoucherCardData[]
  custom: VoucherCardData[]
  canCreate: boolean
  onCreate: () => void
  onOpen: (id: string) => void
  renderActions?: (v: VoucherCardData) => React.ReactNode
}) {
  const [filter, setFilter] = React.useState<VoucherFilterId>('all')

  const counts = React.useMemo(() => {
    const c: Record<VoucherFilterId, number> = { all: custom.length, live: 0, 'in-review': 0, draft: 0, finished: 0 }
    for (const v of custom) {
      c[filterBucketOf(deriveDisplayState(v))] += 1
    }
    return c
  }, [custom])

  const visible = React.useMemo(
    () => custom.filter((v) => matchesFilter(deriveDisplayState(v), filter)),
    [custom, filter],
  )

  return (
    <div className="space-y-8">
      {flagship.length > 0 ? (
        <section data-testid="flagship-section" className="space-y-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#8089A4]">Flagship vouchers</h2>
            <p className="text-[13px] text-[#6B7390]">
              Always live. Edits go to review, and these cannot be deleted.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {flagship.map((v) => (
              <VoucherCard key={v.id} voucher={v} flagship />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#8089A4]">Your vouchers</h2>
          {canCreate ? (
            <Button variant="gradient" size="sm" onClick={onCreate}>
              <Plus size={16} /> Create a voucher
            </Button>
          ) : null}
        </div>

        {/* B-7 (spec 3.3): a small at-a-glance totals strip. changes-requested is
            counted under Draft and approved-waiting under In review (see counts). */}
        {custom.length > 0 ? (
          <div
            data-testid="voucher-stat-strip"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <StatTile testId="voucher-stat-total" label="Total" value={counts.all} />
            <StatTile testId="voucher-stat-live" label="Live" value={counts.live} />
            <StatTile testId="voucher-stat-in-review" label="In review" value={counts['in-review']} />
            <StatTile testId="voucher-stat-draft" label="Draft" value={counts.draft} />
          </div>
        ) : null}

        {custom.length > 0 ? <VoucherStatusFilter value={filter} counts={counts} onChange={setFilter} /> : null}

        {custom.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[#D7DBE2] bg-[#FFF9F5] p-8 text-center">
            <p className="font-display text-lg font-semibold text-[#010C35]">Create your first voucher</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-[#6B7390]">
              Build a custom offer of any type. Submit it for review and it goes live once approved
              and your business is live.
            </p>
            {canCreate ? (
              <div className="mt-4 flex justify-center">
                <Button variant="gradient" onClick={onCreate}>
                  <Plus size={16} /> Create a voucher
                </Button>
              </div>
            ) : null}
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-[12px] border border-[#E5E7EB] bg-white p-6 text-center text-sm text-[#6B7390]">
            No vouchers match this filter.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((v) => (
              <VoucherCard key={v.id} voucher={v} onOpen={onOpen} actions={renderActions?.(v)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatTile({ testId, label, value }: { testId: string; label: string; value: number }) {
  return (
    <div className="rounded-[12px] border border-[#E5E7EB] bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8089A4]">{label}</p>
      <p data-testid={testId} className="mt-0.5 font-display text-2xl font-semibold text-[#010C35]">
        {value}
      </p>
    </div>
  )
}
