import { render, screen } from '@testing-library/react'
import { LocationCard } from '@/components/branches/sections/LocationCard'
import type { Branch } from '@/lib/api/branch'

// Branches PR-1 F9: the read-only Location card (prototype 03). It shows the formatted
// address, a confidence badge (MANUALLY_CONFIRMED -> green "Location confirmed";
// otherwise orange "Awaiting location check"), a PURE HTML/CSS map placeholder with a
// centred pin SVG (ZERO network, NO map library, NO lat/lng shown), the prototype copy
// "Worked out from the address. You did not enter coordinates.", and a DISABLED locked
// "Update location" affordance (PR-6). Read-only for everyone.

// Spy: any network at all (fetch / the transport) is a failure for this card.
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
    render(<LocationCard branch={branch({ locationConfidence: 'MANUALLY_CONFIRMED' })} isOwner />)
    expect(screen.getByText(/location confirmed/i)).toBeInTheDocument()
    expect(screen.queryByText(/awaiting location check/i)).not.toBeInTheDocument()
  })

  it('shows an orange "Awaiting location check" badge for any other confidence', () => {
    for (const conf of ['ADDRESS_GEOCODED', 'POSTCODE_CENTROID', 'NEEDS_REVIEW'] as const) {
      const { unmount } = render(<LocationCard branch={branch({ locationConfidence: conf })} isOwner />)
      expect(screen.getByText(/awaiting location check/i)).toBeInTheDocument()
      expect(screen.queryByText(/^location confirmed$/i)).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('LocationCard privacy + no-network', () => {
  it('renders the formatted address', () => {
    render(<LocationCard branch={branch()} isOwner />)
    expect(screen.getByText(/12 High Street/)).toBeInTheDocument()
  })

  it('never renders the lat/lng coordinates', () => {
    render(<LocationCard branch={branch({ latitude: 52.2053, longitude: 0.1218 })} isOwner />)
    expect(screen.queryByText(/52\.2053/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0\.1218/)).not.toBeInTheDocument()
  })

  it('makes no network call (no apiFetch, no fetch / Google call)', () => {
    render(<LocationCard branch={branch()} isOwner />)
    expect(apiFetch).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('renders the static "worked out from the address" copy', () => {
    render(<LocationCard branch={branch()} isOwner />)
    expect(
      screen.getByText(/worked out from the address\. you did not enter coordinates\./i),
    ).toBeInTheDocument()
  })
})

describe('LocationCard locked update-location affordance', () => {
  it('shows the locked "Update location" affordance disabled and fires no network', () => {
    render(<LocationCard branch={branch()} isOwner />)
    const btn = screen.getByRole('button', { name: /update location/i })
    expect(btn).toBeDisabled()
    expect(apiFetch).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
