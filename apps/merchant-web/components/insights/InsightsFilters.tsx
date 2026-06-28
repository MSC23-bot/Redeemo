'use client'

/**
 * PR-B Task B3: the Insights global filter bar.
 *
 * Three dropdown filters (period preset / branch / voucher type) plus an inline
 * From/To MONTH picker that appears for the custom range. The filter state is lifted
 * to the parent via onChange so the page can rebuild the React Query key.
 *
 * Scope-aware branch filter (spec section 7.2 + the section 2.4 authorization matrix):
 *   - owner                         -> "All branches" + every branch selectable
 *   - Branch Manager, several       -> "All my branches" (NEVER the owner label)
 *   - Branch Manager, exactly one   -> "Viewing: <Branch>" (no all-branches option)
 * The `branches` prop is the caller's already-server-scoped authorised list; the
 * client gate is display-only (the backend insightsScope is the real boundary).
 *
 * Comparison-chip + in-progress copy come from the pure comparisonState() helper so
 * a completed window reads "Compared with the previous period" and an incomplete one
 * (this month / custom ending in the current month) reads "In progress".
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens (never hardcoded hex).
 */
import * as React from 'react'
import { Calendar, MapPin, Filter, ChevronDown, Check } from '@/lib/icons'
import { insightsVoucherTypeLabel } from '@/lib/insights/display'
import {
  comparisonState,
  currentLondonMonth,
  type InsightsFilterState,
} from '@/lib/insights/filters'
import type { PeriodPreset, VoucherType7 } from '@/lib/api/insights'

export interface BranchOption {
  id: string
  name: string
}

export interface InsightsFiltersProps {
  state: InsightsFilterState
  onChange: (next: InsightsFilterState) => void
  /** The caller's authorised branches (already server-scoped). */
  branches: BranchOption[]
  /** Owner vs Branch Manager (drives the all-branches label, never widens scope). */
  isOwner: boolean
  /** Injectable clock for deterministic in-progress / max-month tests. */
  now?: Date
}

const PERIOD_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3m', label: 'Last 3 months' },
  { value: 'last_6m', label: 'Last 6 months' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
]

const VOUCHER_TYPE_OPTIONS: VoucherType7[] = [
  'BOGO',
  'SPEND_AND_SAVE',
  'DISCOUNT',
  'FREEBIE',
  'PACKAGE_DEAL',
  'TIME_LIMITED',
  'REUSABLE',
]

const ALL_SENTINEL = '__all__'

// --- a small accessible dropdown (button + role=menu + menuitemradio) ---------
// Hand-rolled (no portal) so the menu roles + aria-checked are deterministic in
// jsdom and there is no new dependency. Closes on outside click + Escape.

interface DropdownOption {
  value: string
  label: string
}

