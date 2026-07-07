import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VoucherDetailPage from '@/app/(app)/vouchers/[id]/page'

// Voucher governed flows (2026-07-07): this SAME [id] route/page also renders a
// flagship (isRmv) voucher's detail. GET /vouchers/:id is CUSTOM-only (would
// 404 a flagship id server-side) and there is no per-id RMV read, so the page
// resolves a flagship id by matching it against the (cached) flagship list
// instead. Pins: getVoucher is NEVER called for a flagship id; NO Edit/Submit/
// Delete ever; the locked notice + Flagship pill show; the kebab offers
// Request a change + Duplicate (never Request to end); the analytics section
// still works (isRmv-agnostic backend endpoint); an open pending CHANGE
// request renders the diff banner.

const getVoucher = jest.fn()
const listFlagshipVouchers = jest.fn()
const getVoucherAnalytics = jest.fn()
jest.mock('@/lib/api/voucher', () => {
  const actual = jest.requireActual('@/lib/api/voucher')
  return {
    ...actual,
    getVoucher: (id: string) => getVoucher(id),
    listFlagshipVouchers: () => listFlagshipVouchers(),
    getVoucherAnalytics: (id: string) => getVoucherAnalytics(id),
  }
})

const push = jest.fn()
let searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: jest.fn() }),
  useParams: () => ({ id: 'rmv1' }),
  useSearchParams: () => searchParams,
}))

jest.mock('@/lib/voucher/useVoucherCapability', () => ({
  useVoucherCapability: () => ({ canManage: true, ready: true }),
}))

let mockInsightsCaps = { canViewInsights: false }
jest.mock('@/lib/insights/useInsightsCapability', () => ({
  useInsightsCapability: () => ({ canViewInsights: mockInsightsCaps.canViewInsights, ready: true }),
}))

jest.mock('@/lib/voucher/useVoucherCategoryName', () => ({
  useVoucherCategoryName: () => 'Food & Drink',
}))

jest.mock('@/components/vouchers/builder/DayTwoBuilder', () => ({
  DayTwoBuilder: () => <div data-testid="day-two-builder" />,
}))

function flagshipRow(over: Record<string, unknown> = {}) {
  return {
    id: 'rmv1',
    title: 'Flagship BOGO',
    type: 'BOGO',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    estimatedSaving: 10,
    description: 'Buy one, get one free.',
    terms: 'One per visit',
    isRmv: true,
    createdAt: '2026-06-19T10:00:00.000Z',
    redemptionCount: 12,
    pendingEdit: null,
    ...over,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <VoucherDetailPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  push.mockReset()
  searchParams = new URLSearchParams()
  getVoucher.mockReset()
  listFlagshipVouchers.mockReset().mockResolvedValue([flagshipRow()])
  mockInsightsCaps = { canViewInsights: false }
  getVoucherAnalytics.mockReset().mockResolvedValue({
    voucherId: 'rmv1',
    totals: { logged: 5, confirmed: 4, confirmedInPersonPct: 80, distinctCustomers: 4, estimatedSavingLogged: 20, estimatedSavingConfirmed: 16 },
    lifecycle: { liveSince: '2026-06-01T00:00:00.000Z', liveSinceSource: 'approvedAt', daysLive: 36 },
    trend: { months: [{ monthStartLondon: '2026-06-01', logged: 5, confirmed: 4 }] },
    whenUsed: {
      days: Array.from({ length: 7 }, (_, index) => ({ index, intensity: 0 })),
      dayparts: Array.from({ length: 6 }, (_, index) => ({ index, intensity: 0 })),
      busiestDay: null,
      busiestDaypart: null,
    },
    whereUsed: { branches: [] },
  })
})

describe('VoucherDetailPage - flagship path', () => {
  it('resolves the flagship id from the list WITHOUT ever calling getVoucher', async () => {
    renderPage()
    await screen.findAllByText('Flagship BOGO')
    expect(getVoucher).not.toHaveBeenCalled()
  })

  it('shows the Flagship pill + the locked notice', async () => {
    renderPage()
    await screen.findAllByText('Flagship BOGO')
    expect(screen.getByTestId('voucher-detail-flagship-pill')).toBeInTheDocument()
    expect(screen.getByTestId('voucher-detail-locked-notice')).toHaveTextContent(/cannot be deleted/i)
  })

  it('never renders Edit / Submit for review / Delete', async () => {
    renderPage()
    await screen.findAllByText('Flagship BOGO')
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /submit for review/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
  })

  it('the kebab offers Request a change + Duplicate, never Request to end', async () => {
    renderPage()
    await screen.findAllByText('Flagship BOGO')
    fireEvent.click(screen.getByRole('button', { name: /actions for flagship bogo/i }))
    const menu = await screen.findByRole('menu')
    expect(menu).toHaveTextContent(/request a change/i)
    expect(menu).toHaveTextContent(/duplicate/i)
    expect(menu).not.toHaveTextContent(/request to end/i)
  })

  it('renders the analytics section for a canViewInsights viewer (isRmv-agnostic backend endpoint)', async () => {
    mockInsightsCaps = { canViewInsights: true }
    renderPage()
    await screen.findAllByText('Flagship BOGO')
    expect(await screen.findByTestId('voucher-analytics')).toBeInTheDocument()
    expect(getVoucherAnalytics).toHaveBeenCalledWith('rmv1')
  })

  it('renders the CHANGE pending-edit diff banner when there is an open request', async () => {
    listFlagshipVouchers.mockResolvedValue([
      flagshipRow({
        pendingEdit: {
          id: 'pe1',
          kind: 'CHANGE',
          status: 'PENDING',
          reason: 'Raise the saving',
          createdAt: '2026-07-07T09:00:00.000Z',
          proposedChanges: { estimatedSaving: 15 },
        },
      }),
    ])
    renderPage()
    await screen.findAllByText('Flagship BOGO')
    expect(screen.getByTestId('voucher-pending-edit-banner')).toBeInTheDocument()
    expect(screen.getByTestId('voucher-pending-edit-proposed-estimatedSaving')).toHaveTextContent('£15')
  })

  it('a ?duplicate=1 deep-link opens the builder in duplicate mode', async () => {
    searchParams = new URLSearchParams('duplicate=1')
    renderPage()
    expect(await screen.findByTestId('day-two-builder')).toBeInTheDocument()
  })

  it('falls back to getVoucher for an id that is NOT in the flagship list (custom voucher)', async () => {
    listFlagshipVouchers.mockResolvedValue([]) // rmv1 not present -> not a flagship id
    getVoucher.mockResolvedValue({
      id: 'rmv1',
      title: 'A custom voucher',
      type: 'FREEBIE',
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      estimatedSaving: 4,
      isRmv: false,
      createdAt: '2026-06-19T10:00:00.000Z',
      redemptionCount: 0,
    })
    renderPage()
    await waitFor(() => expect(getVoucher).toHaveBeenCalledWith('rmv1'))
    expect(await screen.findAllByText('A custom voucher')).toHaveLength(2)
    expect(screen.queryByTestId('voucher-detail-flagship-pill')).toBeNull()
  })
})
