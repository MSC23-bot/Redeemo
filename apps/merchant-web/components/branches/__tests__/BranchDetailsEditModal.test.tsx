import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { BranchDetailsEditModal } from '@/components/branches/BranchDetailsEditModal'
import type { Branch } from '@/lib/api/branch'
import { ApiError } from '@/lib/api/client'

// Branches PR-1 F7: the reviewed branch-details edit modal (prototype 11). Fields
// EXACTLY: Branch name (name), Description (about), Address line 1 (addressLine1),
// Address line 2 (addressLine2), Town or city (city), Postcode (postcode), plus
// logo/banner via the file-upload control. Submit posts ONLY the SENSITIVE subset
// (those fields) via createBranchEditRequest -> POST /edit-request; it NEVER sends
// lat/lng (the backend resolves location from postcode). The in-modal "Location on
// the map" preview is a static placeholder (no network). Error UX: PENDING_EDIT_EXISTS
// (409) inline notice + blocks a second submit; POSTCODE_NOT_FOUND inline under the
// Postcode field; GAZETTEER_UNAVAILABLE modal-level alert. In all cases the modal
// stays open and "Send for review" re-enables.

// --- the create-edit-request mutation hook ----------------------------------
const createMutateAsync = jest.fn()
let createPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useCreateBranchEditRequest: () => ({ mutateAsync: createMutateAsync, isPending: createPending }),
}))

// --- the file-upload control: capture submitted urls without a network call --
// We render a tiny stub that exposes a button per kind so a test can simulate an
// upload completing with a known URL.
jest.mock('@/components/ui/file-upload', () => ({
  FileUpload: ({ kind, label, onUploaded }: { kind: string; label: string; onUploaded?: (u: string) => void }) => (
    <button type="button" aria-label={label} onClick={() => onUploaded?.(`https://cdn/${kind}.png`)}>
      {label}
    </button>
  ),
}))

const apiFetch = jest.fn()
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual('@/lib/api/client')
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) }
})

// --- PR-6: the location lookup search (mounted inside the modal) ------------
const searchLocation = jest.fn()
jest.mock('@/lib/api/location', () => ({
  searchLocation: (...args: unknown[]) => searchLocation(...args),
}))

const PICK_CANDIDATE = {
  candidateToken: 'tok_editmodal',
  name: 'Old Foundry Kitchen',
  formattedAddress: '12 Mill Lane, Huddersfield, HD1 1AA, UK',
  addressParts: { addressLine1: '12 Mill Lane', city: 'Huddersfield', postcode: 'HD1 1AA' },
}

function branch(over: Record<string, unknown> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    about: 'A flagship dining room.',
    addressLine1: '12 High Street',
    addressLine2: '',
    city: 'Cambridge',
    postcode: 'CB2 1AB',
    latitude: 52.2,
    longitude: 0.1,
    ...over,
  } as unknown as Branch
}

const onClose = jest.fn()

beforeEach(() => {
  createMutateAsync.mockReset().mockResolvedValue({ id: 'edit1', status: 'PENDING' })
  apiFetch.mockReset()
  searchLocation.mockReset()
  onClose.mockReset()
  createPending = false
})

describe('BranchDetailsEditModal fields + reviewed warning', () => {
  it('renders all six text fields with the prototype labels + the reviewed-warning banner', () => {
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    expect(screen.getByLabelText(/branch name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/address line 1/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/address line 2/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/town or city/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/postcode/i)).toBeInTheDocument()
    expect(screen.getByText(/reviewed by redeemo/i)).toBeInTheDocument()
    expect(screen.getByText(/withdraw before/i)).toBeInTheDocument()
  })
})

describe('BranchDetailsEditModal submit (SENSITIVE subset only, no lat/lng)', () => {
  it('posts ONLY the sensitive fields and never lat/lng', async () => {
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'High Street Cafe' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    const { id, changes } = createMutateAsync.mock.calls[0][0]
    expect(id).toBe('b1')
    const keys = Object.keys(changes)
    // Body keys are a subset of the SENSITIVE fields.
    const allowed = ['name', 'about', 'addressLine1', 'addressLine2', 'city', 'postcode', 'logoUrl', 'bannerUrl']
    keys.forEach((k) => expect(allowed).toContain(k))
    // Crucially: NO lat/lng leak.
    expect(keys).not.toContain('latitude')
    expect(keys).not.toContain('longitude')
    expect(changes.name).toBe('High Street Cafe')
  })

  it('includes an uploaded logo/banner url in the submitted body', async () => {
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /upload a new logo/i }))
    fireEvent.click(screen.getByRole('button', { name: /upload a new banner/i }))
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    const { changes } = createMutateAsync.mock.calls[0][0]
    expect(changes.logoUrl).toBe('https://cdn/logo.png')
    expect(changes.bannerUrl).toBe('https://cdn/banner.png')
  })

  it('closes the modal on a successful submit', async () => {
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})

