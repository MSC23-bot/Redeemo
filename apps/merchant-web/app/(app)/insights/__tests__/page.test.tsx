/**
 * PR-B Task B8: the Insights & reports page (spec 2.3 / 11, screenshots 01 / 02).
 *
 * Assembles InsightsFilters + KpiCards + TrendChart + a tabbed section (Vouchers /
 * Branches / Customers / Busy times / Validation) + ReportsCard, driven by the B1
 * clients and the B3 filter state.
 *
 * Page-level + per-section states (spec 11, locked):
 *   - loading (a distinct loading state)
 *   - friendly error (a calm retry; ApiError mapped)
 *   - early-life "warming up" (screenshot 01: live but no eligible activity yet)
 *   - per-section truthful-zero vs "Not enough data yet" vs "Not available" (gated)
 *   - ACTIVE = real figures.
 *
 * LIFECYCLE (the server is the real boundary; the UI never half-renders a dashboard):
 *   - SUSPENDED -> the existing suspension screen (NOT a read-only Insights dashboard).
 *   - pre-live + every non-ACTIVE status -> server-blocked; the API returns
 *     403 MERCHANT_NOT_ACTIVE / MERCHANT_SUSPENDED; the page maps those to the
 *     lifecycle state, never a half-rendered dashboard.
 *   - STAFF never reaches the route (server 403 INSUFFICIENT_PERMISSIONS + nav hidden).
 *
 * NEGATIVE (spec 2.4): the page sub-headline is logged-primary; the prototype's
 * "counts validated redemptions only ... visits you actually honoured" is BANNED.
 */
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InsightsPage from '@/app/(app)/insights/page'
import { ApiError } from '@/lib/api/client'
import type {
  InsightsOverview,
  InsightsTrend,
  InsightsVouchers,
  InsightsBranches,
  InsightsValidation,
  InsightsBusyTimes,
  InsightsCustomers,
} from '@/lib/api/insights'
import type { Branch } from '@/lib/api/branch'

// --- mock the B1 Insights client (keep the real zod enums/types) -------------
jest.mock('@/lib/api/insights', () => ({
  __esModule: true,
  ...jest.requireActual('@/lib/api/insights'),
  getInsightsOverview: jest.fn(),
  getInsightsTrend: jest.fn(),
  getInsightsVouchers: jest.fn(),
  getInsightsBranches: jest.fn(),
  getInsightsValidation: jest.fn(),
  getInsightsBusyTimes: jest.fn(),
  getInsightsCustomers: jest.fn(),
  downloadInsightsExport: jest.fn(),
}))

import {
  getInsightsOverview,
  getInsightsTrend,
  getInsightsVouchers,
  getInsightsBranches,
  getInsightsValidation,
  getInsightsBusyTimes,
  getInsightsCustomers,
} from '@/lib/api/insights'

// --- mock the branch list (filter-bar source) --------------------------------
jest.mock('@/lib/api/branch', () => ({
  __esModule: true,
  listBranches: jest.fn(),
}))
import { listBranches } from '@/lib/api/branch'

// --- mock the lifecycle source (profile) + the owner/staff capability --------
interface ProfileData {
  status: string
  onboardingStep: string
  businessName: string
}
interface ProfileQuery {
  data?: ProfileData
  isLoading: boolean
  isError?: boolean
  refetch?: () => void
}
let mockProfile: ProfileQuery
jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ isAuthenticated: true }) }))
jest.mock('@/lib/auth/useMerchantProfile', () => ({ useMerchantProfile: () => mockProfile }))

let mockCapability = { isOwner: true, ready: true }
jest.mock('@/lib/branches/useBranchCapability', () => ({
  useBranchCapability: () => mockCapability,
}))

// Mutable so a test can seed the initial filter state (e.g. an active voucherType
// filter) from the URL the page reads once on mount.
let mockSearchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

const mockOverview = getInsightsOverview as jest.MockedFunction<typeof getInsightsOverview>
const mockTrend = getInsightsTrend as jest.MockedFunction<typeof getInsightsTrend>
const mockVouchers = getInsightsVouchers as jest.MockedFunction<typeof getInsightsVouchers>
const mockBranches = getInsightsBranches as jest.MockedFunction<typeof getInsightsBranches>
const mockValidation = getInsightsValidation as jest.MockedFunction<typeof getInsightsValidation>
const mockBusyTimes = getInsightsBusyTimes as jest.MockedFunction<typeof getInsightsBusyTimes>
const mockCustomers = getInsightsCustomers as jest.MockedFunction<typeof getInsightsCustomers>
const mockListBranches = listBranches as jest.MockedFunction<typeof listBranches>

