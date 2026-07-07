import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AmenitiesCard } from '@/components/branches/sections/AmenitiesCard'
import type { Branch } from '@/lib/api/branch'

// Branches PR-1 F5: the owner-only Amenities card (prototype 04). The catalogue is
// fetched LAZILY from the OPEN customer endpoint keyed by the merchant's
// primaryCategoryId, ONLY when an owner opens edit mode (never on view/mount, and
// never for a non-owner). The current selection is read from
// branch.amenities[].amenity.id; saving does a full-replace POST. A non-owner is
// read-only. When the merchant has no primaryCategoryId the card shows the current
// amenities read-only with a note and NO edit control, and never fetches.

// --- catalogue read (lib/api/branch.getBranchAmenities) ---------------------
const getBranchAmenities = jest.fn()
jest.mock('@/lib/api/branch', () => ({
  getBranchAmenities: (catId: string) => getBranchAmenities(catId),
}))

// --- the F5 mutation hook ---------------------------------------------------
const mutateAsync = jest.fn()
let isPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useSetAmenities: () => ({ mutateAsync, isPending }),
}))

// --- merchant profile (primaryCategoryId source) ----------------------------
let mockProfile: { data?: { primaryCategoryId: string | null } | undefined }
jest.mock('@/lib/auth/useMerchantProfile', () => ({
  useMerchantProfile: () => mockProfile,
}))

// --- toast ------------------------------------------------------------------
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

const CATALOGUE = [
  { id: 'a1', name: 'Outdoor Seating' },
  { id: 'a2', name: 'Free Parking' },
  { id: 'a3', name: 'Family-Friendly' },
  { id: 'a4', name: 'Wheelchair Access' },
  { id: 'a5', name: 'Wi-Fi' },
]

function branch(over: Partial<Branch> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    amenities: [{ amenity: { id: 'a1', name: 'Outdoor Seating' } }],
    ...over,
  } as Branch
}

beforeEach(() => {
  getBranchAmenities.mockReset().mockResolvedValue(CATALOGUE)
  mutateAsync.mockReset().mockResolvedValue({})
  toast.mockReset()
  isPending = false
  mockProfile = { data: { primaryCategoryId: 'cat-1' } }
})

