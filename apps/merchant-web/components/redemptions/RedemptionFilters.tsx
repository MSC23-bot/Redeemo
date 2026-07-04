'use client'

/**
 * F1: the Redemptions log filter row. Branch (All / per-branch), status, date
 * range (from / to), voucher type, and a code search. Lifts every change to the
 * parent via onChange so the page can rebuild the React Query key. House style:
 * no em dashes; brand tokens via globals.css.
 */
import * as React from 'react'
import { Input } from '@/components/ui/input'
import { voucherTypeLabel } from '@/lib/redemptions/display'
import type { RedemptionFilters as Filters } from '@/lib/api/redemptions'

const VOUCHER_TYPES = [
  'BOGO',
  'SPEND_AND_SAVE',
  'DISCOUNT_FIXED',
  'DISCOUNT_PERCENT',
  'FREEBIE',
  'PACKAGE_DEAL',
  'TIME_LIMITED',
  'REUSABLE',
] as const

interface BranchOption {
  id: string
  name: string
}

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
const labelClass = 'flex flex-col gap-1 text-xs font-semibold text-muted-foreground'

export interface VoucherOption {
  id: string
  title: string
}

export function RedemptionFilters({
  filters,
  branches,
  vouchers = [],
  onChange,
}: {
  filters: Filters
  branches: BranchOption[]
  /** Redemptions fidelity: per-voucher filter options (custom + flagship). */
  vouchers?: VoucherOption[]
  onChange: (patch: Partial<Filters>) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
      <label className={labelClass}>
        Branch
        <select
          className={selectClass}
          value={filters.branchId ?? ''}
          onChange={(e) => onChange({ branchId: e.target.value || undefined })}
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Status
        <select
          className={selectClass}
          value={filters.status ?? ''}
          onChange={(e) =>
            onChange({ status: (e.target.value || undefined) as Filters['status'] })
          }
        >
          <option value="">All statuses</option>
          <option value="awaiting">Awaiting validation</option>
          <option value="validated">Validated</option>
        </select>
      </label>

      <label className={labelClass}>
        Voucher type
        <select
          className={selectClass}
          value={filters.voucherType ?? ''}
          onChange={(e) => onChange({ voucherType: e.target.value || undefined })}
        >
          <option value="">All types</option>
          {VOUCHER_TYPES.map((t) => (
            <option key={t} value={t}>
              {voucherTypeLabel(t)}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        From
        <Input
          type="date"
          className="w-[160px]"
          value={filters.from ? filters.from.slice(0, 10) : ''}
          onChange={(e) =>
            onChange({ from: e.target.value ? new Date(e.target.value + 'T00:00:00.000Z').toISOString() : undefined })
          }
        />
      </label>

      <label className={labelClass}>
        To
        <Input
          type="date"
          className="w-[160px]"
          value={filters.to ? filters.to.slice(0, 10) : ''}
          onChange={(e) =>
            onChange({ to: e.target.value ? new Date(e.target.value + 'T23:59:59.999Z').toISOString() : undefined })
          }
        />
      </label>

      {vouchers.length > 0 ? (
        <label className={labelClass}>
          Voucher
          <select
            className={selectClass}
            value={filters.voucherId ?? ''}
            onChange={(e) => onChange({ voucherId: e.target.value || undefined })}
          >
            <option value="">All vouchers</option>
            {/* A deep-linked voucherId can predate/miss the options load; a
                fallback option keeps the select honest instead of blank. */}
            {filters.voucherId && !vouchers.some((v) => v.id === filters.voucherId) ? (
              <option value={filters.voucherId}>Selected voucher</option>
            ) : null}
            {vouchers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={labelClass}>
        Sort
        <select
          className={selectClass}
          value={filters.sort ?? ''}
          onChange={(e) => onChange({ sort: (e.target.value || undefined) as Filters['sort'] })}
        >
          <option value="">Newest first</option>
          <option value="saving">Biggest saving</option>
        </select>
      </label>
      <label className={labelClass}>
        Search
        <Input
          type="text"
          placeholder="Code or voucher"
          maxLength={64}
          className="w-[160px]"
          value={filters.code ?? ''}
          onChange={(e) => onChange({ code: e.target.value || undefined })}
        />
      </label>
    </div>
  )
}
