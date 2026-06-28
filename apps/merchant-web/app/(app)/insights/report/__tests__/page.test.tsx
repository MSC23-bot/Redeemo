/**
 * PR-B Task B7: the client-rendered printable performance summary (spec 10.2).
 *
 * AGGREGATE-ONLY: it separates Logged / Confirmed / Awaiting totals, states the active
 * period / branch scope / voucher filter, and the generation date, with a "Print or save
 * report" affordance that calls window.print(). It carries NO event-level / per-customer
 * rows and uses the Decision-11 savings terminology (never "delivered").
 *
 * LIFECYCLE (mirrors the dashboard page; final-review finding 1): the profile lifecycle
 * gates the surface up front (SUSPENDED -> suspension screen; pre-live -> lock) and the
 * /overview query maps the backend codes (MERCHANT_NOT_ACTIVE / MERCHANT_SUSPENDED /
 * INSUFFICIENT_PERMISSIONS) to the SAME proper states the dashboard shows, never a
 * generic error.
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReportPage from '@/app/(app)/insights/report/page'
import { ApiError } from '@/lib/api/client'
import type { InsightsOverview } from '@/lib/api/insights'
import type { Branch } from '@/lib/api/branch'

// Keep the real schemas/types (lib/insights/filters depends on the zod enums) and
// override only the fetcher. requireActual preserves periodPresetSchema etc.
jest.mock('@/lib/api/insights', () => ({
  __esModule: true,
  ...jest.requireActual('@/lib/api/insights'),
  getInsightsOverview: jest.fn(),
}))

import { getInsightsOverview } from '@/lib/api/insights'

const mockOverview = getInsightsOverview as jest.MockedFunction<typeof getInsightsOverview>

// The authorised branch list (used to resolve the scope-label branch name).
jest.mock('@/lib/api/branch', () => ({
  __esModule: true,
  listBranches: jest.fn(),
}))
import { listBranches } from '@/lib/api/branch'
const mockListBranches = listBranches as jest.MockedFunction<typeof listBranches>

// The lifecycle source (profile) + the session (businessName / auth).
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
jest.mock('@/lib/auth/session', () => ({
  useSession: () => ({ isAuthenticated: true, businessName: 'Roe Cafe' }),
}))
jest.mock('@/lib/auth/useMerchantProfile', () => ({ useMerchantProfile: () => mockProfile }))

// The printable reads the active filters from the URL.
let searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}))

const ACTIVE_PROFILE: ProfileData = {
  status: 'ACTIVE',
  onboardingStep: 'LIVE',
  businessName: 'Roe Cafe',
}

const OVERVIEW: InsightsOverview = {
  redemptionActivity: { logged: 61, confirmed: 49, awaiting: 12, comparison: null },
  distinctCustomers: { logged: 40, comparison: null },
  repeatRate: { value: 28, insufficient: false, comparison: null },
  savings: {
    estimatedLogged: 793,
    estimatedConfirmed: 638,
    awaiting: 155,
    comparison: null,
  },
  meta: {
    scopeLabel: 'All branches',
    earliestDate: '2026-03-01',
    filtersEcho: {
      period: 'this_month',
      branchId: null,
      voucherType: null,
      from: null,
      to: null,
    },
  },
}

const BRANCH_LIST: Branch[] = [{ id: 'b1', name: 'Roe Cafe Soho' } as Branch]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ReportPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockProfile = { data: ACTIVE_PROFILE, isLoading: false }
  mockOverview.mockReset()
  mockOverview.mockResolvedValue(OVERVIEW)
  mockListBranches.mockReset()
  mockListBranches.mockResolvedValue(BRANCH_LIST)
  searchParams = new URLSearchParams('period=this_month')
})
afterEach(cleanup)

describe('Insights printable report page', () => {
  it('renders the aggregate Logged / Confirmed / Awaiting totals', async () => {
    renderPage()
    await screen.findByText('61')
    // Each aggregate total is shown with its label.
    expect(screen.getByText('61')).toBeInTheDocument()
    expect(screen.getByText('49')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getAllByText(/logged/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/confirmed/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/awaiting/i).length).toBeGreaterThanOrEqual(1)
  })

  it('states the period / branch scope / voucher filter for the selection', async () => {
    searchParams = new URLSearchParams('period=last_month&voucherType=BOGO')
    renderPage()
    await screen.findByText('61')
    expect(screen.getByText(/last month/i)).toBeInTheDocument()
    // The scope label is sourced from the overview meta (no branch filter -> raw label).
    expect(screen.getAllByText(/All branches/i).length).toBeGreaterThanOrEqual(1)
    // The voucher filter uses the LOCKED Insights label (spec 1.16).
    expect(screen.getByText('Buy one, get one free')).toBeInTheDocument()
  })

  it('resolves the human branch NAME for the scope label when a branchId filter is active', async () => {
    // The backend emits the "Viewing: selected branch" placeholder for a single branch.
    mockOverview.mockResolvedValue({
      ...OVERVIEW,
      meta: { ...OVERVIEW.meta, scopeLabel: 'Viewing: selected branch' },
    })
    searchParams = new URLSearchParams('period=last_month&branchId=b1')
    renderPage()
    await screen.findByText('61')
    // The placeholder is replaced with the real branch name from the authorised list.
    expect(screen.getByText('Viewing: Roe Cafe Soho')).toBeInTheDocument()
    expect(screen.queryByText('Viewing: selected branch')).not.toBeInTheDocument()
  })

  it('states a generation date', async () => {
    renderPage()
    await screen.findByText('61')
    expect(screen.getByText(/generated/i)).toBeInTheDocument()
  })

  it('offers a "Print or save report" affordance that calls window.print', async () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {})
    renderPage()
    await screen.findByText('61')
    fireEvent.click(screen.getByRole('button', { name: /print or save report/i }))
    expect(printSpy).toHaveBeenCalledTimes(1)
    printSpy.mockRestore()
  })

  it('renders NO event-level / per-customer rows (aggregate-only)', async () => {
    const { container } = renderPage()
    await screen.findByText('61')
    // There must be no data table of individual redemptions.
    expect(container.querySelector('table')).toBeNull()
    // And no Customer column / customer identity wording.
    expect(container.textContent ?? '').not.toMatch(/customer name|redemption code/i)
  })

  it('renders NO "delivered" wording (banned-copy guard)', async () => {
    const { container } = renderPage()
    await screen.findByText('61')
    expect(container.textContent ?? '').not.toMatch(/delivered/i)
  })

  it('shows the estimated savings as a secondary aggregate (not "delivered")', async () => {
    renderPage()
    await screen.findByText('61')
    expect(screen.getByText(/£793\.00/)).toBeInTheDocument()
    expect(screen.getAllByText(/estimated/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows a loading state then the totals', async () => {
    renderPage()
    expect(screen.getByText(/preparing your report|loading/i)).toBeInTheDocument()
    await screen.findByText('61')
  })

  // --- LIFECYCLE / ROLE GATE (finding 1) -------------------------------------

  it('renders the suspension screen up front for a SUSPENDED profile (no Insights fetch)', () => {
    mockProfile = { data: { ...ACTIVE_PROFILE, status: 'SUSPENDED' }, isLoading: false }
    renderPage()
    expect(screen.getByText(/your account is suspended/i)).toBeInTheDocument()
    // The report data fetch is never fired for a suspended merchant.
    expect(mockOverview).not.toHaveBeenCalled()
  })

  it('renders a lifecycle lock up front for a pre-live (setup) profile (no Insights fetch)', () => {
    mockProfile = {
      data: { ...ACTIVE_PROFILE, status: 'REGISTERED', onboardingStep: 'REGISTERED' },
      isLoading: false,
    }
    renderPage()
    expect(screen.getByText(/insights unlock when your business is live/i)).toBeInTheDocument()
    expect(mockOverview).not.toHaveBeenCalled()
  })

  it('maps a 403 MERCHANT_NOT_ACTIVE to the lifecycle lock, not a generic error', async () => {
    mockOverview.mockRejectedValue(
      new ApiError(403, { error: { code: 'MERCHANT_NOT_ACTIVE', message: 'not active' } }),
    )
    renderPage()
    expect(await screen.findByText(/insights unlock when your business is live/i)).toBeInTheDocument()
    // NOT the generic report error copy.
    expect(screen.queryByText(/we could not prepare your report/i)).not.toBeInTheDocument()
  })

  it('maps a 403 MERCHANT_SUSPENDED to the suspension screen, not a generic error', async () => {
    mockOverview.mockRejectedValue(
      new ApiError(403, { error: { code: 'MERCHANT_SUSPENDED', message: 'suspended' } }),
    )
    renderPage()
    expect(await screen.findByText(/your account is suspended/i)).toBeInTheDocument()
  })

  it('maps a 403 INSUFFICIENT_PERMISSIONS to a server-denied notice (Staff)', async () => {
    mockOverview.mockRejectedValue(
      new ApiError(403, { error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'denied' } }),
    )
    renderPage()
    expect(await screen.findByText(/do not have access to insights/i)).toBeInTheDocument()
  })

  it('shows the friendly retry error for a non-lifecycle ApiError', async () => {
    mockOverview.mockRejectedValue(
      new ApiError(500, { error: { code: 'INTERNAL', message: 'boom' } }),
    )
    renderPage()
    expect(await screen.findByText(/we could not load your insights/i)).toBeInTheDocument()
  })
})