describe('AmenitiesCard catalogue + owner gating', () => {
  it('does NOT fetch the catalogue on mount (owner, view mode) but DOES once Edit opens, keyed by primaryCategoryId', async () => {
    render(<AmenitiesCard branch={branch()} canManage />)
    // Lazy: nothing requested while the owner is just viewing the card.
    expect(getBranchAmenities).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    await waitFor(() => expect(getBranchAmenities).toHaveBeenCalledWith('cat-1'))
  })

  it('shows current selected amenities read-only for a non-owner with NO Edit control and NO catalogue fetch', async () => {
    render(<AmenitiesCard branch={branch()} canManage={false} />)
    expect(screen.getByText('Outdoor Seating')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    // A read-only viewer must never hit the customer amenity endpoint.
    await waitFor(() => expect(getBranchAmenities).not.toHaveBeenCalled())
  })

  it('shows an Edit control for an owner', () => {
    render(<AmenitiesCard branch={branch()} canManage />)
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
    expect(getBranchAmenities).not.toHaveBeenCalled()
  })

  it('renders the "Saves instantly" hint', () => {
    render(<AmenitiesCard branch={branch()} canManage />)
    expect(screen.getByText(/saves instantly/i)).toBeInTheDocument()
  })
})

describe('AmenitiesCard toggle + save', () => {
  it('owner toggle then save POSTs the FULL amenityIds list', async () => {
    render(<AmenitiesCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    // Catalogue chips appear once loaded; toggle Free Parking ON (a1 already on).
    const freeParking = await screen.findByRole('button', { name: /free parking/i })
    fireEvent.click(freeParking)
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const arg = mutateAsync.mock.calls[0][0]
    expect(arg.id).toBe('b1')
    expect([...arg.amenityIds].sort()).toEqual(['a1', 'a2'])
  })

  it('toggling an already-selected amenity off removes it from the full list', async () => {
    render(<AmenitiesCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    const outdoor = await screen.findByRole('button', { name: /outdoor seating/i })
    fireEvent.click(outdoor) // turn a1 off
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0][0].amenityIds).toEqual([])
  })

  it('shows a success toast after a save', async () => {
    render(<AmenitiesCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    const freeParking = await screen.findByRole('button', { name: /free parking/i })
    fireEvent.click(freeParking)
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    )
  })
})

// Fidelity polish (2026-07-07 audit): Edit opens a real Dialog (was inline chip
// toggling in the card body), matching prototype branches-2 - own header + close,
// a "this saves straight away" banner - and each amenity renders its OWN iconUrl,
// falling back to the generic Check only when an amenity has no iconUrl.
describe('AmenitiesCard edit dialog + per-amenity icons', () => {
  it('opens a Dialog (not an inline toggle list) with its own header + close + saves-straight-away banner', async () => {
    render(<AmenitiesCard branch={branch()} canManage />)
    expect(screen.queryByTestId('edit-amenities-dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    const dialog = screen.getByTestId('edit-amenities-dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /edit amenities/i })).toBeInTheDocument()
    expect(screen.getByText(/this saves straight away/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('closes the dialog via Cancel and via the Close button', async () => {
    render(<AmenitiesCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await screen.findByRole('button', { name: /free parking/i })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByTestId('edit-amenities-dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByTestId('edit-amenities-dialog')).not.toBeInTheDocument()
  })

  it('renders an amenity\'s own iconUrl in the view-mode selected chip', () => {
    render(
      <AmenitiesCard
        branch={branch({
          amenities: [{ amenity: { id: 'a1', name: 'Outdoor Seating', iconUrl: 'https://icons.example.com/chair.svg' } }],
        })}
        canManage
      />,
    )
    const chip = screen.getByText('Outdoor Seating').closest('span') as HTMLElement
    const img = chip.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://icons.example.com/chair.svg')
  })

  it('falls back to the generic Check icon when an amenity has no iconUrl', () => {
    render(<AmenitiesCard branch={branch()} canManage />)
    const chip = screen.getByText('Outdoor Seating').closest('span') as HTMLElement
    expect(chip.querySelector('img')).not.toBeInTheDocument()
    expect(chip.querySelector('svg')).toBeInTheDocument()
  })

  it('renders each catalogue chip\'s own iconUrl in the edit dialog', async () => {
    getBranchAmenities.mockResolvedValue([
      { id: 'a1', name: 'Outdoor Seating', iconUrl: 'https://icons.example.com/chair.svg' },
      { id: 'a2', name: 'Free Parking', iconUrl: null },
    ])
    render(<AmenitiesCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    const outdoorButton = await screen.findByRole('button', { name: /outdoor seating/i })
    expect(outdoorButton.querySelector('img')).toHaveAttribute('src', 'https://icons.example.com/chair.svg')
    const freeParkingButton = screen.getByRole('button', { name: /free parking/i })
    expect(freeParkingButton.querySelector('img')).not.toBeInTheDocument()
  })

  // Consistency hardening (Codex, optional): the dialog must not be dismissable
  // while the "saves straight away" request is in flight (matches the change-password
  // modal pattern). Escape, scrim-click, and the X must all no-op while pending; X +
  // Cancel are disabled. The save's own success path still closes the dialog normally
  // (covered by the toggle+save tests above).
  it('does NOT dismiss via Escape, scrim, or X while a save is in flight, and disables Cancel + X', async () => {
    isPending = true // the busy ref reads this live: requestClose must no-op.
    render(<AmenitiesCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await screen.findByRole('button', { name: /free parking/i })

    // Both dismiss controls are disabled while the save is pending.
    expect(screen.getByRole('button', { name: /close/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()

    // Escape on the dialog wrapper does not dismiss.
    fireEvent.keyDown(screen.getByTestId('edit-amenities-dialog'), { key: 'Escape' })
    expect(screen.getByTestId('edit-amenities-dialog')).toBeInTheDocument()

    // Scrim click does not dismiss.
    fireEvent.click(screen.getByTestId('edit-amenities-scrim'))
    expect(screen.getByTestId('edit-amenities-dialog')).toBeInTheDocument()

    // Clicking the X does not dismiss.
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByTestId('edit-amenities-dialog')).toBeInTheDocument()
  })
})

describe('AmenitiesCard missing-category fallback', () => {
  it('renders current amenities read-only + a note + no edit, and does NOT fetch the catalogue', async () => {
    mockProfile = { data: { primaryCategoryId: null } }
    render(<AmenitiesCard branch={branch()} canManage />)
    expect(screen.getByText('Outdoor Seating')).toBeInTheDocument()
    expect(
      screen.getByText(/amenity editing is unavailable until your business category is set/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    // No crash and crucially no catalogue request.
    await waitFor(() => expect(getBranchAmenities).not.toHaveBeenCalled())
  })

  it('does not crash when the merchant profile is still loading (undefined data)', () => {
    mockProfile = { data: undefined }
    expect(() => render(<AmenitiesCard branch={branch()} canManage />)).not.toThrow()
    expect(getBranchAmenities).not.toHaveBeenCalled()
  })
})

describe('AmenitiesCard catalogue error', () => {
  it('surfaces a catalogue load failure via role=alert without crashing', async () => {
    getBranchAmenities.mockRejectedValue(new Error('down'))
    render(<AmenitiesCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
