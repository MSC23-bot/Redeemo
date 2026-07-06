import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import HomeDashboard from '@/components/home/HomeDashboard'
import type { MerchantProfile } from '@/lib/api/profile'

// --- API mocks (assert insights are NOT called for STAFF) --------------------
jest.mock('@/lib/api/insights', () => ({
  getInsightsOverview: jest.fn(),
  getInsightsTrend: jest.fn(),
  getInsightsBusyTimes: jest.fn(),
}))
jest.mock('@/lib/api/voucher', () => ({
  listCustomVouchers: jest.fn(),
  listFlagshipVouchers: jest.fn(),
}))
jest.mock('@/lib/api/redemptions', () => ({
  listRedemptions: jest.fn(),
}))
jest.mock('@/lib/api/branch', () => ({
  listBranches: jest.fn(),
}))

import { getInsightsOverview, getInsightsTrend, getInsightsBusyTimes } from '@/lib/api/insights'
import { listCustomVouchers, listFlagshipVouchers } from '@/lib/api/voucher'
import { listRedemptions } from '@/lib/api/redemptions'
import { listBranches } from '@/lib/api/branch'

const mockOverview = getInsightsOverview as jest.Mock
const mockTrend = getInsightsTrend as jest.Mock
const mockBusy = getInsightsBusyTimes as jest.Mock
const mockCustom = listCustomVouchers as jest.Mock
const mockFlagship = listFlagshipVouchers as jest.Mock
const mockRedemptions = listRedemptions as jest.Mock
const mockBranches = listBranches as jest.Mock

// --- fixtures ----------------------------------------------------------------
function makeProfile(overrides: Partial<MerchantProfile> = {}): MerchantProfile {
  return {
    id: 'm1',
    businessName: 'The Old Foundry Kitchen',
    status: 'ACTIVE',
    onboardingStep: 'LIVE',
    viewerCapabilities: { canViewInsights: true, role: 'OWNER', displayName: 'James Fielding' },
    pendingEdits: [],
    ...overrides,
  } as unknown as MerchantProfile
}

const OVERVIEW_LIVE = {
  redemptionActivity: { logged: 318, confirmed: 200, awaiting: 118, comparison: null },
  distinctCustomers: { logged: 212, comparison: null },
  repeatRate: { available: false as const },
  savings: { estimatedLogged: 0, estimatedConfirmed: 0, awaiting: 0, comparison: null },
  meta: {
    scopeLabel: 'All branches',
    earliestDate: '2025-11-01',
    filtersEcho: { period: 'all', branchId: null, voucherType: null, from: null, to: null },
  },
}

const OVERVIEW_ZERO = {
  ...OVERVIEW_LIVE,
  redemptionActivity: { logged: 0, confirmed: 0, awaiting: 0, comparison: null },
  distinctCustomers: { logged: 0, comparison: null },
  meta: { ...OVERVIEW_LIVE.meta, earliestDate: null },
}

const TREND = {
  months: [
    { monthStartLondon: '2026-05-01', logged: 40, confirmed: 30 },
    { monthStartLondon: '2026-06-01', logged: 60, confirmed: 50 },
  ],
}

const BUSY = {
  mode: 'intensity' as const,
  grid: [
    { day: 4, daypart: 3, intensity: 2 },
    { day: 5, daypart: 3, intensity: 3 },
    { day: 6, daypart: 3, intensity: 1 },
  ],
  busiest: { day: 5, daypart: 3 }, // Saturday
}

const FLAGSHIP = [
  {
    id: 'f1',
    title: 'Buy one main, get one free',
    type: 'BOGO',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    estimatedSaving: 0,
    isRmv: true,
    redemptionCount: 118,
    createdAt: '2026-01-01',
  },
]
const CUSTOM = [
  {
    id: 'c1',
    title: 'Spend £30, save £8',
    type: 'SPEND_AND_SAVE',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    estimatedSaving: 0,
    isRmv: false,
    redemptionCount: 16,
    createdAt: '2026-01-01',
  },
]

const REDEMPTIONS = {
  items: [
    {
      id: 'r1',
      redemptionCode: 'ABCD1234',
      voucher: { id: 'f1', title: 'Buy one main, get one free', type: 'BOGO' },
      branch: { id: 'b1', name: 'High Street' },
      customerName: 'Sam T.',
      redeemedAt: new Date().toISOString(),
      status: 'AWAITING_VALIDATION',
      validatedAt: null,
      validationMethod: null,
      validatedByLabel: null,
      estimatedSaving: 0,
    },
  ],
  total: 1,
  limit: 5,
  offset: 0,
}

const BRANCHES = [
  { id: 'b1', name: 'High Street', locationConfidence: 'ADDRESS_GEOCODED', pendingEdits: [] },
]

function renderHome(profile: MerchantProfile) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <HomeDashboard profile={profile} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockOverview.mockResolvedValue(OVERVIEW_LIVE)
  mockTrend.mockResolvedValue(TREND)
  mockBusy.mockResolvedValue(BUSY)
  mockFlagship.mockResolvedValue(FLAGSHIP)
  mockCustom.mockResolvedValue(CUSTOM)
  mockRedemptions.mockResolvedValue(REDEMPTIONS)
  mockBranches.mockResolvedValue(BRANCHES)
})

