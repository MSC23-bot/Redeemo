import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Slice E: the per-voucher analytics section. Driven by getVoucherAnalytics
// (mocked here). Covers: the tiles + charts render from mocked data; the
// zero-redemption empty state; and the Decimal-string coercion at the schema
// boundary (the PR#327 bug class: Prisma Decimal sums arrive as JSON strings).

jest.mock('@/lib/api/voucher', () => {
  const actual = jest.requireActual('@/lib/api/voucher')
  return { __esModule: true, ...actual, getVoucherAnalytics: jest.fn() }
})

import {
  getVoucherAnalytics,
  voucherAnalyticsSchema,
  type VoucherAnalytics as VoucherAnalyticsData,
} from '@/lib/api/voucher'
import { VoucherAnalytics } from '@/components/vouchers/VoucherAnalytics'

const mockGet = getVoucherAnalytics as jest.MockedFunction<typeof getVoucherAnalytics>

function bands(n: number): { index: number; intensity: number }[] {
  return Array.from({ length: n }, (_, index) => ({ index, intensity: (index % 4) as number }))
}

function fullData(overrides: Partial<VoucherAnalyticsData> = {}): VoucherAnalyticsData {
  return {
    voucherId: 'v-1',
    totals: {
      logged: 118,
      confirmed: 114,
      confirmedInPersonPct: 97,
      distinctCustomers: 100,
      estimatedSavingLogged: 710,
      estimatedSavingConfirmed: 690,
    },
    lifecycle: { liveSince: '2026-01-01T00:00:00.000Z', liveSinceSource: 'approvedAt', daysLive: 117 },
    trend: {
      months: [
        { monthStartLondon: '2026-01-01', logged: 40, confirmed: 38 },
        { monthStartLondon: '2026-02-01', logged: 78, confirmed: 76 },
      ],
    },
    whenUsed: { days: bands(7), dayparts: bands(6), busiestDay: 5, busiestDaypart: 4 },
    whereUsed: {
      branches: [
        { branchId: 'b-1', name: 'High Street', logged: 71, sharePct: 60 },
        { branchId: 'b-2', name: 'Mill Road', logged: 47, sharePct: 40 },
      ],
    },
    ...overrides,
  }
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <VoucherAnalytics voucherId="v-1" />
    </QueryClientProvider>,
  )
}

beforeEach(() => mockGet.mockReset())

describe('VoucherAnalytics', () => {
  it('renders the headline tiles + charts from mocked data', async () => {
    mockGet.mockResolvedValue(fullData())
    renderSection()

    await waitFor(() => expect(screen.getByTestId('voucher-analytics')).toBeInTheDocument())
    // Tiles.
    expect(screen.getByText('118')).toBeInTheDocument() // redemptions
    expect(screen.getByText('100')).toBeInTheDocument() // customers
    expect(screen.getByText('117')).toBeInTheDocument() // days live
    expect(screen.getByText('97%')).toBeInTheDocument() // confirmed in person
    // Section headers.
    expect(screen.getByText('Redemptions over time')).toBeInTheDocument()
    expect(screen.getByText('When it is used')).toBeInTheDocument()
    expect(screen.getByText('Where it is used')).toBeInTheDocument()
    // Busiest caption from the gated peak locations.
    expect(screen.getByText(/Busiest on Saturday/)).toBeInTheDocument()
    // Where-used branch rows.
    expect(screen.getByText('High Street')).toBeInTheDocument()
    expect(screen.getByText('71 (60%)')).toBeInTheDocument()
  })

  it('renders the empty state for a zero-redemption voucher', async () => {
    mockGet.mockResolvedValue(
      fullData({
        totals: {
          logged: 0,
          confirmed: 0,
          confirmedInPersonPct: 0,
          distinctCustomers: 0,
          estimatedSavingLogged: 0,
          estimatedSavingConfirmed: 0,
        },
        trend: { months: [] },
        whenUsed: { days: bands(7).map((s) => ({ ...s, intensity: 0 })), dayparts: bands(6).map((s) => ({ ...s, intensity: 0 })), busiestDay: null, busiestDaypart: null },
        whereUsed: { branches: [] },
      }),
    )
    renderSection()
    await waitFor(() => expect(screen.getByText('No redemptions yet')).toBeInTheDocument())
    // The tiles/charts are not rendered in the empty state.
    expect(screen.queryByTestId('voucher-analytics')).not.toBeInTheDocument()
  })

  it('coerces Decimal-string saving fields to numbers at the schema boundary (PR#327 class)', () => {
    // The wire payload sends Prisma Decimal sums as STRINGS. z.coerce.number() must
    // turn them into numbers so downstream money formatting never crashes.
    const parsed = voucherAnalyticsSchema.parse({
      voucherId: 'v-1',
      totals: {
        logged: '118',
        confirmed: '114',
        confirmedInPersonPct: '97',
        distinctCustomers: '100',
        estimatedSavingLogged: '710.50',
        estimatedSavingConfirmed: '690.00',
      },
      lifecycle: { liveSince: '2026-01-01T00:00:00.000Z', liveSinceSource: 'approvedAt', daysLive: '117' },
      trend: { months: [{ monthStartLondon: '2026-01-01', logged: '40', confirmed: '38' }] },
      whenUsed: { days: bands(7), dayparts: bands(6), busiestDay: 5, busiestDaypart: 4 },
      whereUsed: { branches: [{ branchId: 'b-1', name: 'High Street', logged: '71', sharePct: '60' }] },
    })
    expect(parsed.totals.estimatedSavingLogged).toBe(710.5)
    expect(typeof parsed.totals.estimatedSavingLogged).toBe('number')
    expect(parsed.lifecycle.daysLive).toBe(117)
    expect(parsed.whereUsed.branches[0].logged).toBe(71)
  })
})
