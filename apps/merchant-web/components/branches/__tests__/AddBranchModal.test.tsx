import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddBranchModal } from '@/components/branches/AddBranchModal'
import { ApiError } from '@/lib/api/client'

// Branches PR-5 §6 (CREATE): the live owner-only add-branch modal (prototypes 01/02).
// Manual address only (no lat/lng / map / Google). On submit it posts via useCreateBranch
// then navigates to the new branch detail page. Required: name + address line 1 + city +
// postcode. POSTCODE_NOT_FOUND shows inline under postcode; everything else is a calm
// modal-level message; the modal stays open on error.

// --- the create-branch mutation hook ----------------------------------------
const createMutateAsync = jest.fn()
let createPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useCreateBranch: () => ({ mutateAsync: createMutateAsync, isPending: createPending }),
}))

// --- router -----------------------------------------------------------------
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const onClose = jest.fn()

beforeEach(() => {
  createMutateAsync.mockReset().mockResolvedValue({ id: 'b-new', lifecycleStatus: 'PENDING_CREATE' })
  push.mockReset()
  onClose.mockReset()
  createPending = false
})

function fillRequired() {
  fireEvent.change(screen.getByLabelText('Branch name'), { target: { value: 'Mill Road' } })
  fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '88 Mill Road' } })
  fireEvent.change(screen.getByLabelText('Town or city'), { target: { value: 'Cambridge' } })
  fireEvent.change(screen.getByLabelText('Postcode'), { target: { value: 'CB1 2AS' } })
}

describe('AddBranchModal', () => {
  it('renders the create form with the manual-address fields and NO lat/lng input', () => {
    render(<AddBranchModal onClose={onClose} />)
    expect(screen.getByRole('heading', { name: /add a branch/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Branch name')).toBeInTheDocument()
    expect(screen.getByLabelText('Address line 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Town or city')).toBeInTheDocument()
    expect(screen.getByLabelText('Postcode')).toBeInTheDocument()
    // Manual address only: there is no coordinate input.
    expect(screen.queryByLabelText(/latitude|longitude/i)).not.toBeInTheDocument()
  })

  it('validates the required fields before submitting (no network on empty form)', () => {
    render(<AddBranchModal onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    expect(createMutateAsync).not.toHaveBeenCalled()
    expect(screen.getByTestId('add-branch-name-error')).toBeInTheDocument()
    expect(screen.getByTestId('add-branch-postcode-error')).toBeInTheDocument()
  })

  it('calls useCreateBranch with the trimmed manual-address body (no lat/lng)', async () => {
    render(<AddBranchModal onClose={onClose} />)
    fillRequired()
    fireEvent.change(screen.getByLabelText(/branch phone/i), { target: { value: '01223 000000' } })
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    const body = createMutateAsync.mock.calls[0][0]
    expect(body).toMatchObject({
      name: 'Mill Road',
      addressLine1: '88 Mill Road',
      city: 'Cambridge',
      postcode: 'CB1 2AS',
      phone: '01223 000000',
    })
    expect(body).not.toHaveProperty('latitude')
    expect(body).not.toHaveProperty('longitude')
  })

  it('navigates to the new branch detail page and closes on success', async () => {
    render(<AddBranchModal onClose={onClose} />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/branches/b-new'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the postcode lookup error inline and stays open (POSTCODE_NOT_FOUND)', async () => {
    createMutateAsync.mockRejectedValue(new ApiError(400, { error: { code: 'POSTCODE_NOT_FOUND' } }))
    render(<AddBranchModal onClose={onClose} />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    expect(await screen.findByTestId('add-branch-postcode-lookup-error')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a calm modal-level error on a generic failure and stays open', async () => {
    createMutateAsync.mockRejectedValue(new ApiError(500, { error: { code: 'INTERNAL' } }))
    render(<AddBranchModal onClose={onClose} />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    expect(await screen.findByTestId('add-branch-modal-error')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
