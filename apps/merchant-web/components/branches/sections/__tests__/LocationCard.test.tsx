import { render, screen, fireEvent } from '@testing-library/react'
import { LocationCard } from '@/components/branches/sections/LocationCard'
import type { Branch } from '@/lib/api/branch'

// Branches PR-1 F9 + PR-6 (Layer 3): the Location card (prototype 03). It shows the
// formatted address, a confidence badge (MANUALLY_CONFIRMED -> green "Location
// confirmed"; otherwise orange "Awaiting location check"), a PURE HTML/CSS map
// placeholder with a centred pin SVG (ZERO network, NO map library, NO lat/lng shown),
// the prototype copy "Worked out from the address. You did not enter coordinates.",
// and (PR-6) an ACTIVE owner-gated "Update location" control that opens the reviewed
// edit modal carrying the business / address lookup. The card itself makes no network.

// The reviewed-edit modal is mounted by the active control. Stub it so opening it does
// not pull in the real edit-request hook / file-upload network; we only assert it
// mounts on click.
jest.mock('@/components/branches/BranchDetailsEditModal', () => ({
  BranchDetailsEditModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="branch-details-edit-modal">
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}))

// Spy: the card itself makes no network at all (fetch / the transport).
const apiFetch = jest.fn()
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual('@/lib/api/client')
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) }
})

function branch(over: Record<string, unknown> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    addressLine1: '12 High Street',
    city: 'Cambridge',
    postcode: 'CB2 1AB',
    latitude: 52.2053,
    longitude: 0.1218,
    locationConfidence: 'MANUALLY_CONFIRMED',
    isActive: true,
    ...over,
  } as Branch
}

beforeEach(() => {
  apiFetch.mockReset()
  // Stub global fetch so we can prove the card never reaches the network (e.g. a map tile).
  global.fetch = jest.fn() as unknown as typeof fetch
})

describe('LocationCard confidence badge', () => {
  it('shows a green "Location confirmed" badge when MANUALLY_CONFIRMED', () => {
    render(<LocationCard branch={branch({ locationConfidence: 'MANUALLY_CONFIRMED' })} canManage />)
    expect(screen.getByText(/location confirmed/i)).toBeInTheDocument()
    expect(screen.queryByText(/awaiting location check/i)).not.toBeInTheDocument()
  })

  it('shows an orange "Awaiting location check" badge for any other confidence', () => {
    for (const conf of ['ADDRESS_GEOCODED', 'POSTCODE_CENTROID', 'NEEDS_REVIEW'] as const) {
      const { unmount } = render(<LocationCard branch={branch({ locationConfidence: conf })} canManage />)
      expect(screen.getByText(/awaiting location check/i)).toBeInTheDocument()
      expect(screen.queryByText(/^location confirmed$/i)).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('LocationCard privacy + no-network', () => {
  it('renders the formatted address', () => {
    render(<LocationCard branch={branch()} canManage />)
    expect(screen.getByText(/12 High Street/)).toBeInTheDocument()
  })

  it('never renders the lat/lng coordinates', () => {
    render(<LocationCard branch={branch({ latitude: 52.2053, longitude: 0.1218 })} canManage />)
    expect(screen.queryByText(/52\.2053/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0\.1218/)).not.toBeInTheDocument()
  })

  it('makes no network call (no apiFetch, no fetch / Google call)', () => {
    render(<LocationCard branch={branch()} canManage />)
    expect(apiFetch).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('renders the static "worked out from the address" copy', () => {
    render(<LocationCard branch={branch()} canManage />)
    expect(
      screen.getByText(/worked out from the address\. you did not enter coordinates\./i),
    ).toBeInTheDocument()
  })
})

describe('LocationCard active update-location affordance (PR-6)', () => {
  it('shows an ACTIVE (enabled) "Update location" control for the owner', () => {
    render(<LocationCard branch={branch()} canManage />)
    const btn = screen.getByTestId('location-update-button')
    expect(btn).toBeEnabled()
    // The card itself fires no network on render.
    expect(apiFetch).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('opens the reviewed edit modal (which carries the lookup) on click', () => {
    render(<LocationCard branch={branch()} canManage />)
    expect(screen.queryByTestId('branch-details-edit-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('location-update-button'))
    expect(screen.getByTestId('branch-details-edit-modal')).toBeInTheDocument()
  })

  it('does NOT show the control for a non-owner (UX gate; the backend is the boundary)', () => {
    render(<LocationCard branch={branch()} canManage={false} />)
    expect(screen.queryByTestId('location-update-button')).not.toBeInTheDocument()
  })

  it('disables the control when an identity edit is already in review', () => {
    const b = branch({
      pendingEdits: [{ id: 'e1', status: 'PENDING', includesPhotos: false }],
    })
    render(<LocationCard branch={b} canManage />)
    expect(screen.getByTestId('location-update-button')).toBeDisabled()
  })
})