// --- fixtures ----------------------------------------------------------------
const ACTIVE_PROFILE: ProfileData = {
  status: 'ACTIVE',
  onboardingStep: 'LIVE',
  businessName: 'Roe Cafe',
}

const OVERVIEW_WITH_DATA: InsightsOverview = {
  redemptionActivity: { logged: 61, confirmed: 49, awaiting: 12, comparison: null },
  distinctCustomers: { logged: 40, comparison: null },
  repeatRate: { value: 28, insufficient: false, comparison: null },
  savings: { estimatedLogged: 793, estimatedConfirmed: 638, awaiting: 155, comparison: null },
  meta: {
    scopeLabel: 'All branches',
    earliestDate: '2026-03-01',
    filtersEcho: { period: 'this_month', branchId: null, voucherType: null, from: null, to: null },
  },
}

// Behavioural gate CLOSED: the repeat-rate block comes back gated; the event-level
// CSV export shares the SAME server gate, so the dashboard must mark it Not-available.
const OVERVIEW_GATE_CLOSED: InsightsOverview = {
  ...OVERVIEW_WITH_DATA,
  repeatRate: { available: false },
}

// Live, no eligible activity: zero logged AND no earliest date -> warming up.
const OVERVIEW_WARMING_UP: InsightsOverview = {
  redemptionActivity: { logged: 0, confirmed: 0, awaiting: 0, comparison: null },
  distinctCustomers: { logged: 0, comparison: null },
  repeatRate: { value: null, insufficient: true, comparison: null },
  savings: { estimatedLogged: 0, estimatedConfirmed: 0, awaiting: 0, comparison: null },
  meta: {
    scopeLabel: 'All branches',
    earliestDate: null,
    filtersEcho: { period: 'this_month', branchId: null, voucherType: null, from: null, to: null },
  },
}

const TREND: InsightsTrend = {
  months: [
    { monthStartLondon: '2026-05-01', logged: 20, confirmed: 16 },
    { monthStartLondon: '2026-06-01', logged: 41, confirmed: 33 },
  ],
}
const VOUCHERS: InsightsVouchers = {
  top: [{ voucherId: 'v1', title: 'Buy one main, get one free', type7: 'BOGO', logged: 32, confirmed: 30, estimatedLogged: 416, estimatedConfirmed: 390 }],
  byType: [{ type7: 'BOGO', logged: 32, sharePct: 100 }],
}
const BRANCHES: InsightsBranches = {
  rows: [{ branchId: 'b1', name: 'Roe Cafe Soho', logged: 32, confirmed: 30, estimatedLogged: 416, estimatedConfirmed: 390 }],
}
const VALIDATION: InsightsValidation = { logged: 61, confirmed: 49, awaiting: 12, completionRate: 0.8, methods: [] }
const BUSY_TIMES: InsightsBusyTimes = {
  mode: 'intensity',
  grid: [{ day: 0, daypart: 2, intensity: 3 }],
  busiest: { day: 0, daypart: 2 },
}
const CUSTOMERS: InsightsCustomers = {
  newVsReturning: { newCount: 18, returningCount: 22, total: 40 },
  repeatRate: { value: 28, insufficient: false, comparison: null },
}
const BRANCH_LIST: Branch[] = [{ id: 'b1', name: 'Roe Cafe Soho' } as Branch]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <InsightsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockProfile = { data: ACTIVE_PROFILE, isLoading: false }
  mockCapability = { isOwner: true, ready: true }
  mockSearchParams = new URLSearchParams()
  mockOverview.mockReset().mockResolvedValue(OVERVIEW_WITH_DATA)
  mockTrend.mockReset().mockResolvedValue(TREND)
  mockVouchers.mockReset().mockResolvedValue(VOUCHERS)
  mockBranches.mockReset().mockResolvedValue(BRANCHES)
  mockValidation.mockReset().mockResolvedValue(VALIDATION)
  mockBusyTimes.mockReset().mockResolvedValue(BUSY_TIMES)
  mockCustomers.mockReset().mockResolvedValue(CUSTOMERS)
  mockListBranches.mockReset().mockResolvedValue(BRANCH_LIST)
})
afterEach(cleanup)