function FilterDropdown({
  menuLabel,
  triggerLabel,
  subLabel,
  icon,
  value,
  options,
  onSelect,
}: {
  /** Accessible name of the role=menu (e.g. "Period"). */
  menuLabel: string
  /** The visible trigger label (current selection). */
  triggerLabel: string
  /** Optional second line under the trigger label (the comparison copy). */
  subLabel?: string
  icon: React.ReactNode
  value: string
  options: DropdownOption[]
  onSelect: (value: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[180px] items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--tint)]"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          aria-hidden
        >
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{triggerLabel}</span>
          {subLabel ? (
            <span className="truncate text-xs text-muted-foreground">{subLabel}</span>
          ) : null}
        </span>
        <ChevronDown size={16} className="shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={menuLabel}
          className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-full overflow-hidden rounded-xl border bg-popover py-1 shadow-[0_24px_60px_-24px_rgba(1,12,53,0.4)]"
          style={{ borderColor: 'var(--border)' }}
        >
          {options.map((opt) => {
            const selected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onSelect(opt.value)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-[var(--tint)]"
              >
                <span className="whitespace-nowrap">{opt.label}</span>
                {selected ? (
                  <Check size={16} style={{ color: 'var(--rose)' }} aria-hidden />
                ) : (
                  <span className="w-4" aria-hidden />
                )}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// --- the filter bar ----------------------------------------------------------

export function InsightsFilters({
  state,
  onChange,
  branches,
  isOwner,
  now,
}: InsightsFiltersProps) {
  const clock = now ?? new Date()
  const cmp = comparisonState(state, clock)
  const maxMonth = currentLondonMonth(clock)

  // A Branch Manager scoped to exactly one branch cannot widen scope: no
  // all-branches option, and the trigger reads "Viewing: <Branch>".
  const bmSingleBranch = !isOwner && branches.length === 1

  // Period dropdown. Switching away from custom drops any stale from/to so the query
  // never carries an orphaned custom range.
  function selectPeriod(value: string) {
    const period = value as PeriodPreset
    if (period === 'custom') {
      onChange({ ...state, period })
    } else {
      onChange({
        period,
        branchId: state.branchId,
        voucherType: state.voucherType,
      })
    }
  }

  function selectBranch(value: string) {
    onChange({ ...state, branchId: value === ALL_SENTINEL ? undefined : value })
  }

  function selectVoucherType(value: string) {
    onChange({
      ...state,
      voucherType: value === ALL_SENTINEL ? undefined : (value as VoucherType7),
    })
  }

  // --- labels ---------------------------------------------------------------
  const activePeriodLabel =
    PERIOD_OPTIONS.find((p) => p.value === state.period)?.label ?? 'This month'

  const periodSubLabel = cmp.hasComparison
    ? 'Compared with the previous period'
    : cmp.inProgress
      ? 'In progress'
      : undefined

  // Branch trigger label by scope.
  const selectedBranch = state.branchId
    ? branches.find((b) => b.id === state.branchId)
    : undefined
  const allBranchesLabel = isOwner ? 'All branches' : 'All my branches'
  let branchTriggerLabel: string
  if (bmSingleBranch) {
    branchTriggerLabel = `Viewing: ${branches[0].name}`
  } else if (selectedBranch) {
    branchTriggerLabel = selectedBranch.name
  } else {
    branchTriggerLabel = allBranchesLabel
  }

  // Branch menu options. A single-branch BM gets no dropdown (the scope is fixed).
  const branchOptions: DropdownOption[] = [
    { value: ALL_SENTINEL, label: allBranchesLabel },
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ]

  const voucherTriggerLabel = state.voucherType
    ? insightsVoucherTypeLabel(state.voucherType)
    : 'All voucher types'
  const voucherOptions: DropdownOption[] = [
    { value: ALL_SENTINEL, label: 'All voucher types' },
    ...VOUCHER_TYPE_OPTIONS.map((t) => ({ value: t, label: insightsVoucherTypeLabel(t) })),
  ]

  return (
    <div className="flex flex-wrap items-start gap-3">
      <FilterDropdown
        menuLabel="Period"
        triggerLabel={activePeriodLabel}
        subLabel={periodSubLabel}
        icon={<Calendar size={16} />}
        value={state.period}
        options={PERIOD_OPTIONS}
        onSelect={selectPeriod}
      />

      {state.period === 'custom' ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            From
            <input
              type="month"
              max={maxMonth}
              value={state.from ?? ''}
              onChange={(e) => onChange({ ...state, from: e.target.value || undefined })}
              className="h-10 rounded-xl border bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              style={{ borderColor: 'var(--border)' }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            To
            <input
              type="month"
              max={maxMonth}
              value={state.to ?? ''}
              onChange={(e) => onChange({ ...state, to: e.target.value || undefined })}
              className="h-10 rounded-xl border bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              style={{ borderColor: 'var(--border)' }}
            />
          </label>
        </div>
      ) : null}

      {bmSingleBranch ? (
        // Fixed scope: no dropdown to widen scope, just a disabled scope pill that
        // still reads as a button so its accessible name is discoverable.
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex min-w-[180px] cursor-default items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-left"
          style={{ borderColor: 'var(--border)' }}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'var(--tint)', color: 'var(--coral)' }}
            aria-hidden
          >
            <MapPin size={16} />
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {branchTriggerLabel}
          </span>
        </button>
      ) : (
        <FilterDropdown
          menuLabel="Branch"
          triggerLabel={branchTriggerLabel}
          icon={<MapPin size={16} />}
          value={state.branchId ?? ALL_SENTINEL}
          options={branchOptions}
          onSelect={selectBranch}
        />
      )}

      <FilterDropdown
        menuLabel="Voucher type"
        triggerLabel={voucherTriggerLabel}
        icon={<Filter size={16} />}
        value={state.voucherType ?? ALL_SENTINEL}
        options={voucherOptions}
        onSelect={selectVoucherType}
      />
    </div>
  )
}
