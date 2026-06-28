/**
 * PR-B Task B6a: the Insights Branches tab (spec 9 / 1.8, screenshot 06).
 *
 * A ranked branch list (by logged) with the confirmed subset + estimated savings per
 * row. SCOPED: it shows ONLY the rows the API returns. It NEVER renders a sibling
 * branch name/count/ranking for an out-of-scope branch, and the prototype's "Branch
 * performance always compares all your locations" caption is BANNED (a Branch Manager
 * must not infer that other locations exist).
 *
 * Banned-copy guards: "Delivered" / "Value delivered" + the all-locations caption.
 */
import { render, screen, within, cleanup } from '@testing-library/react'
import { BranchesTab } from '../BranchesTab'
import type { InsightsBranches, InsightsFilters } from '@/lib/api/insights'

jest.mock('@/lib/api/insights', () => ({
  __esModule: true,
  getInsightsBranches: jest.fn(),
}))

import { getInsightsBranches } from '@/lib/api/insights'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGet = getInsightsBranches as jest.MockedFunction<typeof getInsightsBranches>

const BRANCHES: InsightsBranches = {
  rows: [
    {
      branchId: 'b1',
      name: 'High Street',
      logged: 37,
      confirmed: 35,
      estimatedLogged: 368,
      estimatedConfirmed: 350,
    },
    {
      branchId: 'b2',
      name: 'Mill Road',
      logged: 24,
      confirmed: 21,
      estimatedLogged: 241,
      estimatedConfirmed: 210,
    },
  ],
}

function renderTab(filters: InsightsFilters = { period: 'this_month' }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BranchesTab filters={filters} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockGet.mockReset()
  mockGet.mockResolvedValue(BRANCHES)
})
afterEach(cleanup)

describe('BranchesTab', () => {
  it('ranks the branches by logged (descending) with the confirmed subset per row', async () => {
    renderTab()
    const list = await screen.findByTestId('branches-list')
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('High Street')).toBeInTheDocument()
    expect(within(rows[0]).getByText('37')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Mill Road')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/35 confirmed/i)).toBeInTheDocument()
  })

  it('re-sorts by logged even if the API returns rows out of order (defence-in-depth)', async () => {
    mockGet.mockResolvedValue({ rows: [BRANCHES.rows[1], BRANCHES.rows[0]] })
    renderTab()
    const list = await screen.findByTestId('branches-list')
    const rows = within(list).getAllByRole('listitem')
    expect(within(rows[0]).getByText('High Street')).toBeInTheDocument()
  })

  it('shows ONLY the branches the API returns (scoped: no sibling leak)', async () => {
    // A Branch Manager scoped to one branch: the API returns exactly one row.
    mockGet.mockResolvedValue({ rows: [BRANCHES.rows[1]] })
    renderTab()
    const list = await screen.findByTestId('branches-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('Mill Road')).toBeInTheDocument()
    // The other branch name is NOT present anywhere on the surface.
    expect(screen.queryByText('High Street')).not.toBeInTheDocument()
  })

  it('does NOT render the "always compares all your locations" caption (banned)', async () => {
    const { container } = renderTab()
    await screen.findByTestId('branches-list')
    expect(container.textContent ?? '').not.toMatch(/compares all your locations/i)
    expect(container.textContent ?? '').not.toMatch(/all your locations/i)
  })

  it('shows estimated savings per row as a secondary stat (not "delivered")', async () => {
    renderTab()
    const list = await screen.findByTestId('branches-list')
    expect(within(list).getByText(/£368\.00 estimated/i)).toBeInTheDocument()
  })

  it('wires a MetricInfo explainer on the branches card', async () => {
    renderTab()
    await screen.findByTestId('branches-list')
    const infoTriggers = screen
      .getAllByRole('button')
      .filter((b) => /about|how|what/i.test(b.getAttribute('aria-label') ?? ''))
    expect(infoTriggers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders an empty state when there are no branches', async () => {
    mockGet.mockResolvedValue({ rows: [] })
    renderTab()
    expect(await screen.findByText(/no branch activity/i)).toBeInTheDocument()
  })

  it('renders NO "Delivered" wording anywhere (banned-copy guard)', async () => {
    const { container } = renderTab()
    await screen.findByTestId('branches-list')
    expect(container.textContent ?? '').not.toMatch(/delivered/i)
  })
})
