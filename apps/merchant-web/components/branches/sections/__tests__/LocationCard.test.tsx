import { render, screen, fireEvent } from '@testing-library/react'
import { LocationCard } from '@/components/branches/sections/LocationCard'
import type { Branch } from '@/lib/api/branch'

// Branches PR-1 F9 + PR-6 (Layer 3): the Location card (prototype 03). It shows the
// formatted address, a confidence badge, a PURE HTML/CSS map placeholder with a
// centred pin SVG (ZERO network, NO map library, NO lat/lng shown), and (PR-6) an
// ACTIVE owner-gated "Update location" control that opens the reviewed edit modal
// carrying the business / address lookup. The card itself makes no network.
//
// Branch Location Trust Slice 3 (pin-drop addendum): the badge treats
// MANUALLY_CONFIRMED + ADDRESS_GEOCODED + MERCHANT_CONFIRMED as confirmed/green
// (fixing the pre-existing gap where ADDRESS_GEOCODED wrongly showed orange);
// MERCHANT_CONFIRMED gets the distinct "Merchant-set pin" label (never "verified").
// A new "Set your location pin" entry point (PinDropMap) is offered ONLY for
// POSTCODE_CENTROID / NEEDS_REVIEW branches (D-L5 no-downgrade mirror).

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

// PinDropMap pulls in useDropBranchPin + fetchBranchMapPreview network; stub it so
// LocationCard tests only assert the entry point mounts it, not its internals
// (covered by PinDropMap.test.tsx).
jest.mock('@/components/branches/PinDropMap', () => ({
  PinDropMap: ({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) => (
    <div data-testid="pin-drop-map-stub">
      <button type="button" onClick={onDone}>
        stub-done
      </button>
      <button type="button" onClick={onCancel}>
        stub-cancel
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
    expect(screen.getByText(/^location confirmed$/i)).toBeInTheDocument()
    expect(screen.queryByText(/awaiting location check/i)).not.toBeInTheDocument()
  })

  it('shows a green "Location confirmed" badge when ADDRESS_GEOCODED (fixes the pre-existing gap)', () => {
    render(<LocationCard branch={branch({ locationConfidence: 'ADDRESS_GEOCODED' })} canManage />)
    expect(screen.getByText(/^location confirmed$/i)).toBeInTheDocument()
    expect(screen.queryByText(/awaiting location check/i)).not.toBeInTheDocument()
  })

  it('shows a green "Merchant-set pin" badge when MERCHANT_CONFIRMED (never "verified")', () => {
    render(<LocationCard branch={branch({ locationConfidence: 'MERCHANT_CONFIRMED' })} canManage />)
    expect(screen.getByText(/merchant-set pin/i)).toBeInTheDocument()
    expect(screen.queryByText(/^location confirmed$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/awaiting location check/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument()
  })

  it('shows an orange "Awaiting location check" badge for POSTCODE_CENTROID / NEEDS_REVIEW / null', () => {
    for (const conf of ['POSTCODE_CENTROID', 'NEEDS_REVIEW', null] as const) {
      const { unmount } = render(<LocationCard branch={branch({ locationConfidence: conf })} canManage />)
      expect(screen.getByText(/awaiting location check/i)).toBeInTheDocument()
      expect(screen.queryByText(/^location confirmed$/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/merchant-set pin/i)).not.toBeInTheDocument()
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

  it('renders the static "worked out from the address" copy for a non-merchant-set pin', () => {
    render(<LocationCard branch={branch()} canManage />)
    expect(
      screen.getByText(/worked out from the address\. you did not enter coordinates\./i),
    ).toBeInTheDocument()
  })

  it('renders "you set this pin" copy for a MERCHANT_CONFIRMED branch', () => {
    render(<LocationCard branch={branch({ locationConfidence: 'MERCHANT_CONFIRMED' })} canManage />)
    expect(screen.getByText(/you set this pin on the map\./i)).toBeInTheDocument()
    expect(screen.queryByText(/worked out from the address/i)).not.toBeInTheDocument()
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

describe('LocationCard pin-drop entry point (Slice 3)', () => {
  it('shows "Set your location pin" for a POSTCODE_CENTROID branch when canManage', () => {
    render(<LocationCard branch={branch({ locationConfidence: 'POSTCODE_CENTROID' })} canManage />)
    expect(screen.getByTestId('pin-drop-entry-button')).toBeInTheDocument()
  })

  it('shows "Set your location pin" for a NEEDS_REVIEW branch when canManage', () => {
    render(<LocationCard branch={branch({ locationConfidence: 'NEEDS_REVIEW' })} canManage />)
    expect(screen.getByTestId('pin-drop-entry-button')).toBeInTheDocument()
  })

  it('does NOT show the pin-drop entry point for an already-confirmed branch (D-L5 no-downgrade)', () => {
    for (const conf of ['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED', 'MERCHANT_CONFIRMED'] as const) {
      const { unmount } = render(<LocationCard branch={branch({ locationConfidence: conf })} canManage />)
      expect(screen.queryByTestId('pin-drop-entry-button')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('does NOT show the pin-drop entry point for a non-owner (UX gate)', () => {
    render(<LocationCard branch={branch({ locationConfidence: 'POSTCODE_CENTROID' })} canManage={false} />)
    expect(screen.queryByTestId('pin-drop-entry-button')).not.toBeInTheDocument()
  })

  it('opens the pin-drop dialog (mounting PinDropMap) on click, and closes on done/cancel', () => {
    render(<LocationCard branch={branch({ locationConfidence: 'POSTCODE_CENTROID' })} canManage />)
    expect(screen.queryByTestId('pin-drop-map-stub')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pin-drop-entry-button'))
    expect(screen.getByTestId('pin-drop-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('pin-drop-map-stub')).toBeInTheDocument()

    fireEvent.click(screen.getByText('stub-done'))
    expect(screen.queryByTestId('pin-drop-dialog')).not.toBeInTheDocument()
  })
})
