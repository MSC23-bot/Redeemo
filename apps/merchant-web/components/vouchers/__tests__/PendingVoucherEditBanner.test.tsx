import * as React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PendingVoucherEditBanner } from '@/components/vouchers/PendingVoucherEditBanner'

// Voucher governed flows (2026-07-07): the shared "awaiting review" banner for
// an open VoucherPendingEdit (either kind). Pins: CHANGE renders a proposed-vs-
// current diff, END renders a plain notice + reason, Withdraw is confirm-gated
// and calls withdrawVoucherPendingEdit with {editId, voucherId}.

const mutateAsync = jest.fn()
jest.mock('@/lib/voucher/useVoucherGovernedActions', () => ({
  useWithdrawVoucherPendingEdit: () => ({ mutateAsync: (...args: unknown[]) => mutateAsync(...args), isPending: false }),
}))

function renderBanner(props: Partial<React.ComponentProps<typeof PendingVoucherEditBanner>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PendingVoucherEditBanner
        voucher={{
          id: 'rmv1',
          title: 'Free coffee with breakfast',
          description: 'Enjoy a free coffee on us.',
          terms: 'One per visit',
          estimatedSaving: 4,
          pendingEdit: null,
          ...props.voucher,
        }}
        canManage
        {...props}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({ id: 'pe1', kind: 'CHANGE', status: 'WITHDRAWN' })
})

describe('PendingVoucherEditBanner', () => {
  it('renders nothing when there is no pending edit', () => {
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a proposed-vs-current diff for a CHANGE request', () => {
    renderBanner({
      voucher: {
        id: 'rmv1',
        title: 'Free coffee with breakfast',
        estimatedSaving: 4,
        pendingEdit: {
          id: 'pe1',
          kind: 'CHANGE',
          status: 'PENDING',
          reason: 'Raise the saving',
          createdAt: '2026-07-07T09:00:00.000Z',
          proposedChanges: { estimatedSaving: 6 },
        },
      },
    })
    expect(screen.getByText(/change awaiting review/i)).toBeInTheDocument()
    expect(screen.getByText(/raise the saving/i)).toBeInTheDocument()
    expect(screen.getByTestId('voucher-pending-edit-current-estimatedSaving')).toHaveTextContent('£4')
    expect(screen.getByTestId('voucher-pending-edit-proposed-estimatedSaving')).toHaveTextContent('£6')
  })

  it('renders a plain end notice + reason for an END request (no diff rows)', () => {
    renderBanner({
      voucher: {
        id: 'v1',
        title: 'Buy one get one free',
        estimatedSaving: 8,
        pendingEdit: {
          id: 'pe2',
          kind: 'END',
          status: 'PENDING',
          reason: 'Retiring this offer',
          createdAt: '2026-07-07T09:00:00.000Z',
          proposedChanges: null,
        },
      },
    })
    expect(screen.getByText(/end request awaiting review/i)).toBeInTheDocument()
    expect(screen.getByText(/retiring this offer/i)).toBeInTheDocument()
    expect(screen.queryByTestId('voucher-pending-edit-diff')).toBeNull()
  })

  it('hides the Withdraw button when canManage is false', () => {
    renderBanner({
      canManage: false,
      voucher: {
        id: 'v1',
        title: 'x',
        estimatedSaving: 1,
        pendingEdit: { id: 'pe1', kind: 'END', status: 'PENDING', reason: 'x', createdAt: '2026-07-07T00:00:00.000Z', proposedChanges: null },
      },
    })
    expect(screen.queryByRole('button', { name: /withdraw request/i })).toBeNull()
  })

  it('withdraw goes through a confirm dialog and calls the mutation with {editId, voucherId}', async () => {
    renderBanner({
      voucher: {
        id: 'v1',
        title: 'Buy one get one free',
        estimatedSaving: 8,
        pendingEdit: { id: 'pe2', kind: 'END', status: 'PENDING', reason: 'x', createdAt: '2026-07-07T00:00:00.000Z', proposedChanges: null },
      },
    })
    fireEvent.click(screen.getByRole('button', { name: /withdraw request/i }))
    const dialog = await screen.findByTestId('withdraw-pending-edit-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /withdraw request/i }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ editId: 'pe2', voucherId: 'v1' }))
  })
})
