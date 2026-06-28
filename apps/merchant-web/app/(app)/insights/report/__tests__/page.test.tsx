/**
 * PR-B Task B7: the client-rendered printable performance summary (spec 10.2).
 *
 * AGGREGATE-ONLY: it separates Logged / Confirmed / Awaiting totals, states the active
 * period / branch scope / voucher filter, and the generation date, with a "Print or save
 * report" affordance that calls window.print(). It carries NO event-level / per-customer
 * rows and uses the Decision-11 savings terminology (never "delivered").
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReportPage from '@/app/(app)/insights/report/page'
import type { InsightsOverview } from '@/lib/api/insights'

// Keep the real schemas/types (lib/insights/filters depends on the zod enums) and
// override only the fetcher. requireActual preserves periodPresetSchema etc.
jest.mock('@/lib/api/insights', () => ({
  __esModule: true,
  ...jest.requireActual('@/lib/api/insights'),
  getInsightsOverview: jest.fn(),
}))

import { getInsightsOverview } from '@/lib/api/insights'

const mockOverview = getInsightsOverview as jest.MockedFunction<typeof getInsightsOverview>

// The printable reads the active filters from the URL.
let searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}))

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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ReportPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockOverview.mockReset()
  mockOverview.mockResolvedValue(OVERVIEW)
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
    searchParams = new URLSearchParams('period=last_month&branchId=b1&voucherType=BOGO')
    renderPage()
    await screen.findByText('61')
    expect(screen.getByText(/last month/i)).toBeInTheDocument()
    // The scope label is sourced from the overview meta.
    expect(screen.getAllByText(/All branches/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/BOGO|Buy one, get one free/i)).toBeInTheDocument()
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
})
