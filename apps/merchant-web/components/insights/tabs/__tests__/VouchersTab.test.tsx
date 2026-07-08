/**
 * PR-B Task B6a: the Insights Vouchers tab (spec 9 / 1.8, screenshot 05).
 *
 * Two cards driven by /vouchers:
 *   - "Top vouchers": a ranked list (by logged) with the confirmed subset per row +
 *     optional estimated savings per row. Ordering is logged-descending (the API rank).
 *   - "By voucher type": a stacked ShareBar + per-type legend whose shares are computed
 *     over the LOGGED denominator. When a SINGLE voucher-type filter is active, the
 *     surface explains the unavoidable 100% (it is the only type in view, not a real
 *     dominance).
 *
 * Banned-copy guards: "Delivered" / "Value delivered" must not appear.
 */
import { render, screen, within, cleanup } from '@testing-library/react'
import { VouchersTab } from '../VouchersTab'
import type { InsightsVouchers, InsightsFilters } from '@/lib/api/insights'

jest.mock('@/lib/api/insights', () => ({
  __esModule: true,
  getInsightsVouchers: jest.fn(),
}))

import { getInsightsVouchers } from '@/lib/api/insights'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGet = getInsightsVouchers as jest.MockedFunction<typeof getInsightsVouchers>

const VOUCHERS: InsightsVouchers = {
  top: [
    {
      voucherId: 'v1',
      title: 'Buy one main, get one free',
      type7: 'BOGO',
      logged: 32,
      confirmed: 30,
      estimatedLogged: 416,
      estimatedConfirmed: 390,
    },
    {
      voucherId: 'v2',
      title: 'Free dessert with any main',
      type7: 'FREEBIE',
      logged: 14,
      confirmed: 12,
      estimatedLogged: 91,
      estimatedConfirmed: 78,
    },
    {
      voucherId: 'v3',
      title: 'Loyalty reward, 10% off the bill',
      type7: 'REUSABLE',
      logged: 9,
      confirmed: 7,
      estimatedLogged: 54,
      estimatedConfirmed: 42,
    },
  ],
  byType: [
    { type7: 'BOGO', logged: 32, sharePct: 58 },
    { type7: 'FREEBIE', logged: 14, sharePct: 25 },
    { type7: 'REUSABLE', logged: 9, sharePct: 16 },
  ],
}

function renderTab(filters: InsightsFilters = { period: 'this_month' }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <VouchersTab filters={filters} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockGet.mockReset()
  mockGet.mockResolvedValue(VOUCHERS)
})
afterEach(cleanup)

describe('VouchersTab', () => {
  // A9 follow-up: layout-matching skeleton bones (not bare "Loading vouchers..."
  // text), inside the shared single role=status contract.
  it('renders skeleton bones (not bare text) while vouchers are in flight', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderTab()
    const status = screen.getByRole('status')
    expect(status.querySelectorAll('[data-testid="skeleton-bone"]').length).toBeGreaterThan(0)
  })

  it('replaces the skeleton with the real voucher cards once they resolve', async () => {
    renderTab()
    expect(await screen.findByTestId('top-vouchers-list')).toBeInTheDocument()
    expect(screen.queryByTestId('skeleton-bone')).not.toBeInTheDocument()
  })

  it('ranks the top vouchers by logged (descending) with the confirmed subset per row', async () => {
    renderTab()
    const list = await screen.findByTestId('top-vouchers-list')
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    // Rank order: 32, 14, 9 (logged descending).
    expect(within(rows[0]).getByText('Buy one main, get one free')).toBeInTheDocument()
    expect(within(rows[0]).getByText('32')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Free dessert with any main')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Loyalty reward, 10% off the bill')).toBeInTheDocument()
    // The confirmed subset is shown per row (row 0 confirmed 30).
    expect(within(rows[0]).getByText(/30 confirmed/i)).toBeInTheDocument()
  })

  it('re-sorts by logged even if the API returns rows out of order (defence-in-depth)', async () => {
    mockGet.mockResolvedValue({
      ...VOUCHERS,
      top: [VOUCHERS.top[2], VOUCHERS.top[0], VOUCHERS.top[1]],
    })
    renderTab()
    const list = await screen.findByTestId('top-vouchers-list')
    const rows = within(list).getAllByRole('listitem')
    // Highest logged (32) is row 0 regardless of API order.
    expect(within(rows[0]).getByText('Buy one main, get one free')).toBeInTheDocument()
  })

  it('renders the by-type ShareBar with shares over the LOGGED denominator', async () => {
    const { container } = renderTab()
    await screen.findByTestId('by-type-card')
    // ShareBar draws one segment rect per type with data-label.
    const segments = container.querySelectorAll('rect[data-segment="true"]')
    expect(segments.length).toBe(3)
    // The legend computes shares from logged: 32/(32+14+9)=58%, 14=25%, 9=16%.
    // ShareBar renders the share both as a visible legend AND an sr-only <table>, so
    // each percentage appears twice (the duplication is intentional accessibility).
    const card = screen.getByTestId('by-type-card')
    expect(within(card).getAllByText('58%').length).toBeGreaterThanOrEqual(1)
    expect(within(card).getAllByText('25%').length).toBeGreaterThanOrEqual(1)
    expect(within(card).getAllByText('16%').length).toBeGreaterThanOrEqual(1)
  })

  it('shows estimated savings per row as a secondary stat (not "delivered")', async () => {
    renderTab()
    const list = await screen.findByTestId('top-vouchers-list')
    expect(within(list).getByText(/£416\.00 estimated/i)).toBeInTheDocument()
  })

  it('explains the single-type 100% when a voucher-type filter is active', async () => {
    mockGet.mockResolvedValue({
      top: [VOUCHERS.top[0]],
      byType: [{ type7: 'BOGO', logged: 32, sharePct: 100 }],
    })
    renderTab({ period: 'this_month', voucherType: 'BOGO' })
    const card = await screen.findByTestId('by-type-card')
    // A calm explainer that 100% is because the view is filtered to one type.
    expect(
      within(card).getByText(/filtered to a single voucher type/i),
    ).toBeInTheDocument()
  })

  it('does NOT show the single-type explainer when no type filter is active', async () => {
    renderTab()
    const card = await screen.findByTestId('by-type-card')
    expect(
      within(card).queryByText(/filtered to a single voucher type/i),
    ).not.toBeInTheDocument()
  })

  it('wires a MetricInfo explainer on each card', async () => {
    renderTab()
    await screen.findByTestId('top-vouchers-list')
    const infoTriggers = screen
      .getAllByRole('button')
      .filter((b) => /about|how|what/i.test(b.getAttribute('aria-label') ?? ''))
    expect(infoTriggers.length).toBeGreaterThanOrEqual(2)
  })

  it('renders an empty state when there are no vouchers', async () => {
    mockGet.mockResolvedValue({ top: [], byType: [] })
    renderTab()
    // Both cards show their own empty copy; assert at least one is present.
    expect((await screen.findAllByText(/no voucher activity/i)).length).toBeGreaterThanOrEqual(1)
  })

  it('renders NO "Delivered" wording anywhere (banned-copy guard)', async () => {
    const { container } = renderTab()
    await screen.findByTestId('top-vouchers-list')
    expect(container.textContent ?? '').not.toMatch(/delivered/i)
  })
})
