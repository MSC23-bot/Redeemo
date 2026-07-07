import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VoucherGovernedMenu, type GovernedMenuVoucher } from '@/components/vouchers/VoucherGovernedMenu'
import { ApiError } from '@/lib/api/client'

// Voucher governed flows (2026-07-07): the shared kebab menu (list card + detail
// page). Pins: D4 (request-to-end / any end affordance NEVER offered on a
// flagship voucher), a flagship never getting Edit/Submit/Delete (this menu
// never renders them at all, for any voucher), withdraw-submission only for an
// in-review custom voucher and hidden once approved-waiting.

const requestChangeMutate = jest.fn()
const requestEndMutate = jest.fn()
const withdrawSubmissionMutate = jest.fn()
const withdrawPendingEditMutate = jest.fn()

jest.mock('@/lib/voucher/useVoucherGovernedActions', () => ({
  useRequestFlagshipChange: () => ({ mutateAsync: requestChangeMutate, isPending: false }),
  useRequestVoucherEnd: () => ({ mutateAsync: requestEndMutate, isPending: false }),
  useWithdrawVoucherSubmission: () => ({ mutateAsync: withdrawSubmissionMutate, isPending: false }),
  useWithdrawVoucherPendingEdit: () => ({ mutateAsync: withdrawPendingEditMutate, isPending: false }),
}))

function flagship(over: Partial<GovernedMenuVoucher> = {}): GovernedMenuVoucher {
  return {
    id: 'rmv1',
    title: 'Free coffee',
    description: 'A free coffee',
    terms: 'One per visit',
    estimatedSaving: 4,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    isRmv: true,
    pendingEdit: null,
    ...over,
  }
}

function custom(over: Partial<GovernedMenuVoucher> = {}): GovernedMenuVoucher {
  return {
    id: 'v1',
    title: 'Buy one get one free',
    description: 'BOGO',
    terms: 'One per visit',
    estimatedSaving: 8,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    isRmv: false,
    pendingEdit: null,
    ...over,
  }
}

function renderMenu(props: Partial<React.ComponentProps<typeof VoucherGovernedMenu>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <VoucherGovernedMenu
        voucher={custom()}
        canManage
        onDuplicate={jest.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

async function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /actions for/i }))
  await screen.findByRole('menu')
}

describe('VoucherGovernedMenu - flagship', () => {
  it('offers Request a change + Duplicate, and NEVER Request to end / Edit / Submit / Delete', async () => {
    renderMenu({ voucher: flagship() })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /request a change/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^duplicate$/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /request to end/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /submit for review/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull()
  })

  it('never offers Request to end even when the flagship has no open request and is somehow non-live', async () => {
    renderMenu({ voucher: flagship({ status: 'DRAFT', approvalStatus: 'PENDING' }) })
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /request to end/i })).toBeNull()
  })

  it('disables opening a second request while one is PENDING (shows a note instead)', async () => {
    renderMenu({
      voucher: flagship({
        pendingEdit: { id: 'pe1', kind: 'CHANGE', status: 'PENDING', reason: 'x', createdAt: '2026-07-07T00:00:00.000Z', proposedChanges: {} },
      }),
    })
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /request a change/i })).toBeNull()
    expect(screen.getByText(/already awaiting review/i)).toBeInTheDocument()
  })

  it('opens the RequestChangeModal on click', async () => {
    renderMenu({ voucher: flagship() })
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /request a change/i }))
    expect(await screen.findByTestId('request-change-modal')).toBeInTheDocument()
  })
})

describe('VoucherGovernedMenu - custom live', () => {
  it('offers Request to end + a footer note, and never Request a change', async () => {
    renderMenu({ voucher: custom({ status: 'ACTIVE', approvalStatus: 'APPROVED' }) })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /request to end/i })).toBeInTheDocument()
    expect(screen.getByText(/changes to live vouchers are reviewed before customers see them/i)).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /request a change/i })).toBeNull()
  })

  it('opens the RequestEndModal on click', async () => {
    renderMenu({ voucher: custom({ status: 'ACTIVE', approvalStatus: 'APPROVED' }) })
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /request to end/i }))
    expect(await screen.findByTestId('request-end-modal')).toBeInTheDocument()
  })
})

describe('VoucherGovernedMenu - custom in-review / approved-waiting withdraw-submission', () => {
  it('offers Withdraw submission for an in-review (PENDING_APPROVAL + approvalStatus PENDING) voucher', async () => {
    renderMenu({ voucher: custom({ status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' }) })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /withdraw submission/i })).toBeInTheDocument()
  })

  it('hides Withdraw submission once approved-waiting (PENDING_APPROVAL + approvalStatus APPROVED)', async () => {
    renderMenu({ voucher: custom({ status: 'PENDING_APPROVAL', approvalStatus: 'APPROVED' }) })
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /withdraw submission/i })).toBeNull()
  })

  it('withdraw submission calls the mutation and closes the confirm dialog on success', async () => {
    withdrawSubmissionMutate.mockReset().mockResolvedValue({ id: 'v1', status: 'DRAFT' })
    renderMenu({ voucher: custom({ status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' }) })
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /withdraw submission/i }))
    expect(await screen.findByTestId('withdraw-submission-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^withdraw submission$/i }))
    await waitFor(() => expect(withdrawSubmissionMutate).toHaveBeenCalledWith('v1'))
    await waitFor(() => expect(screen.queryByTestId('withdraw-submission-dialog')).toBeNull())
  })

  it('surfaces a clean error if withdrawal races (VOUCHER_WITHDRAW_NOT_PENDING)', async () => {
    withdrawSubmissionMutate
      .mockReset()
      .mockRejectedValue(new ApiError(409, { error: { code: 'VOUCHER_WITHDRAW_NOT_PENDING', message: 'x' } }))
    renderMenu({ voucher: custom({ status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' }) })
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /withdraw submission/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^withdraw submission$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no submission awaiting review/i)
  })
})

describe('VoucherGovernedMenu - View redemptions / Duplicate gating', () => {
  it('View redemptions stays visible even when canManage is false', async () => {
    renderMenu({ voucher: custom(), canManage: false })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /view redemptions/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^duplicate$/i })).toBeNull()
  })

  it('renders nothing when there is no item to show (canManage false, showDuplicate/showViewRedemptions false)', () => {
    const { container } = renderMenu({
      voucher: custom({ status: 'DRAFT', approvalStatus: 'PENDING' }),
      canManage: false,
      showDuplicate: false,
      showViewRedemptions: false,
    })
    expect(container).toBeEmptyDOMElement()
  })
})
