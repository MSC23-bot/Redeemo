// §DF device-QA Round 3 finding — Map initial camera cascade.
//
// Pre-fix the Map tab initialised at LONDON_REGION and only updated when
// the user tapped the locate-me button.  A Huddersfield user with GPS
// off would see London on the map and have to manually re-centre every
// time they opened the Map.  Previous P2 patch only fixed the locate-me
// BUTTON; initial-mount camera wasn't cascading.
//
// Owner-locked cascade (mirrors handleRecentre + Discovery behaviour):
//   1. GPS coords at mount   → animate to GPS coords.
//   2. No GPS but profile coords → animate to profile coords.
//   3. Neither                → stay on LONDON_REGION (no animate call).
//   4. Single-fire latch — subsequent profile updates after first
//      successful animate must NOT re-centre.

import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── react-native-maps mock ──────────────────────────────────────────────────
const mockAnimateToRegion = jest.fn()

jest.mock('react-native-maps', () => {
  const ReactLib = require('react')
  const { View } = require('react-native')
  const MockMapView = ReactLib.forwardRef((props: any, ref: any) => {
    ReactLib.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimateToRegion }))
    const { children, onRegionChangeComplete: _ignored, ...rest } = props
    return ReactLib.createElement(View, rest, children)
  })
  return {
    __esModule: true,
    default: MockMapView,
    Marker: (props: any) => ReactLib.createElement(View, props),
  }
})

// ─── Hook mocks ──────────────────────────────────────────────────────────────
type BBox = { minLat: number; maxLat: number; minLng: number; maxLng: number }

const mockState = {
  locationCoords: null as null | { lat: number; lng: number; area: string | null; city: string | null },
  meData:         null as null | {
    latitude?:  number | null
    longitude?: number | null
    [k: string]: unknown
  },
}

jest.mock('@/features/map/hooks/useInAreaBranches', () => ({
  useInAreaBranches: (_bbox: BBox | null, _params: Record<string, unknown> = {}, _enabled: boolean = true) => ({
    data:      undefined,
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: Record<string, unknown>, _enabled: boolean = true) => ({
    data:      undefined,
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [
      { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null, intentType: 'LOCAL' },
    ] },
  }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    location: mockState.locationCoords,
    status:   mockState.locationCoords ? 'granted' : 'denied',
    requestPermission: jest.fn(),
    coords:   mockState.locationCoords
      ? { lat: mockState.locationCoords.lat, lng: mockState.locationCoords.lng }
      : null,
    permission: 'undetermined',
    request:    jest.fn(),
    openSettings: jest.fn(),
  }),
}))

jest.mock('@/hooks/useMe', () => ({
  useMe: () => ({ data: mockState.meData, isLoading: false, isError: false }),
  meQueryKey: ['me'],
}))

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: () => ({ data: { amenities: [] }, isLoading: false }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}))

import { MapScreen } from '@/features/map/screens/MapScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('<MapScreen> initial camera cascade (§DF device-QA Round 3)', () => {
  beforeEach(() => {
    mockAnimateToRegion.mockClear()
    mockState.locationCoords = null
    mockState.meData = null
  })

  it('mount with GPS granted → initial region animates to GPS coords (not LONDON_REGION)', () => {
    mockState.locationCoords = { lat: 53.4808, lng: -2.2426, area: null, city: null } // Manchester
    render(<MapScreen />, { wrapper })
    // The initial-mount effect fires after the first render commits;
    // animateAndQuery should have been called with the GPS coords.
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1)
    const [region] = mockAnimateToRegion.mock.calls[0]!
    expect((region as any).latitude).toBeCloseTo(53.4808, 4)
    expect((region as any).longitude).toBeCloseTo(-2.2426, 4)
    // Defensive: must NOT be LONDON_REGION (lat 51.5074, lng -0.1278).
    expect((region as any).latitude).not.toBeCloseTo(51.5074, 4)
  })

  it('mount with no GPS but saved profile coords → animates to profile coords (not LONDON_REGION)', () => {
    mockState.locationCoords = null
    mockState.meData = { latitude: 53.6458, longitude: -1.785 } // Huddersfield
    render(<MapScreen />, { wrapper })
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1)
    const [region] = mockAnimateToRegion.mock.calls[0]!
    expect((region as any).latitude).toBeCloseTo(53.6458, 4)
    expect((region as any).longitude).toBeCloseTo(-1.785, 4)
    // Defensive: must NOT be LONDON_REGION.
    expect((region as any).latitude).not.toBeCloseTo(51.5074, 4)
  })

  it('mount with no GPS AND no profile coords → stays on LONDON_REGION (no animate call)', () => {
    mockState.locationCoords = null
    mockState.meData = { latitude: null, longitude: null }
    render(<MapScreen />, { wrapper })
    expect(mockAnimateToRegion).not.toHaveBeenCalled()
  })

  it('mount with no GPS AND no /profile data at all → stays on LONDON_REGION', () => {
    mockState.locationCoords = null
    mockState.meData = null
    render(<MapScreen />, { wrapper })
    expect(mockAnimateToRegion).not.toHaveBeenCalled()
  })

  // §DF device-QA Round 3 finding — single-fire latch.  Once the first
  // successful animate fires (GPS OR profile), subsequent profile updates
  // must NOT trigger another camera animation while the user might be
  // mid-pan.  Pre-fix a naive effect with profile as a dep would re-centre
  // on every refetch.
  it('initial centring fires ONCE per mount — subsequent profile lat/lng updates do NOT re-centre', () => {
    mockState.locationCoords = null
    mockState.meData = { latitude: 53.6458, longitude: -1.785 }
    const { rerender } = render(<MapScreen />, { wrapper })
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1)
    mockAnimateToRegion.mockClear()
    // Simulate a /profile refetch landing with the SAME coords.
    rerender(<MapScreen />)
    expect(mockAnimateToRegion).not.toHaveBeenCalled()
    // Simulate a /profile refetch landing with DIFFERENT coords (e.g. the
    // user updated their postcode in a separate surface).  The locked
    // single-fire latch prevents re-centring while they're mid-Map.
    mockState.meData = { latitude: 53.4808, longitude: -2.2426 }
    rerender(<MapScreen />)
    expect(mockAnimateToRegion).not.toHaveBeenCalled()
  })
})
