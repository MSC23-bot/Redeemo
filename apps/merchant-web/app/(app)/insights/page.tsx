'use client'

/**
 * PR-B Task B8: the Insights & reports page (spec 2.3 / 11, screenshots 01 / 02).
 *
 * Assembles the global filter bar (B3) + the overview KPI cards (B4) + the trend chart
 * (B5) + a tabbed section over the five behavioural/operational tabs (B6a/B6b) + the
 * reports card (B7), driven by the B1 clients and the B3 filter state. The filter state
 * is the single React Query key input; every child re-fetches on a filter change.
 *
 * Lifecycle (spec 7.2 / 11; the SERVER is the real boundary, the UI never half-renders
 * a dashboard):
 *   - The profile lifecycle (deriveStatusPill) gates the surface UP FRONT so a
 *     pre-live / suspended merchant never even fires the Insights reads:
 *       - SUSPENDED -> the existing suspension screen (NOT a read-only dashboard).
 *       - setup / changes / submitted / in_review / rejected -> a calm "unlocks when
 *         you go live" lock.
 *       - live -> the dashboard.
 *   - The dashboard's own /overview query maps the backend codes as defence-in-depth:
 *     MERCHANT_NOT_ACTIVE (pre-live / inactive / deleted) and MERCHANT_SUSPENDED map to
 *     the same lifecycle states; INSUFFICIENT_PERMISSIONS (a STAFF caller who somehow
 *     reaches the route) maps to a server-denied notice; any other ApiError is a calm
 *     friendly-error with retry.
 *   - Early-life: a live merchant with no eligible activity at all (zero logged AND no
 *     earliest included date) sees the "Your insights are warming up" empty state with a
 *     Manage your vouchers CTA, NOT a wall of zeroes (spec 11, screenshot 01). A
 *     narrow-filter zero (history exists, this window is empty) is a truthful zero in the
 *     dashboard, not the module-wide warming-up state.
 *
 * NEGATIVE (spec 2.4): the page sub-headline is logged-primary. The prototype's
 * "counts validated redemptions only ... visits you actually honoured" sub-headline is
 * BANNED.
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens (never hardcoded hex).
 */
import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Ticket, MapPin, Users, Clock, CircleCheck, Filter } from '@/lib/icons'
import {
  getInsightsOverview,
  getInsightsTrend,
  type InsightsFilters,
} from '@/lib/api/insights'
import { listBranches } from '@/lib/api/branch'
import { ApiError } from '@/lib/api/client'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { useBranchCapability } from '@/lib/branches/useBranchCapability'
import { deriveStatusPill } from '@/lib/auth/lifecycle'
import { LifecycleHome } from '@/components/onboarding/LifecycleHome'
import {
  DEFAULT_FILTERS,
  parseFilters,
  serialiseFilters,
  type InsightsFilterState,
} from '@/lib/insights/filters'
import { resolveScopeLabel } from '@/lib/insights/display'
import { InsightsFilters as FilterBar, type BranchOption } from '@/components/insights/InsightsFilters'
import { KpiCards } from '@/components/insights/KpiCards'
import { TrendChart } from '@/components/insights/TrendChart'
import { LoadingStatus, SkeletonChartBlock } from '@/components/ui/skeleton'
import { ReportsCard } from '@/components/insights/ReportsCard'
import {
  PageHeader,
  InsightsLocked,
  InsightsAccessDenied,
  InsightsWarmingUp,
  InsightsLoading,
  InsightsError,
} from '@/components/insights/InsightsLifecycleStates'
import { VouchersTab } from '@/components/insights/tabs/VouchersTab'
import { BranchesTab } from '@/components/insights/tabs/BranchesTab'
import { CustomersTab } from '@/components/insights/tabs/CustomersTab'
import { BusyTimesTab } from '@/components/insights/tabs/BusyTimesTab'
import { ValidationTab } from '@/components/insights/tabs/ValidationTab'

// --- the tabbed section -------------------------------------------------------

type TabId = 'vouchers' | 'branches' | 'customers' | 'busy-times' | 'validation'

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'vouchers', label: 'Vouchers', icon: <Ticket size={16} /> },
  { id: 'branches', label: 'Branches', icon: <MapPin size={16} /> },
  { id: 'customers', label: 'Customers', icon: <Users size={16} /> },
  { id: 'busy-times', label: 'Busy times', icon: <Clock size={16} /> },
  { id: 'validation', label: 'Validation', icon: <CircleCheck size={16} /> },
]

