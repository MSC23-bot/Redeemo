import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CloseBranchModal } from '@/components/branches/CloseBranchModal'
import type { Branch } from '@/lib/api/branch'
import { ApiError } from '@/lib/api/client'

// Branches PR-5 §6 (CLOSE): the reason-collecting close-request modal (prototype 10).
// Heading "Request to close <branch>?"; the explainer that the branch stays live until
// approved; the radio reason list (Permanently closed / Relocating / Temporary
// refurbishment / Other free-text); 'Send close request' -> useRequestBranchClose.
// Surfaces BRANCH_IS_MAIN / BRANCH_LAST_ACTIVE calmly; the modal stays open on error.

// --- the close-request mutation hook ----------------------------------------
const requestMutateAsync = jest.fn()
let requestPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useRequestBranchClose: () => ({ mutateAsync: requestMutateAsync, isPending: requestPending }),
}))

const onClose = jest.fn()

function branch(over: Record<string, unknown> = {}): Branch {
  return { id: 'b1', name: 'Mill Road', ...over } as unknown as Branch
}

beforeEach(() => {
  requestMutateAsync.mockReset().mockResolvedValue({ id: 'b1', lifecycleStatus: 'PENDING_CLOSE' })
  onClose.mockReset()
  requestPending = false
})

describe('CloseBranchModal', () => {
  it('renders the prototype-10 heading + explainer + the four reason options', () => {
    render(<CloseBranchModal branch={branch()} onClose={onClose} />)
    expect(screen.getByRole('heading', { name: /request to close mill road\?/i })).toBeInTheDocument()
    expect(screen.getByText(/stays live for customers until it is approved/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/permanently closed/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/relocating to a new address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/temporary refurbishment/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Other')).toBeInTheDocument()
  })

  it('requires a reason before sending (no network with nothing selected)', () => {
    render(<CloseBranchModal branch={branch()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('send-close-request'))
    expect(requestMutateAsync).not.toHaveBeenCalled()
    expect(screen.getByTestId('close-branch-form-error')).toBeInTheDocument()
  })

  it('calls useRequestBranchClose with the chosen preset reason label', async () => {
    render(<CloseBranchModal branch={branch()} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText(/relocating to a new address/i))
    fireEvent.click(screen.getByTestId('send-close-request'))
    await waitFor(() =>
      expect(requestMutateAsync).toHaveBeenCalledWith({ id: 'b1', reason: 'Relocating to a new address' }),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('sends the free-text when Other is chosen, and requires non-empty Other text', async () => {
    render(<CloseBranchModal branch={branch()} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Other'))
    // Empty Other text blocks submit.
    fireEvent.click(screen.getByTestId('send-close-request'))
    expect(requestMutateAsync).not.toHaveBeenCalled()
    expect(screen.getByTestId('close-branch-form-error')).toBeInTheDocument()
    // Filling it lets the submit through with the typed reason.
    fireEvent.change(screen.getByTestId('close-branch-other-text'), { target: { value: 'Lease ended' } })
    fireEvent.click(screen.getByTestId('send-close-request'))
    await waitFor(() =>
      expect(requestMutateAsync).toHaveBeenCalledWith({ id: 'b1', reason: 'Lease ended' }),
    )
  })

  it('surfaces BRANCH_IS_MAIN calmly and stays open', async () => {
    requestMutateAsync.mockRejectedValue(new ApiError(409, { error: { code: 'BRANCH_IS_MAIN' } }))
    render(<CloseBranchModal branch={branch()} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText(/permanently closed/i))
    fireEvent.click(screen.getByTestId('send-close-request'))
    const err = await screen.findByTestId('close-branch-modal-error')
    expect(err).toHaveTextContent(/main branch/i)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('surfaces BRANCH_LAST_ACTIVE calmly and stays open', async () => {
    requestMutateAsync.mockRejectedValue(new ApiError(409, { error: { code: 'BRANCH_LAST_ACTIVE' } }))
    render(<CloseBranchModal branch={branch()} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText(/permanently closed/i))
    fireEvent.click(screen.getByTestId('send-close-request'))
    const err = await screen.findByTestId('close-branch-modal-error')
    expect(err).toHaveTextContent(/last active branch/i)
    expect(onClose).not.toHaveBeenCalled()
  })
})
