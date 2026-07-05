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
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

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
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0][0].amenityIds).toEqual([])
  })

  it('shows a success toast after a save', async () => {
    render(<AmenitiesCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    const freeParking = await screen.findByRole('button', { name: /free parking/i })
    fireEvent.click(freeParking)
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    )
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
