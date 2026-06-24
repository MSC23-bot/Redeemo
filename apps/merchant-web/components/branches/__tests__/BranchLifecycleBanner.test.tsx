import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BranchLifecycleBanner } from '@/components/branches/BranchLifecycleBanner'
import type { Branch } from '@/lib/api/branch'

// Branches PR-5 §6: the lifecycle banner. PENDING_CREATE shows "Awaiting Redeemo approval"
// + an owner-only Cancel (-> useCancelPendingCreate, routes back to /branches);
// PENDING_CLOSE shows the pending-close banner + an owner-only Withdraw (->
// useWithdrawBranchClose). LIVE / CLOSED render nothing. A non-owner sees the banner copy
// but no action control.

// --- the lifecycle mutation hooks -------------------------------------------
const cancelMutateAsync = jest.fn()
const withdrawMutateAsync = jest.fn()
let cancelPending = false
let withdrawPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useCancelPendingCreate: () => ({ mutateAsync: cancelMutateAsync, isPending: cancelPending }),
  useWithdrawBranchClose: () => ({ mutateAsync: withdrawMutateAsync, isPending: withdrawPending }),
}))

// --- toast + router ---------------------------------------------------------
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

function branch(over: Record<string, unknown> = {}): Branch {
  return { id: 'b1', name: 'Mill Road', ...over } as unknown as Branch
}

beforeEach(() => {
  cancelMutateAsync.mockReset().mockResolvedValue({ ok: true })
  withdrawMutateAsync.mockReset().mockResolvedValue({ id: 'b1', lifecycleStatus: 'LIVE' })
  toast.mockReset()
  push.mockReset()
  cancelPending = false
  withdrawPending = false
})

describe('BranchLifecycleBanner PENDING_CREATE', () => {
  it('shows the awaiting-approval banner', () => {
    render(<BranchLifecycleBanner branch={branch({ lifecycleStatus: 'PENDING_CREATE' })} isOwner />)
    expect(screen.getByTestId('branch-awaiting-approval')).toBeInTheDocument()
    expect(screen.getByText(/awaiting redeemo approval/i)).toBeInTheDocument()
  })

  it('shows a Cancel control to the owner and calls useCancelPendingCreate, then routes to /branches', async () => {
    render(<BranchLifecycleBanner branch={branch({ lifecycleStatus: 'PENDING_CREATE' })} isOwner />)
    fireEvent.click(screen.getByTestId('cancel-pending-create'))
    await waitFor(() => expect(cancelMutateAsync).toHaveBeenCalledWith('b1'))
    expect(push).toHaveBeenCalledWith('/branches')
  })

  it('hides the Cancel control from a non-owner (banner copy still shows)', () => {
    render(<BranchLifecycleBanner branch={branch({ lifecycleStatus: 'PENDING_CREATE' })} isOwner={false} />)
    expect(screen.getByTestId('branch-awaiting-approval')).toBeInTheDocument()
    expect(screen.queryByTestId('cancel-pending-create')).not.toBeInTheDocument()
  })
})

describe('BranchLifecycleBanner PENDING_CLOSE', () => {
  it('shows the pending-close banner', () => {
    render(<BranchLifecycleBanner branch={branch({ lifecycleStatus: 'PENDING_CLOSE' })} isOwner />)
    expect(screen.getByTestId('branch-pending-close')).toBeInTheDocument()
    expect(screen.getByText(/close request awaiting approval/i)).toBeInTheDocument()
  })

  it('shows a Withdraw control to the owner and calls useWithdrawBranchClose', async () => {
    render(<BranchLifecycleBanner branch={branch({ lifecycleStatus: 'PENDING_CLOSE' })} isOwner />)
    fireEvent.click(screen.getByTestId('withdraw-pending-close'))
    await waitFor(() => expect(withdrawMutateAsync).toHaveBeenCalledWith('b1'))
  })

  it('hides the Withdraw control from a non-owner', () => {
    render(<BranchLifecycleBanner branch={branch({ lifecycleStatus: 'PENDING_CLOSE' })} isOwner={false} />)
    expect(screen.getByTestId('branch-pending-close')).toBeInTheDocument()
    expect(screen.queryByTestId('withdraw-pending-close')).not.toBeInTheDocument()
  })
})

describe('BranchLifecycleBanner LIVE / CLOSED', () => {
  it('renders nothing for a LIVE branch', () => {
    const { container } = render(
      <BranchLifecycleBanner branch={branch({ lifecycleStatus: 'LIVE' })} isOwner />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a branch with no lifecycleStatus (older payload)', () => {
    const { container } = render(<BranchLifecycleBanner branch={branch()} isOwner />)
    expect(container).toBeEmptyDOMElement()
  })
})