describe('HomeDashboard (Slice 1, reuse-only)', () => {
  it('renders the full live dashboard for a canViewInsights viewer, wired to mocked data', async () => {
    renderHome(makeProfile())

    // Greeting (first word of displayName)
    expect(await screen.findByText(/welcome back, james/i)).toBeInTheDocument()

    // KPI tiles
    const kpiCustomers = await screen.findByTestId('home-kpi-customers')
    expect(kpiCustomers).toHaveTextContent('212')
    const liveVouchers = screen.getByTestId('home-kpi-live-vouchers')
    expect(liveVouchers).toHaveTextContent('2')
    const busiest = screen.getByTestId('home-kpi-busiest-day')
    expect(busiest).toHaveTextContent(/saturday/i)

    // Charts
    expect(screen.getByTestId('trend-chart')).toBeInTheDocument()
    expect(screen.getByTestId('home-busiest-days')).toBeInTheDocument()

    // Lists
    expect(screen.getByTestId('home-recent-redemptions')).toHaveTextContent('High Street')
    const live = screen.getByTestId('home-live-vouchers')
    expect(live).toHaveTextContent('Buy one main, get one free')
    expect(live).toHaveTextContent('118')

    // Insights overview WAS called for the owner
    expect(mockOverview).toHaveBeenCalled()
  })

  it('renders the "New customers this cycle" tile in a gated/coming state with no fabricated number', async () => {
    renderHome(makeProfile())
    const tile = await screen.findByTestId('home-kpi-new-customers')
    expect(tile).toHaveTextContent(/coming soon/i)
    expect(tile).toHaveTextContent(/not yet available/i)
    // No digits fabricated in the tile
    expect(tile.textContent ?? '').not.toMatch(/\d/)
  })

  it('renders the LEAN home for a STAFF viewer and never calls the insights endpoints', async () => {
    const staff = makeProfile({
      viewerCapabilities: { canViewInsights: false, role: 'STAFF', displayName: 'Priya' },
    } as Partial<MerchantProfile>)
    renderHome(staff)

    expect(await screen.findByTestId('home-lean')).toBeInTheDocument()
    expect(screen.getByText(/your business is live/i)).toBeInTheDocument()

    // No insights read is ever fired for STAFF.
    await waitFor(() => expect(screen.queryByTestId('home-live-dashboard')).not.toBeInTheDocument())
    expect(mockOverview).not.toHaveBeenCalled()
    expect(mockTrend).not.toHaveBeenCalled()
    expect(mockBusy).not.toHaveBeenCalled()
  })

  it('renders the just-started home (tips grid + placeholder, no charts-with-data) on zero all-time redemptions', async () => {
    mockOverview.mockResolvedValue(OVERVIEW_ZERO)
    renderHome(makeProfile())

    expect(await screen.findByTestId('home-just-started')).toBeInTheDocument()
    expect(screen.getByTestId('home-placeholder-chart')).toBeInTheDocument()
    expect(screen.getByTestId('home-tips-grid')).toBeInTheDocument()
    expect(screen.getByText(/is live on redeemo/i)).toBeInTheDocument()

    // Live vouchers ready count comes from the ACTIVE voucher lists (2 ACTIVE)
    expect(screen.getByText(/live vouchers ready/i)).toBeInTheDocument()

    // NO data charts render in the just-started state.
    expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-busiest-days')).not.toBeInTheDocument()
    // The just-started home does not fetch the trend/busy reads.
    expect(mockTrend).not.toHaveBeenCalled()
    expect(mockBusy).not.toHaveBeenCalled()
  })

  it('aggregates all four "needs your attention" sources', async () => {
    mockBranches.mockResolvedValue([
      { id: 'b1', name: 'High Street', locationConfidence: 'NEEDS_REVIEW', pendingEdits: [] },
      { id: 'b2', name: 'Mill Road', locationConfidence: 'ADDRESS_GEOCODED', pendingEdits: [{ id: 'pe1', status: 'PENDING', createdAt: '2026-06-01' }] },
    ])
    mockCustom.mockResolvedValue([
      { ...CUSTOM[0], approvalStatus: 'CHANGES_REQUESTED' },
    ])
    const profile = makeProfile({
      pendingEdits: [{ id: 'mpe1', status: 'PENDING', createdAt: '2026-06-01' }],
    } as Partial<MerchantProfile>)
    renderHome(profile)

    const panel = await screen.findByTestId('home-needs-attention')
    await waitFor(() => {
      expect(panel).toHaveTextContent(/a profile change is in review/i)
      expect(panel).toHaveTextContent(/confirm a branch location/i)
      expect(panel).toHaveTextContent(/a branch change is in review/i)
      expect(panel).toHaveTextContent(/a voucher needs changes/i)
    })
    expect(panel.querySelectorAll('li')).toHaveLength(4)
  })

  it('shows the all-caught-up empty state when nothing needs attention', async () => {
    renderHome(makeProfile())
    const panel = await screen.findByTestId('home-needs-attention')
    await waitFor(() => expect(screen.getByTestId('home-attention-empty')).toBeInTheDocument())
    expect(panel).toHaveTextContent(/all caught up/i)
  })
})