describe('InsightsPage (B8 assembly + states + lifecycle)', () => {
  it('renders the filter bar, KPIs, trend, tabs, and reports for an ACTIVE merchant with data', async () => {
    renderPage()
    // KPIs render once the overview resolves.
    expect(await screen.findByTestId('kpi-redemption-activity')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-distinct-customers')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-repeat-rate')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-savings')).toBeInTheDocument()
    // The trend chart (its own async query).
    expect(await screen.findByTestId('trend-chart')).toBeInTheDocument()
    // The global filter bar: the period trigger shows the current selection, and
    // opening it reveals the Period role=menu.
    const periodTrigger = screen.getByRole('button', { name: /this month/i })
    expect(periodTrigger).toBeInTheDocument()
    fireEvent.click(periodTrigger)
    expect(screen.getByRole('menu', { name: /period/i })).toBeInTheDocument()
    // The tab list (5 tabs) + the default Vouchers tab content.
    const tablist = screen.getByRole('tablist')
    expect(within(tablist).getAllByRole('tab')).toHaveLength(5)
    expect(await screen.findByTestId('top-vouchers-list')).toBeInTheDocument()
    // The reports card.
    expect(screen.getByTestId('insights-reports')).toBeInTheDocument()
  })

  it('exposes the CSV export when the server behavioural gate is OPEN (repeatRate present)', async () => {
    mockOverview.mockResolvedValue(OVERVIEW_WITH_DATA)
    renderPage()
    await screen.findByTestId('insights-reports')
    // gateOpen is DERIVED from the live overview (not hardcoded): the export is usable.
    expect(
      screen.getByRole('button', {
        name: /redemption activity csv excluding direct customer identifiers/i,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('csv-not-available')).not.toBeInTheDocument()
  })

  it('marks the CSV export Not-available when the server behavioural gate is CLOSED', async () => {
    mockOverview.mockResolvedValue(OVERVIEW_GATE_CLOSED)
    renderPage()
    await screen.findByTestId('insights-reports')
    expect(screen.getByTestId('csv-not-available')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /redemption activity csv excluding direct customer identifiers/i,
      }),
    ).not.toBeInTheDocument()
  })

  it('switches tabs (Validation tab renders its summary on selection)', async () => {
    renderPage()
    await screen.findByTestId('top-vouchers-list')
    fireEvent.click(screen.getByRole('tab', { name: /validation/i }))
    expect(await screen.findByTestId('validation-summary')).toBeInTheDocument()
  })

  it('shows the warming-up surface for a live merchant with no eligible activity', async () => {
    mockOverview.mockResolvedValue(OVERVIEW_WARMING_UP)
    renderPage()
    expect(await screen.findByText(/your insights are warming up/i)).toBeInTheDocument()
    // A "Manage your vouchers" CTA (screenshot 01).
    expect(screen.getByRole('link', { name: /manage your vouchers/i })).toBeInTheDocument()
    // It must NOT render the dashboard KPIs.
    expect(screen.queryByTestId('kpi-redemption-activity')).not.toBeInTheDocument()
  })

  it('does NOT trap the user in warming-up when an empty result is due to a filter (finding 7)', async () => {
    // An active voucherType filter that returns nothing (logged 0 + earliestDate null
    // UNDER that filter) must NOT trigger the module-wide warming-up takeover, because
    // the takeover hides the filter bar and the user could not clear the filter.
    mockSearchParams = new URLSearchParams('voucherType=BOGO')
    mockOverview.mockResolvedValue(OVERVIEW_WARMING_UP)
    renderPage()
    // The per-content filtered-empty state shows instead.
    expect(await screen.findByTestId('insights-filtered-empty')).toBeInTheDocument()
    expect(screen.getByText(/no data for this filter/i)).toBeInTheDocument()
    // The module-wide warming-up takeover must NOT appear.
    expect(screen.queryByTestId('insights-warming-up')).not.toBeInTheDocument()
    expect(screen.queryByText(/your insights are warming up/i)).not.toBeInTheDocument()
    // CRITICAL: the filter bar stays visible so the user can clear the filter.
    expect(screen.getByRole('button', { name: /buy one, get one free/i })).toBeInTheDocument()
  })

  it('shows a distinct page-level loading state', () => {
    mockOverview.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/loading your insights|preparing your insights/i)).toBeInTheDocument()
  })

  // A8: the page-level loading state is now a KPI-row + chart skeleton (not bare
  // text), inside a single role=status region.
  it('renders a KPI-row + chart skeleton (not bare text) while the overview is in flight', () => {
    mockOverview.mockReturnValue(new Promise(() => {}))
    renderPage()
    const status = screen.getByRole('status')
    expect(status.querySelectorAll('[data-testid="skeleton-bone"]').length).toBeGreaterThan(0)
  })

  it('shows a friendly error with retry when the overview fails (non-lifecycle ApiError)', async () => {
    mockOverview.mockRejectedValue(new ApiError(500, { error: { code: 'INTERNAL', message: 'boom' } }))
    renderPage()
    expect(await screen.findByText(/we could not load your insights/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('maps a 403 MERCHANT_NOT_ACTIVE to the lifecycle state, not a dashboard', async () => {
    mockOverview.mockRejectedValue(
      new ApiError(403, { error: { code: 'MERCHANT_NOT_ACTIVE', message: 'not active' } }),
    )
    renderPage()
    // The pre-live / not-available lifecycle copy, NOT the dashboard.
    expect(await screen.findByText(/insights unlock when your business is live/i)).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-redemption-activity')).not.toBeInTheDocument()
    expect(screen.queryByTestId('insights-reports')).not.toBeInTheDocument()
  })

  it('maps a 403 MERCHANT_SUSPENDED to the suspension screen, not a dashboard', async () => {
    mockOverview.mockRejectedValue(
      new ApiError(403, { error: { code: 'MERCHANT_SUSPENDED', message: 'suspended' } }),
    )
    renderPage()
    expect(await screen.findByText(/your account is suspended/i)).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-redemption-activity')).not.toBeInTheDocument()
  })

  it('renders the suspension screen up front for a SUSPENDED profile (no Insights fetch)', () => {
    mockProfile = { data: { ...ACTIVE_PROFILE, status: 'SUSPENDED' }, isLoading: false }
    renderPage()
    expect(screen.getByText(/your account is suspended/i)).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-redemption-activity')).not.toBeInTheDocument()
    // The dashboard data fetch is never fired for a suspended merchant.
    expect(mockOverview).not.toHaveBeenCalled()
  })

  it('renders a lifecycle lock up front for a pre-live (setup) profile (no Insights fetch)', () => {
    mockProfile = {
      data: { ...ACTIVE_PROFILE, status: 'REGISTERED', onboardingStep: 'REGISTERED' },
      isLoading: false,
    }
    renderPage()
    expect(screen.getByText(/insights unlock when your business is live/i)).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-redemption-activity')).not.toBeInTheDocument()
    expect(mockOverview).not.toHaveBeenCalled()
  })

  it('maps a 403 INSUFFICIENT_PERMISSIONS to a server-denied notice (Staff)', async () => {
    mockOverview.mockRejectedValue(
      new ApiError(403, { error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'denied' } }),
    )
    renderPage()
    expect(await screen.findByText(/do not have access to insights/i)).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-redemption-activity')).not.toBeInTheDocument()
  })

  it('uses logged-primary sub-headline copy, not the banned "honoured" wording', async () => {
    const { container } = renderPage()
    await screen.findByTestId('kpi-redemption-activity')
    expect(container.textContent ?? '').not.toMatch(/honoured/i)
    expect(container.textContent ?? '').not.toMatch(/visits you actually/i)
  })

  it('renders NO "delivered" wording anywhere on the page (banned-copy guard)', async () => {
    const { container } = renderPage()
    await screen.findByTestId('kpi-redemption-activity')
    expect(container.textContent ?? '').not.toMatch(/delivered/i)
  })
})

describe('navItems wiring', () => {
  it('points the Insights nav item at /insights (no "#"/soon placeholder)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NAV_GROUPS } = require('@/components/shell/navItems') as typeof import('@/components/shell/navItems')
    const items = NAV_GROUPS.flatMap((g) => g.items)
    const insights = items.find((i) => /insights/i.test(i.label))
    expect(insights).toBeDefined()
    expect(insights?.href).toBe('/insights')
    expect(insights?.soon).toBeFalsy()
  })
})
