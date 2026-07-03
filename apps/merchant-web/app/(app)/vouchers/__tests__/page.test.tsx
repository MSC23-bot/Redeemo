import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VouchersPage from '@/app/(app)/vouchers/page'
import { NAV_GROUPS } from '@/components/shell/navItems'

// Day-2 Vouchers B3: the Vouchers list page. Flagship pinned/locked at the top
// (read-only); custom vouchers grouped + filterable by derived display state; the
// approved-waiting state gets a distinct label; "Create a voucher" opens the
// builder; a row click routes to /vouchers/[id].

const listCustomVouchers = jest.fn()
const listFlagshipVouchers = jest.fn()
jest.mock('@/lib/api/voucher', () => {
  const actual = jest.requireActual('@/lib/api/voucher')
  return {
    ...actual,
    listCustomVouchers: () => listCustomVouchers(),
    listFlagshipVouchers: () => listFlagshipVouchers(),
  }
})

// The builder is exercised in its own suite; stub it here so the page test focuses
// on the list. The stub exposes a marker + a Cancel hook.
jest.mock('@/components/vouchers/builder/DayTwoBuilder', () => ({
  DayTwoBuilder: (props: { onCancel: () => void }) => (
    <div data-testid="day-two-builder">
      <button onClick={props.onCancel}>builder-cancel</button>
    </div>
  ),
}))

const push = jest.fn()
// Shell wave: /vouchers?create=1 (the Quick Action deep-link) seeds the builder.
let searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}))

// Shell wave: the capability seam now reads the session profile; the page tests
// pin page behaviour, not the seam (covered by useVoucherCapability.test.ts).
jest.mock('@/lib/voucher/useVoucherCapability', () => ({
  useVoucherCapability: () => ({ canManage: true, ready: true }),
}))

// The resolved top-level category name feeds the builder's suggestion chips.
jest.mock('@/lib/voucher/useVoucherCategoryName', () => ({
  useVoucherCategoryName: () => 'Food & Drink',
}))

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    title: 'Free coffee with breakfast',
    type: 'FREEBIE',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    estimatedSaving: 4,
    isRmv: false,
    createdAt: '2026-06-19T10:00:00.000Z',
    redemptionCount: 7,
    ...over,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <VouchersPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  push.mockReset()
  searchParams = new URLSearchParams()
  listCustomVouchers.mockReset().mockResolvedValue([])
  listFlagshipVouchers.mockReset().mockResolvedValue([])
})

describe('navItems', () => {
  it('routes the Vouchers item to /vouchers', () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === 'Vouchers')
    expect(item?.href).toBe('/vouchers')
  })
})

