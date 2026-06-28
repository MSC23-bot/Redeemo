/**
 * PR-B Task B6b: the Insights Customers tab (spec 8 / 1.7, screenshot 07 - demographics
 * EXCLUDED).
 *
 * RELEASE-1 scope: ONLY the New-vs-returning section + the repeat-customer rate. Driven
 * by /customers:
 *   - newVsReturning: { newCount, returningCount, total } | { available:false }
 *   - repeatRate: { value, insufficient, comparison } | { available:false }
 *
 * Locked copy (spec 2.4):
 *   - New-vs-returning labels: "New to you" / "Already a customer" (NOT
 *     "Returning"/"came back"/"New customers").
 *   - Repeat-customer rate insufficient copy: "Building your repeat-customer picture".
 *   - A gated ({ available:false }) block shows a calm "Not available" treatment.
 *
 * CRITICAL NEGATIVES (the load-bearing privacy contract for PR-B):
 *   - ZERO demographic UI/copy: no age, gender, or location text; no disabled cards,
 *     skeletons, or "coming soon"/placeholder copy for demographics. They are ENTIRELY
 *     ABSENT.
 *   - The prototype's anonymity / suppression banner (screenshot 07) is BANNED.
 *   - "Delivered" / "Value delivered" must not appear.
 */
import { render, screen, within, cleanup } from '@testing-library/react'
import { CustomersTab } from '../CustomersTab'
import type { InsightsCustomers, InsightsFilters } from '@/lib/api/insights'

jest.mock('@/lib/api/insights', () => ({
  __esModule: true,
  getInsightsCustomers: jest.fn(),
}))

import { getInsightsCustomers } from '@/lib/api/insights'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGet = getInsightsCustomers as jest.MockedFunction<typeof getInsightsCustomers>

const CUSTOMERS: InsightsCustomers = {
  newVsReturning: { newCount: 25, returningCount: 16, total: 41 },
  repeatRate: { value: 39.0, insufficient: false, comparison: null },
}

function renderTab(filters: InsightsFilters = { period: 'this_month' }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CustomersTab filters={filters} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockGet.mockReset()
  mockGet.mockResolvedValue(CUSTOMERS)
})
afterEach(cleanup)

describe('CustomersTab', () => {
  it('renders the New-vs-returning counts with the locked labels', async () => {
    renderTab()
    const card = await screen.findByTestId('customers-new-returning')
    expect(within(card).getByText('New to you')).toBeInTheDocument()
    expect(within(card).getByText('Already a customer')).toBeInTheDocument()
    expect(within(card).getByText('25')).toBeInTheDocument()
    expect(within(card).getByText('16')).toBeInTheDocument()
  })

  it('does NOT use the banned "Returning" / "came back" labels', async () => {
    const { container } = renderTab()
    await screen.findByTestId('customers-new-returning')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/returning customer/i)
    expect(text).not.toMatch(/came back/i)
  })

  it('surfaces the repeat-customer rate', async () => {
    renderTab()
    const card = await screen.findByTestId('customers-repeat-rate')
    expect(within(card).getByText('39%')).toBeInTheDocument()
  })

  it('shows the insufficient copy when the repeat rate is insufficient', async () => {
    mockGet.mockResolvedValue({
      ...CUSTOMERS,
      repeatRate: { value: null, insufficient: true, comparison: null },
    })
    renderTab()
    const card = await screen.findByTestId('customers-repeat-rate')
    expect(within(card).getByText(/Building your repeat-customer picture/i)).toBeInTheDocument()
  })

  it('shows a calm "Not available" state when newVsReturning is gated', async () => {
    mockGet.mockResolvedValue({
      ...CUSTOMERS,
      newVsReturning: { available: false },
    })
    renderTab()
    const card = await screen.findByTestId('customers-new-returning')
    expect(within(card).getByText(/Not available/i)).toBeInTheDocument()
  })

  it('shows a calm "Not available" state when the repeat rate is gated', async () => {
    mockGet.mockResolvedValue({
      ...CUSTOMERS,
      repeatRate: { available: false },
    })
    renderTab()
    const card = await screen.findByTestId('customers-repeat-rate')
    expect(within(card).getByText(/Not available/i)).toBeInTheDocument()
  })

  it('renders ZERO demographic UI (no age, gender, or location text anywhere)', async () => {
    const { container } = renderTab()
    await screen.findByTestId('customers-new-returning')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/age/i)
    expect(text).not.toMatch(/gender/i)
    expect(text).not.toMatch(/\bmale\b/i)
    expect(text).not.toMatch(/\bfemale\b/i)
    expect(text).not.toMatch(/location/i)
    expect(text).not.toMatch(/town/i)
    expect(text).not.toMatch(/district/i)
    expect(text).not.toMatch(/postcode/i)
    expect(text).not.toMatch(/demographic/i)
    expect(text).not.toMatch(/coming soon/i)
  })

  it('does NOT render the prototype anonymity / suppression banner (banned)', async () => {
    const { container } = renderTab()
    await screen.findByTestId('customers-new-returning')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/aggregate and pseudonymous/i)
    expect(text).not.toMatch(/never an individual customer/i)
    expect(text).not.toMatch(/anonymous/i)
    expect(text).not.toMatch(/too small to show/i)
    expect(text).not.toMatch(/hidden to protect/i)
  })

  it('renders NO "Delivered" wording anywhere (banned-copy guard)', async () => {
    const { container } = renderTab()
    await screen.findByTestId('customers-new-returning')
    expect(container.textContent ?? '').not.toMatch(/delivered/i)
  })

  it('wires a MetricInfo explainer on the customers surface', async () => {
    renderTab()
    await screen.findByTestId('customers-new-returning')
    const infoTriggers = screen
      .getAllByRole('button')
      .filter((b) => /about|how|what/i.test(b.getAttribute('aria-label') ?? ''))
    expect(infoTriggers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders a loading state', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderTab()
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })
})