describe('BranchDetailsEditModal in-modal map placeholder (no network)', () => {
  it('renders a static map placeholder and makes no network call for it', () => {
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    expect(screen.getByTestId('edit-modal-map-placeholder')).toBeInTheDocument()
    expect(screen.getByText(/location on the map/i)).toBeInTheDocument()
    // No coordinates input is offered.
    expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument()
    // The static placeholder makes no API call.
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('BranchDetailsEditModal error UX (modal stays open, submit re-enables)', () => {
  it('PENDING_EDIT_EXISTS (409): inline notice + blocks a second submit', async () => {
    createMutateAsync.mockRejectedValue(new ApiError(409, { error: { code: 'PENDING_EDIT_EXISTS' } }))
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    await waitFor(() => expect(screen.getByText(/already in review/i)).toBeInTheDocument())
    // The modal stays open and the submit is disabled to prevent a second concurrent request.
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /send for review/i })).toBeDisabled()
  })

  it('POSTCODE_NOT_FOUND: inline alert under the postcode field, modal stays open, submit re-enabled', async () => {
    createMutateAsync.mockRejectedValue(new ApiError(400, { error: { code: 'POSTCODE_NOT_FOUND' } }))
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: 'ZZ9 9ZZ' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    await waitFor(() =>
      expect(screen.getByTestId('postcode-error')).toHaveTextContent(/could not find that postcode/i),
    )
    expect(screen.getByTestId('postcode-error')).toHaveAttribute('role', 'alert')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /send for review/i })).toBeEnabled()
  })

  it('GAZETTEER_UNAVAILABLE: modal-level alert, modal stays open, submit re-enabled', async () => {
    createMutateAsync.mockRejectedValue(new ApiError(503, { error: { code: 'GAZETTEER_UNAVAILABLE' } }))
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    await waitFor(() =>
      expect(screen.getByTestId('modal-error')).toHaveTextContent(/temporarily unavailable/i),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /send for review/i })).toBeEnabled()
  })
})

describe('BranchDetailsEditModal cancel', () => {
  it('closes without submitting', () => {
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(createMutateAsync).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('BranchDetailsEditModal PR-6 location lookup (reviewed lane)', () => {
  it('renders the lookup field and no map/pin/coordinate input', () => {
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    expect(screen.getByTestId('location-lookup')).toBeInTheDocument()
    expect(screen.queryByLabelText(/latitude|longitude/i)).not.toBeInTheDocument()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('autofills the address fields from a Google pick', async () => {
    searchLocation.mockResolvedValue([PICK_CANDIDATE])
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })
    fireEvent.click(await screen.findByTestId('location-lookup-result'))

    expect((screen.getByLabelText(/address line 1/i) as HTMLInputElement).value).toBe('12 Mill Lane')
    expect((screen.getByLabelText(/town or city/i) as HTMLInputElement).value).toBe('Huddersfield')
    expect((screen.getByLabelText(/postcode/i) as HTMLInputElement).value).toBe('HD1 1AA')
  })

  it('routes through the reviewed edit-request lane carrying the candidateToken (never lat/lng) on a LIVE branch', async () => {
    searchLocation.mockResolvedValue([PICK_CANDIDATE])
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })
    fireEvent.click(await screen.findByTestId('location-lookup-result'))
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))

    // The submit goes through createBranchEditRequest (the reviewed lane), NOT a direct PATCH.
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    const { id, changes } = createMutateAsync.mock.calls[0][0]
    expect(id).toBe('b1')
    expect(changes.candidateToken).toBe('tok_editmodal')
    // The autofilled address fields ride the reviewed lane.
    expect(changes.addressLine1).toBe('12 Mill Lane')
    expect(changes.postcode).toBe('HD1 1AA')
    // Never lat/lng/placeId.
    expect(changes).not.toHaveProperty('latitude')
    expect(changes).not.toHaveProperty('longitude')
    expect(changes).not.toHaveProperty('placeId')
  })

  it('drops the candidateToken when the merchant hand-edits an address field after a pick', async () => {
    searchLocation.mockResolvedValue([PICK_CANDIDATE])
    render(<BranchDetailsEditModal branch={branch()} onClose={onClose} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })
    fireEvent.click(await screen.findByTestId('location-lookup-result'))
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: 'HD2 2BB' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    const { changes } = createMutateAsync.mock.calls[0][0]
    expect(changes).not.toHaveProperty('candidateToken')
    // The hand-typed value still saves through the reviewed lane.
    expect(changes.postcode).toBe('HD2 2BB')
  })
})