describe('VouchersPage list', () => {
  it('renders a loading state while the lists are in flight', () => {
    listCustomVouchers.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('pins flagship vouchers at the top as read-only (no edit/delete)', async () => {
    listFlagshipVouchers.mockResolvedValue([
      row({ id: 'rmv1', title: 'Flagship BOGO', type: 'BOGO', isRmv: true }),
    ])
    listCustomVouchers.mockResolvedValue([row()])
    renderPage()
    const flagship = await screen.findByTestId('flagship-section')
    expect(within(flagship).getByText('Flagship BOGO')).toBeInTheDocument()
    // A flagship card carries no edit/delete affordance.
    expect(within(flagship).queryByRole('button', { name: /edit|delete/i })).toBeNull()
  })

  it('renders the approved-waiting distinct label', async () => {
    listCustomVouchers.mockResolvedValue([
      row({ id: 'v2', title: 'Waiting voucher', status: 'PENDING_APPROVAL', approvalStatus: 'APPROVED' }),
    ])
    renderPage()
    expect(await screen.findByText('Waiting voucher')).toBeInTheDocument()
    expect(screen.getByText(/goes live when your business is live/i)).toBeInTheDocument()
  })

  it('filters by status (In review hides a Live voucher)', async () => {
    listCustomVouchers.mockResolvedValue([
      row({ id: 'v1', title: 'Live voucher', status: 'ACTIVE', approvalStatus: 'APPROVED' }),
      row({ id: 'v2', title: 'Review voucher', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' }),
    ])
    renderPage()
    await screen.findByText('Live voucher')
    fireEvent.click(screen.getByRole('tab', { name: /in review/i }))
    await waitFor(() => expect(screen.queryByText('Live voucher')).toBeNull())
    expect(screen.getByText('Review voucher')).toBeInTheDocument()
  })

  it('a custom row click routes to /vouchers/[id]', async () => {
    listCustomVouchers.mockResolvedValue([row({ id: 'v9', title: 'Tappable voucher' })])
    renderPage()
    const title = await screen.findByText('Tappable voucher')
    fireEvent.click(title.closest('[data-voucher-card]')!)
    expect(push).toHaveBeenCalledWith('/vouchers/v9')
  })

  it('opens the builder immediately on the ?create=1 deep-link (shell wave Quick Action)', async () => {
    searchParams = new URLSearchParams('create=1')
    listCustomVouchers.mockResolvedValue([row()])
    renderPage()
    expect(await screen.findByTestId('day-two-builder')).toBeInTheDocument()
  })

  it('the Create a voucher action opens the builder', async () => {
    // A populated list shows exactly one Create button (the section header one).
    listCustomVouchers.mockResolvedValue([row()])
    renderPage()
    await screen.findByText('Free coffee with breakfast')
    fireEvent.click(screen.getByRole('button', { name: /create a voucher/i }))
    expect(await screen.findByTestId('day-two-builder')).toBeInTheDocument()
  })

  it('renders the empty state when there are no custom vouchers', async () => {
    listCustomVouchers.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/create your first voucher/i)).toBeInTheDocument()
  })

  it('renders the per-voucher redemption count on a card', async () => {
    listCustomVouchers.mockResolvedValue([row({ redemptionCount: 12 })])
    renderPage()
    await screen.findByText('Free coffee with breakfast')
    expect(screen.getByText(/12 redemptions/i)).toBeInTheDocument()
  })

  it('B-7: renders the header stat strip with Total / Live / In review / Draft counts', async () => {
    listCustomVouchers.mockResolvedValue([
      row({ id: 'v1', title: 'Live one', status: 'ACTIVE', approvalStatus: 'APPROVED' }),
      row({ id: 'v2', title: 'Review one', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' }),
      row({ id: 'v3', title: 'Draft one', status: 'DRAFT', approvalStatus: 'PENDING' }),
      row({ id: 'v4', title: 'Draft two', status: 'DRAFT', approvalStatus: 'CHANGES_REQUESTED' }),
    ])
    renderPage()
    await screen.findByText('Live one')
    const strip = screen.getByTestId('voucher-stat-strip')
    const { getByTestId } = within(strip)
    expect(getByTestId('voucher-stat-total')).toHaveTextContent('4')
    expect(getByTestId('voucher-stat-live')).toHaveTextContent('1')
    expect(getByTestId('voucher-stat-in-review')).toHaveTextContent('1')
    // changes-requested groups with Draft, so Draft is 2.
    expect(getByTestId('voucher-stat-draft')).toHaveTextContent('2')
  })

  it('NEVER renders any customer PII or a redemption PIN, even when the rows carry them (B-6)', async () => {
    // .passthrough() keeps these extra keys on the parsed row; the list must never
    // surface them. Injecting real PII-shaped values makes the assertion non-trivial.
    listCustomVouchers.mockResolvedValue([
      row({
        redemptionPin: '4821',
        customerEmail: 'leaky.customer@example.com',
        customerPhone: '07123456789',
        ownerEmail: 'merchant.owner@example.com',
      }),
    ])
    const { container } = renderPage()
    await screen.findByText('Free coffee with breakfast')
    const text = container.textContent ?? ''
    expect(text).not.toContain('leaky.customer@example.com')
    expect(text).not.toContain('merchant.owner@example.com')
    expect(text).not.toContain('4821')
    expect(text).not.toMatch(/@|07\d{9}|\+44|redemptionPin|PIN/i)
  })
})
