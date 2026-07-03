import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VoucherDetailPage from '@/app/(app)/vouchers/[id]/page'

// Day-2 Vouchers B4: the per-state voucher detail page. Renders for every safe
// state (live / approved-waiting / in-review / draft / changes-requested /
// rejected / finished) showing ONLY safe core fields + the per-voucher redemption
// count + a "View redemptions" deep-link to /redemptions?voucherId=<id>. Never
// customer PII or a redemption PIN.

const getVoucher = jest.fn()
jest.mock('@/lib/api/voucher', () => {
  const actual = jest.requireActual('@/lib/api/voucher')
  return { ...actual, getVoucher: (id: string) => getVoucher(id) }
})

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: jest.fn() }),
  useParams: () => ({ id: 'v1' }),
}))

// Shell wave: the capability seam now reads the session profile; these tests pin
// page behaviour, not the seam (covered by useVoucherCapability.test.ts).
jest.mock('@/lib/voucher/useVoucherCapability', () => ({
  useVoucherCapability: () => ({ canManage: true, ready: true }),
}))

jest.mock('@/lib/voucher/useVoucherCategoryName', () => ({
  useVoucherCategoryName: () => 'Food & Drink',
}))

// The builder is exercised in its own suite; stub it so the detail-edit path is testable.
jest.mock('@/components/vouchers/builder/DayTwoBuilder', () => ({
  DayTwoBuilder: () => <div data-testid="day-two-builder" />,
}))

function voucher(over: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    title: 'Free coffee with breakfast',
    type: 'FREEBIE',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    estimatedSaving: 4,
    description: 'Enjoy a free coffee on us.',
    terms: 'One per visit',
    isRmv: false,
    createdAt: '2026-06-19T10:00:00.000Z',
    redemptionCount: 9,
    merchantFields: { builderType: 'freebie' },
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
  getVoucher.mockReset().mockResolvedValue(voucher())
})

describe('VoucherDetailPage render', () => {
  it('renders a loading state while the voucher is in flight', () => {
    getVoucher.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders the safe core fields (title / description / terms / saving)', async () => {
    renderPage()
    // The title + description appear in both the header/body and the customer
    // preview card, so allow more than one match.
    expect((await screen.findAllByText('Free coffee with breakfast')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Enjoy a free coffee on us.').length).toBeGreaterThan(0)
    expect(screen.getByText('One per visit')).toBeInTheDocument()
    expect(screen.getAllByText(/£4/).length).toBeGreaterThan(0)
  })

  it('shows the Live state label', async () => {
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    expect(screen.getAllByText(/^Live$/).length).toBeGreaterThan(0)
  })

  it('shows the distinct approved-waiting label', async () => {
    getVoucher.mockResolvedValue(voucher({ status: 'PENDING_APPROVAL', approvalStatus: 'APPROVED' }))
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    expect(screen.getByText(/goes live when your business is live/i)).toBeInTheDocument()
  })

  it('shows the in-review state', async () => {
    getVoucher.mockResolvedValue(voucher({ status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' }))
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    expect(screen.getAllByText(/^In review$/).length).toBeGreaterThan(0)
  })

  it('shows the rejected state with the approval comment', async () => {
    getVoucher.mockResolvedValue(
      voucher({ status: 'INACTIVE', approvalStatus: 'REJECTED', approvalComment: 'Saving too low' }),
    )
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    expect(screen.getAllByText(/^Rejected$/).length).toBeGreaterThan(0)
    expect(screen.getByText('Saving too low')).toBeInTheDocument()
  })

  it('renders the per-voucher redemption count', async () => {
    getVoucher.mockResolvedValue(voucher({ redemptionCount: 9 }))
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('the View redemptions link targets /redemptions?voucherId=<id>', async () => {
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    const link = screen.getByRole('link', { name: /view redemptions/i })
    expect(link).toHaveAttribute('href', '/redemptions?voucherId=v1')
  })

  it('NEVER renders customer PII or a redemption PIN, even when the payload carries them (B-6)', async () => {
    // Inject PII-shaped extras: .passthrough() keeps them on the parsed object, so a
    // careless render would leak them. The detail view must drop them entirely.
    getVoucher.mockResolvedValue(
      voucher({
        redemptionPin: '4821',
        customerEmail: 'leaky.customer@example.com',
        customerPhone: '07123456789',
        ownerEmail: 'merchant.owner@example.com',
      }),
    )
    const { container } = renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    const text = container.textContent ?? ''
    expect(text).not.toContain('leaky.customer@example.com')
    expect(text).not.toContain('merchant.owner@example.com')
    expect(text).not.toContain('4821')
    expect(text).not.toMatch(/@|07\d{9}|\+44|redemptionPin/i)
    expect(text).not.toMatch(/\bPIN\b/)
  })

  it('renders an error state when the fetch fails', async () => {
    getVoucher.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/could not load this voucher/i)).toBeInTheDocument()
  })

  it('renders a where-it-applies note (merchant-wide)', async () => {
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    expect(screen.getByText(/all your branches/i)).toBeInTheDocument()
  })
})

describe('VoucherDetailPage concierge on the read view (B-3)', () => {
  it('a CHANGES_REQUESTED voucher shows the adminNote + a proposed-vs-current row on the READ view', async () => {
    getVoucher.mockResolvedValue(
      voucher({
        status: 'DRAFT',
        approvalStatus: 'CHANGES_REQUESTED',
        merchantFields: {
          builderType: 'freebie',
          adminNote: 'Please raise the saving and sharpen the title.',
          adminProposed: { title: 'A sharper title', estimatedSaving: 6 },
        },
      }),
    )
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    // The note shows on the read view (not only after clicking Edit).
    expect(screen.getByText(/raise the saving and sharpen the title/i)).toBeInTheDocument()
    // At least one proposed-vs-current row renders read-only (no Apply button here).
    expect(screen.getByTestId('concierge-readonly-proposed-title')).toHaveTextContent('A sharper title')
    expect(screen.getByTestId('concierge-readonly-current-title')).toHaveTextContent(
      'Free coffee with breakfast',
    )
    // The Apply action lives only in the Edit builder, not the read view.
    expect(screen.queryByRole('button', { name: /apply redeemo's suggestions/i })).toBeNull()
    // There is a clear "Edit to resubmit" affordance.
    expect(screen.getByText(/edit to resubmit/i)).toBeInTheDocument()
  })

  it('a comment-only CHANGES_REQUESTED voucher shows the note even with no adminProposed', async () => {
    getVoucher.mockResolvedValue(
      voucher({
        status: 'DRAFT',
        approvalStatus: 'CHANGES_REQUESTED',
        merchantFields: { builderType: 'freebie', adminNote: 'Tighten the wording a little.' },
      }),
    )
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    expect(screen.getByText(/tighten the wording a little/i)).toBeInTheDocument()
  })
})
