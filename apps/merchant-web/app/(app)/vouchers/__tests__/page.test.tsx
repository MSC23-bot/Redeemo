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
const replace = jest.fn()
// Shell wave: /vouchers?create=1 (the Quick Action deep-link) seeds the builder.
let searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParams,
}))

// Shell wave: the capability seam now reads the session profile; the page tests
// pin page behaviour, not the seam (covered by useVoucherCapability.test.ts).
let mockCapability = { canManage: true, ready: true }
jest.mock('@/lib/voucher/useVoucherCapability', () => ({
  useVoucherCapability: () => mockCapability,
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
  replace.mockReset()
  mockCapability = { canManage: true, ready: true }
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

  // A8: the loading state is now a layout-matching skeleton (card-shaped bones), not
  // bare "Loading your vouchers..." text, while keeping the single role=status contract.
  it('renders skeleton card bones (not bare text) while the lists are in flight', () => {
    listCustomVouchers.mockReturnValue(new Promise(() => {}))
    listFlagshipVouchers.mockReturnValue(new Promise(() => {}))
    renderPage()
    const status = screen.getByRole('status')
    expect(status.querySelectorAll('[data-testid="skeleton-bone"]').length).toBeGreaterThan(0)
  })

  it('replaces the skeleton with real voucher rows once the lists resolve', async () => {
    listFlagshipVouchers.mockResolvedValue([])
    listCustomVouchers.mockResolvedValue([row({ title: 'Free coffee with breakfast' })])
    renderPage()
    expect(await screen.findByText('Free coffee with breakfast')).toBeInTheDocument()
    expect(screen.queryByTestId('skeleton-bone')).not.toBeInTheDocument()
  })

  it('pins flagship vouchers at the top, never with an edit/delete affordance', async () => {
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

  // Voucher governed flows (2026-07-07): flagship cards are now interactive.
  describe('flagship interactivity', () => {
    it('a flagship row click routes to /vouchers/[id], same as a custom row', async () => {
      listFlagshipVouchers.mockResolvedValue([
        row({ id: 'rmv1', title: 'Flagship BOGO', type: 'BOGO', isRmv: true }),
      ])
      listCustomVouchers.mockResolvedValue([])
      renderPage()
      const title = await screen.findByText('Flagship BOGO')
      fireEvent.click(title.closest('[data-voucher-card]')!)
      expect(push).toHaveBeenCalledWith('/vouchers/rmv1')
    })

    it('the flagship kebab offers Request a change / View redemptions / Duplicate, never Request to end/Edit/Delete', async () => {
      listFlagshipVouchers.mockResolvedValue([
        row({ id: 'rmv1', title: 'Flagship BOGO', type: 'BOGO', isRmv: true, status: 'ACTIVE', approvalStatus: 'APPROVED' }),
      ])
      listCustomVouchers.mockResolvedValue([])
      renderPage()
      await screen.findByText('Flagship BOGO')
      fireEvent.click(screen.getByRole('button', { name: /actions for flagship bogo/i }))
      const menu = await screen.findByRole('menu')
      expect(within(menu).getByRole('menuitem', { name: /request a change/i })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: /view redemptions/i })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: /^duplicate$/i })).toBeInTheDocument()
      expect(within(menu).queryByRole('menuitem', { name: /request to end/i })).toBeNull()
      expect(within(menu).queryByRole('menuitem', { name: /^edit$/i })).toBeNull()
      expect(within(menu).queryByRole('menuitem', { name: /^delete$/i })).toBeNull()
    })

    it('the flagship kebab Duplicate navigates to the detail page with ?duplicate=1', async () => {
      listFlagshipVouchers.mockResolvedValue([
        row({ id: 'rmv1', title: 'Flagship BOGO', type: 'BOGO', isRmv: true, status: 'ACTIVE', approvalStatus: 'APPROVED' }),
      ])
      listCustomVouchers.mockResolvedValue([])
      renderPage()
      await screen.findByText('Flagship BOGO')
      fireEvent.click(screen.getByRole('button', { name: /actions for flagship bogo/i }))
      fireEvent.click(await screen.findByRole('menuitem', { name: /^duplicate$/i }))
      expect(push).toHaveBeenCalledWith('/vouchers/rmv1?duplicate=1')
    })

    it('a custom LIVE row kebab offers Request to end, never Request a change', async () => {
      listFlagshipVouchers.mockResolvedValue([])
      listCustomVouchers.mockResolvedValue([
        row({ id: 'v1', title: 'Live BOGO', status: 'ACTIVE', approvalStatus: 'APPROVED' }),
      ])
      renderPage()
      await screen.findByText('Live BOGO')
      fireEvent.click(screen.getByRole('button', { name: /actions for live bogo/i }))
      const menu = await screen.findByRole('menu')
      expect(within(menu).getByRole('menuitem', { name: /request to end/i })).toBeInTheDocument()
      expect(within(menu).queryByRole('menuitem', { name: /request a change/i })).toBeNull()
    })

    it('a custom card shows an "awaiting review" note when it has an open pending edit', async () => {
      listFlagshipVouchers.mockResolvedValue([])
      listCustomVouchers.mockResolvedValue([
        row({
          id: 'v1',
          title: 'Live BOGO',
          status: 'ACTIVE',
          approvalStatus: 'APPROVED',
          pendingEdit: { id: 'pe1', kind: 'END', status: 'PENDING', reason: 'x', createdAt: '2026-07-07T00:00:00.000Z', proposedChanges: null },
        }),
      ])
      renderPage()
      await screen.findByText('Live BOGO')
      expect(screen.getByTestId('voucher-card-pending-note')).toHaveTextContent(/end request awaiting review/i)
    })
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

  it('SAME-PAGE Quick Action: the builder opens when ?create=1 appears after mount, gated on capability', async () => {
    // Codex correction 1: navigating /vouchers -> /vouchers?create=1 keeps the
    // page mounted, so the lazy initializer never re-runs; the param-transition
    // effect must open the builder - and only once the capability is approved.
    searchParams = new URLSearchParams() // mounted WITHOUT the param
    mockCapability = { canManage: false, ready: false } // capability still loading
    listCustomVouchers.mockResolvedValue([row()])
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={qc}>
        <VouchersPage />
      </QueryClientProvider>,
    )
    expect(screen.queryByTestId('day-two-builder')).not.toBeInTheDocument()
    // Quick Action fires: the URL gains ?create=1 in place (no remount).
    searchParams = new URLSearchParams('create=1')
    view.rerender(
      <QueryClientProvider client={qc}>
        <VouchersPage />
      </QueryClientProvider>,
    )
    // Capability still unresolved -> fail closed, no builder yet.
    expect(screen.queryByTestId('day-two-builder')).not.toBeInTheDocument()
    // Capability approves -> the builder opens without a remount.
    mockCapability = { canManage: true, ready: true }
    view.rerender(
      <QueryClientProvider client={qc}>
        <VouchersPage />
      </QueryClientProvider>,
    )
    expect(await screen.findByTestId('day-two-builder')).toBeInTheDocument()
  })

  it('cancelling strips ?create=1 and the builder does not reopen on rerender', async () => {
    searchParams = new URLSearchParams('create=1')
    listCustomVouchers.mockResolvedValue([row()])
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={qc}>
        <VouchersPage />
      </QueryClientProvider>,
    )
    const builder = await screen.findByTestId('day-two-builder')
    expect(builder).toBeInTheDocument()
    fireEvent.click(screen.getByText('builder-cancel'))
    expect(replace).toHaveBeenCalledWith('/vouchers')
    // DANGEROUS WINDOW: the replace has not landed yet, so ?create=1 is STILL
    // in the URL. Rerenders in this window must NOT reopen the builder (the
    // effect fires only on a wantCreate TRANSITION, and true -> true is none).
    view.rerender(
      <QueryClientProvider client={qc}>
        <VouchersPage />
      </QueryClientProvider>,
    )
    expect(screen.queryByTestId('day-two-builder')).not.toBeInTheDocument()
    // The replace lands: the param is gone; still closed.
    searchParams = new URLSearchParams()
    view.rerender(
      <QueryClientProvider client={qc}>
        <VouchersPage />
      </QueryClientProvider>,
    )
    expect(screen.queryByTestId('day-two-builder')).not.toBeInTheDocument()
  })

  it('?create=1 waits out the fail-closed capability load, then opens the builder (no stranding)', async () => {
    searchParams = new URLSearchParams('create=1')
    mockCapability = { canManage: false, ready: false } // profile still loading
    listCustomVouchers.mockResolvedValue([row()])
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={qc}>
        <VouchersPage />
      </QueryClientProvider>,
    )
    // Fail closed: no builder while the capability is unknown.
    expect(screen.queryByTestId('day-two-builder')).not.toBeInTheDocument()
    // Capability resolves -> the deep-link intent is preserved and the builder opens.
    mockCapability = { canManage: true, ready: true }
    view.rerender(
      <QueryClientProvider client={qc}>
        <VouchersPage />
      </QueryClientProvider>,
    )
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