function InsightsTabs({ filters }: { filters: InsightsFilters }) {
  const [active, setActive] = React.useState<TabId>('vouchers')
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([])

  // WAI-ARIA roving tabindex: Left/Right move between tabs (wrapping), Home/End jump to the ends.
  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = index
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    setActive(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Insights sections">
      <div
        role="tablist"
        aria-label="Insights sections"
        className="flex flex-wrap gap-1 rounded-2xl border bg-card p-1.5"
        style={{ borderColor: 'var(--border)' }}
      >
        {TABS.map((t, index) => {
          const selected = t.id === active
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`insights-tab-${t.id}`}
              ref={(el) => {
                tabRefs.current[index] = el
              }}
              aria-selected={selected}
              aria-controls={`insights-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, index)}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors"
              style={
                selected
                  ? { background: 'var(--navy)', color: 'var(--page)' }
                  : { background: 'transparent', color: 'var(--text-secondary)' }
              }
            >
              <span aria-hidden style={{ color: selected ? 'var(--page)' : 'var(--coral)' }}>
                {t.icon}
              </span>
              {t.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`insights-panel-${active}`}
        aria-labelledby={`insights-tab-${active}`}
      >
        {active === 'vouchers' ? <VouchersTab filters={filters} /> : null}
        {active === 'branches' ? <BranchesTab filters={filters} /> : null}
        {active === 'customers' ? <CustomersTab filters={filters} /> : null}
        {active === 'busy-times' ? <BusyTimesTab filters={filters} /> : null}
        {active === 'validation' ? <ValidationTab filters={filters} /> : null}
      </div>
    </section>
  )
}

// --- the live dashboard (only mounted for an ACTIVE merchant) -----------------

function InsightsDashboard() {
  const session = useSession()
  const searchParams = useSearchParams()

  // Seed the filter state from the URL once, then own it locally. The filter bar is
  // the single React Query key input; serialiseFilters produces the exact query object.
  const initial = React.useMemo<InsightsFilterState>(
    () =>
      searchParams
        ? parseFilters(new URLSearchParams(searchParams.toString()))
        : DEFAULT_FILTERS,
    // searchParams is read once for the seed; the local state owns it thereafter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [filterState, setFilterState] = React.useState<InsightsFilterState>(initial)
  const filters: InsightsFilters = React.useMemo(
    () => serialiseFilters(filterState),
    [filterState],
  )

  // The owner/branch-manager signal (drives the filter bar all-branches label only;
  // never widens scope) + the authorised branch list (already server-scoped).
  const capability = useBranchCapability(session.isAuthenticated)
  const branchesQuery = useQuery({
    queryKey: ['merchantBranches'],
    queryFn: listBranches,
    staleTime: 60_000,
    enabled: session.isAuthenticated,
  })
  const branchOptions: BranchOption[] = React.useMemo(
    () => (branchesQuery.data ?? []).map((b) => ({ id: b.id, name: b.name })),
    [branchesQuery.data],
  )

  // The page-level data source. A failure here maps the backend lifecycle codes
  // (defence-in-depth) so the page never half-renders a dashboard.
  const overview = useQuery({
    queryKey: ['insights', 'overview', filters],
    queryFn: () => getInsightsOverview(filters),
    staleTime: 60_000,
  })

  if (overview.isLoading) return <InsightsLoading />

  if (overview.isError) {
    const code = overview.error instanceof ApiError ? overview.error.code : undefined
    if (code === 'MERCHANT_SUSPENDED') {
      return <LifecycleHome state="suspended" businessName={session.businessName ?? ''} status={null} />
    }
    if (code === 'MERCHANT_NOT_ACTIVE') return <InsightsLocked />
    if (code === 'INSUFFICIENT_PERMISSIONS') return <InsightsAccessDenied />
    return <InsightsError onRetry={() => overview.refetch()} />
  }

  const data = overview.data
  if (!data) return <InsightsError onRetry={() => overview.refetch()} />

  // A branch and/or voucher-type filter narrows the dataset (earliestDate is itself
  // branch + voucher-type filtered, but NOT period filtered). So a filter is "active"
  // for trap purposes when EITHER of those is set.
  const filterActive = Boolean(filterState.branchId || filterState.voucherType)

  // Early-life MODULE-WIDE warming-up: genuinely NO eligible activity ever for the WHOLE
  // merchant. earliestDate ignores the period window but IS branch + voucher-type
  // filtered, so it is only a trustworthy "never any activity" signal when NO branch /
  // voucher-type filter is active. Reserving the module takeover for that case means a
  // narrow filter that returns nothing can never strand the user without the filter bar.
  const warmingUp =
    !filterActive &&
    data.redemptionActivity.logged === 0 &&
    data.meta.earliestDate === null
  if (warmingUp) return <InsightsWarmingUp />

  // FILTERED-EMPTY (the trap fix): a branch / voucher-type filter that returns no eligible
  // activity at all (earliestDate null under that filter). Keep the filter bar visible so
  // the user can clear the filter; show a per-content "No data for this filter" empty
  // state in place of the data body rather than the module-wide warming-up takeover.
  const filteredEmpty =
    filterActive &&
    data.redemptionActivity.logged === 0 &&
    data.meta.earliestDate === null

  // The backend emits a "Viewing: selected branch" PLACEHOLDER for a single-branch view
  // (it never enumerates branch names server-side). Resolve the human branch NAME from
  // the authorised branch options we already hold for the reports / printable selection.
  const resolvedScopeLabel = resolveScopeLabel(
    data.meta.scopeLabel,
    filterState.branchId,
    branchOptions,
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader />

      <FilterBar
        state={filterState}
        onChange={setFilterState}
        branches={branchOptions}
        isOwner={capability.isOwner}
      />

      {filteredEmpty ? (
        <FilteredEmpty
          onClear={() =>
            setFilterState({ period: filterState.period })
          }
        />
      ) : (
        <>
          <KpiCards overview={data} />

          <TrendChartCard filters={filters} />

          <InsightsTabs filters={filters} />

          {/*
            The event-level CSV export shares the SERVER behavioural gate with the
            repeat-rate block: when the gate is closed the /overview repeatRate comes
            back as { available:false } and /export.csv returns { available:false }
            too. Deriving gateOpen from the live response (rather than a hardcoded
            flag) means the export becomes available the moment the server gate opens.
          */}
          <ReportsCard
            filters={filters}
            scopeLabel={resolvedScopeLabel}
            gateOpen={!('available' in data.repeatRate)}
          />
        </>
      )}
    </div>
  )
}

// --- the filtered-empty per-content state (filter bar stays visible) ----------
// Distinct from the module-wide warming-up takeover: history exists for the merchant,
// but the active branch / voucher-type filter matched nothing. The filter bar above
// stays rendered so the user is never stranded; this offers a one-tap clear.

function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <section
      data-testid="insights-filtered-empty"
      role="status"
      className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-6 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: 'var(--tint)', color: 'var(--coral)' }}
        aria-hidden
      >
        <Filter size={22} />
      </span>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--navy)' }}>
        No data for this filter
      </h2>
      <p className="max-w-[60ch] text-sm" style={{ color: 'var(--text-secondary)' }}>
        There is no redemption activity for the branch and voucher type you have selected.
        Try a different branch or voucher type, or clear the filters to see all your
        activity.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-1 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: 'var(--navy)' }}
      >
        Clear filters
      </button>
    </section>
  )
}

// --- the trend chart card (its own query so it has its own loading/error) -----

function TrendChartCard({ filters }: { filters: InsightsFilters }) {
  const trend = useQuery({
    queryKey: ['insights', 'trend', filters],
    queryFn: () => getInsightsTrend(filters),
    staleTime: 60_000,
  })

  if (trend.isLoading) {
    return (
      <LoadingStatus label="Loading the trend...">
        <SkeletonChartBlock />
      </LoadingStatus>
    )
  }
  if (trend.isError || !trend.data) {
    return (
      <div
        className="rounded-2xl border bg-card p-5 text-sm shadow-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        We could not load the trend just now. Please try again.
      </div>
    )
  }
  return <TrendChart trend={trend.data} />
}

// --- the page (lifecycle gate -> dashboard) ----------------------------------

export default function InsightsPage() {
  const session = useSession()
  const profile = useMerchantProfile(session.isAuthenticated)

  // Hold until the profile (the lifecycle source) resolves so the surface never
  // flashes the wrong state.
  if (profile.isLoading || !profile.data) {
    if (profile.isError) {
      return <InsightsError onRetry={() => profile.refetch?.()} />
    }
    return <InsightsLoading />
  }

  const state = deriveStatusPill(profile.data)

  // SUSPENDED -> the existing suspension screen (no Insights data, never a read-only
  // dashboard). The dashboard query is never mounted.
  if (state === 'suspended') {
    return (
      <LifecycleHome
        state="suspended"
        businessName={profile.data.businessName}
        status={null}
      />
    )
  }

  // Any non-live lifecycle (setup / changes / submitted / in_review / rejected) ->
  // the calm "unlocks when you go live" lock. The server blocks these too.
  // deriveStatusPill collapses live_new into 'live' (no backend signal), so 'live'
  // is the only live value to gate on.
  if (state !== 'live') {
    return <InsightsLocked />
  }

  return <InsightsDashboard />
}
