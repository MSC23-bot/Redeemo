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

// --- PR-6: the location lookup search (mounted inside the modal) ------------
const searchLocation = jest.fn()
jest.mock('@/lib/api/location', () => ({
  searchLocation: (...args: unknown[]) => searchLocation(...args),
}))

// --- Slice 3: PinDropMap is mounted for the chained pin-drop step. Stub it so
// this file only asserts the CHAINING (which branch, which callbacks), not the
// map's own internals (covered by PinDropMap.test.tsx). ---------------------
jest.mock('@/components/branches/PinDropMap', () => ({
  PinDropMap: ({ branch, onDone, onCancel }: { branch: { id: string }; onDone: () => void; onCancel: () => void }) => (
    <div data-testid="pin-drop-map-stub" data-branch-id={branch.id}>
      <button type="button" onClick={onDone}>
        stub-done
      </button>
      <button type="button" onClick={onCancel}>
        stub-cancel
      </button>
    </div>
  ),
}))

const onClose = jest.fn()

beforeEach(() => {
  createMutateAsync.mockReset().mockResolvedValue({ id: 'b-new', lifecycleStatus: 'PENDING_CREATE' })
  push.mockReset()
  onClose.mockReset()
  searchLocation.mockReset()
  createPending = false
})

const PICK_CANDIDATE = {
  candidateToken: 'tok_addbranch',
  name: 'Old Foundry Kitchen',
  formattedAddress: '12 Mill Lane, Huddersfield, HD1 1AA, UK',
  addressParts: { addressLine1: '12 Mill Lane', city: 'Huddersfield', postcode: 'HD1 1AA' },
}

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

describe('AddBranchModal PR-6 location lookup', () => {
  it('renders the lookup field and no map/pin/coordinate input', () => {
    render(<AddBranchModal onClose={onClose} />)
    expect(screen.getByTestId('location-lookup')).toBeInTheDocument()
    expect(screen.queryByLabelText(/latitude|longitude/i)).not.toBeInTheDocument()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('autofills the address fields from a Google pick', async () => {
    searchLocation.mockResolvedValue([PICK_CANDIDATE])
    render(<AddBranchModal onClose={onClose} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })
    fireEvent.click(await screen.findByTestId('location-lookup-result'))

    expect((screen.getByLabelText('Address line 1') as HTMLInputElement).value).toBe('12 Mill Lane')
    expect((screen.getByLabelText('Town or city') as HTMLInputElement).value).toBe('Huddersfield')
    expect((screen.getByLabelText('Postcode') as HTMLInputElement).value).toBe('HD1 1AA')
  })

  it('carries the candidateToken (never lat/lng) on the create body after a pick', async () => {
    searchLocation.mockResolvedValue([PICK_CANDIDATE])
    render(<AddBranchModal onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Branch name'), { target: { value: 'Old Foundry' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })
    fireEvent.click(await screen.findByTestId('location-lookup-result'))

    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    const body = createMutateAsync.mock.calls[0][0]
    expect(body.candidateToken).toBe('tok_addbranch')
    expect(body).not.toHaveProperty('latitude')
    expect(body).not.toHaveProperty('longitude')
    expect(body).not.toHaveProperty('placeId')
  })

  it('drops the candidateToken when the merchant hand-edits an address field after a pick', async () => {
    searchLocation.mockResolvedValue([PICK_CANDIDATE])
    render(<AddBranchModal onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Branch name'), { target: { value: 'Old Foundry' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })
    fireEvent.click(await screen.findByTestId('location-lookup-result'))
    // Hand-edit the postcode -> invalidates the picked token.
    fireEvent.change(screen.getByLabelText('Postcode'), { target: { value: 'HD2 2BB' } })

    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    expect(createMutateAsync.mock.calls[0][0]).not.toHaveProperty('candidateToken')
  })
})

describe('AddBranchModal Slice 3 create-then-drop chain', () => {
  it('chains straight into the pin-drop step for a POSTCODE_CENTROID branch, without navigating yet', async () => {
    createMutateAsync.mockResolvedValue({ id: 'b-new', locationConfidence: 'POSTCODE_CENTROID' })
    render(<AddBranchModal onClose={onClose} />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))

    const stub = await screen.findByTestId('pin-drop-map-stub')
    expect(stub.dataset.branchId).toBe('b-new')
    expect(push).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('chains into the pin-drop step for a NEEDS_REVIEW branch (a Google pick that failed the cross-check)', async () => {
    createMutateAsync.mockResolvedValue({ id: 'b-new', locationConfidence: 'NEEDS_REVIEW' })
    render(<AddBranchModal onClose={onClose} />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    expect(await screen.findByTestId('pin-drop-map-stub')).toBeInTheDocument()
  })

  it('skips the pin-drop step and navigates straight through for an ADDRESS_GEOCODED branch (Google pick passed)', async () => {
    createMutateAsync.mockResolvedValue({ id: 'b-new', locationConfidence: 'ADDRESS_GEOCODED' })
    render(<AddBranchModal onClose={onClose} />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/branches/b-new'))
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByTestId('pin-drop-map-stub')).not.toBeInTheDocument()
  })

  it('navigates to the branch page when the merchant completes the pin-drop step (Done)', async () => {
    createMutateAsync.mockResolvedValue({ id: 'b-new', locationConfidence: 'POSTCODE_CENTROID' })
    render(<AddBranchModal onClose={onClose} />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    fireEvent.click(await screen.findByText('stub-done'))
    expect(push).toHaveBeenCalledWith('/branches/b-new')
    expect(onClose).toHaveBeenCalled()
  })

  it('still navigates to the branch page when the merchant skips the pin-drop step (Cancel) - the branch already exists', async () => {
    createMutateAsync.mockResolvedValue({ id: 'b-new', locationConfidence: 'POSTCODE_CENTROID' })
    render(<AddBranchModal onClose={onClose} />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))
    fireEvent.click(await screen.findByText('stub-cancel'))
    expect(push).toHaveBeenCalledWith('/branches/b-new')
    expect(onClose).toHaveBeenCalled()
  })
})
