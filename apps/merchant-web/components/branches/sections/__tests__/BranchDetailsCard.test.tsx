import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BranchDetailsCard } from '@/components/branches/sections/BranchDetailsCard'
import type { Branch, BranchPendingEdit } from '@/lib/api/branch'

// Branches PR-1 F7: the Branch details card (prototype 07/11). It shows the current
// identity values (name, about, address, city, postcode) read-only with a "Reviewed by
// Redeemo" note. An owner gets an Edit button (opens the F7 modal) and, when an edit is
// in review, a pending banner with a Withdraw action. A non-owner is read-only with no
// Edit and no Withdraw.

// --- the modal (mocked so this card test stays focused) ---------------------
const onModalClose = jest.fn()
jest.mock('@/components/branches/BranchDetailsEditModal', () => ({
  BranchDetailsEditModal: ({ onClose }: { onClose: () => void }) => {
    onModalClose.mockImplementation(onClose)
    return (
      <div data-testid="edit-modal">
        <button type="button" onClick={onClose}>
          close-modal
        </button>
      </div>
    )
  },
}))

// --- the withdraw mutation hook ---------------------------------------------
const withdrawMutateAsync = jest.fn()
let withdrawPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useWithdrawBranchEditRequest: () => ({ mutateAsync: withdrawMutateAsync, isPending: withdrawPending }),
}))

// --- toast ------------------------------------------------------------------
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

function pendingEdit(over: Partial<BranchPendingEdit> = {}): BranchPendingEdit {
  return {
    id: 'edit1',
    branchId: 'b1',
    merchantId: 'm1',
    proposedChanges: { name: 'High Street Cafe', city: 'Cambridge' },
    includesPhotos: false,
    status: 'PENDING',
    createdAt: '2026-06-23T10:00:00.000Z',
    ...over,
  } as BranchPendingEdit
}

function branch(over: Record<string, unknown> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    about: 'A flagship dining room.',
    addressLine1: '12 High Street',
    city: 'Cambridge',
    postcode: 'CB2 1AB',
    pendingEdits: [],
    ...over,
  } as unknown as Branch
}

beforeEach(() => {
  withdrawMutateAsync.mockReset().mockResolvedValue({})
  toast.mockReset()
  onModalClose.mockReset()
  withdrawPending = false
})

describe('BranchDetailsCard view', () => {
  it('renders the current identity values read-only with the reviewed-by-Redeemo note', () => {
    render(<BranchDetailsCard branch={branch()} canManage />)
    expect(screen.getByText('High Street')).toBeInTheDocument()
    expect(screen.getByText('A flagship dining room.')).toBeInTheDocument()
    expect(screen.getByText(/12 High Street/)).toBeInTheDocument()
    expect(screen.getByText(/reviewed by redeemo/i)).toBeInTheDocument()
  })
})

describe('BranchDetailsCard owner edit', () => {
  it('opens the edit modal when the owner taps Edit', () => {
    render(<BranchDetailsCard branch={branch()} canManage />)
    expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument()
  })

  it('closes the modal via its onClose', () => {
    render(<BranchDetailsCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    fireEvent.click(screen.getByRole('button', { name: /close-modal/i }))
    expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument()
  })
})

describe('BranchDetailsCard pending requests + withdraw', () => {
  it('shows the pending banner only for PENDING edits and offers withdraw to the owner', () => {
    render(
      <BranchDetailsCard
        branch={branch({ pendingEdits: [pendingEdit(), pendingEdit({ id: 'old', status: 'WITHDRAWN' })] })}
        canManage
      />,
    )
    // The withdrawn edit must NOT surface a withdraw control; only the PENDING one.
    const withdrawButtons = screen.getAllByRole('button', { name: /withdraw/i })
    expect(withdrawButtons).toHaveLength(1)
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument()
  })

  // Fidelity polish (2026-07-07 audit): the banner now diffs proposedChanges
  // against the branch's current live values + shows the submission date, instead
  // of only the old generic "a change is already in review" copy.
  it('shows the field diff (old -> new) + the submitted date for a sample proposedChanges', () => {
    render(
      <BranchDetailsCard
        branch={branch({
          addressLine1: '12 High Street',
          pendingEdits: [
            pendingEdit({
              proposedChanges: { addressLine1: '32 High Street' },
              createdAt: '2026-06-17T09:00:00.000Z',
            }),
          ],
        })}
        canManage
      />,
    )
    const diff = screen.getByTestId('pending-edit-diff')
    expect(diff).toHaveTextContent('Address line 1:')
    expect(diff).toHaveTextContent('12 High Street')
    expect(diff).toHaveTextContent('32 High Street')
    expect(screen.getByText(/submitted 17 june 2026/i)).toBeInTheDocument()
  })

  // IMAGE fields (logoUrl/bannerUrl) must never leak the raw URL into the diff -
  // only a friendly "<field> (change pending)" label.
  it('shows a friendly label for an image field instead of the raw URL', () => {
    render(
      <BranchDetailsCard
        branch={branch({
          logoUrl: 'https://cdn.example.com/logo-old.png',
          pendingEdits: [
            pendingEdit({ proposedChanges: { logoUrl: 'https://cdn.example.com/logo-new-secret.png' } }),
          ],
        })}
        canManage
      />,
    )
    const diff = screen.getByTestId('pending-edit-diff')
    expect(diff).toHaveTextContent('Logo image (change pending)')
    expect(diff).not.toHaveTextContent('https://cdn.example.com')
  })

  it('renders no diff rows when proposedChanges carries no labelled fields', () => {
    render(
      <BranchDetailsCard
        branch={branch({ pendingEdits: [pendingEdit({ proposedChanges: {} })] })}
        canManage
      />,
    )
    expect(screen.queryByTestId('pending-edit-diff')).not.toBeInTheDocument()
  })

  it('withdraws the correct editId and toasts', async () => {
    render(<BranchDetailsCard branch={branch({ pendingEdits: [pendingEdit({ id: 'edit-xyz' })] })} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /withdraw/i }))
    await waitFor(() =>
      expect(withdrawMutateAsync).toHaveBeenCalledWith({ id: 'b1', editId: 'edit-xyz' }),
    )
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    )
  })

  it('blocks Edit while an edit is in review and points to the pending item', () => {
    render(<BranchDetailsCard branch={branch({ pendingEdits: [pendingEdit()] })} canManage />)
    // A second concurrent request is not allowed: Edit is disabled while one is pending.
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeDisabled()
  })
})

describe('BranchDetailsCard non-owner read-only', () => {
  it('shows no Edit and no Withdraw for a non-owner even with a pending edit', () => {
    render(<BranchDetailsCard branch={branch({ pendingEdits: [pendingEdit()] })} canManage={false} />)
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /withdraw/i })).not.toBeInTheDocument()
    // The current values still render read-only (the branch name text also appears
    // inside the pending-edit diff's "old" value, hence getAllByText here).
    expect(screen.getAllByText('High Street').length).toBeGreaterThan(0)
  })
})
