// §DF PR #128 R1-1 — Map locate-me fallback behaviour.
//
// Owner-locked rule: when the user taps the locate-me button and GPS
// is unavailable, the camera falls back to the user's saved-postcode
// coordinates from /profile.  If neither GPS NOR saved-profile
// coordinates are available, the camera does NOT move — the existing
// "Location is off" UI (LocationPermission sheet / empty-area state)
// already prompts the user to enable location or set a postcode.
//
// Pre-fix behaviour fell through to LONDON_REGION unconditionally —
// device-QA Round 2 R1-1 finding.

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
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
  locationCoords: null as null | { lat: number; lng: number, area: string | null, city: string | null },
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

describe('<MapScreen> locate-me fallback (§DF PR #128 R1-1)', () => {
  beforeEach(() => {
    mockAnimateToRegion.mockClear()
    mockState.locationCoords = null
    mockState.meData = null
  })

  it('tap locate-me with GPS coords → animates to GPS coords', () => {
    mockState.locationCoords = { lat: 53.4808, lng: -2.2426, area: null, city: null } // Manchester
    const { getByLabelText } = render(<MapScreen />, { wrapper })
    mockAnimateToRegion.mockClear() // ignore any mount-time animations
    fireEvent.press(getByLabelText('Re-centre to my location'))
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1)
    const [region] = mockAnimateToRegion.mock.calls[0]!
    expect((region as any).latitude).toBeCloseTo(53.4808, 4)
    expect((region as any).longitude).toBeCloseTo(-2.2426, 4)
  })

  it('tap locate-me without GPS but WITH saved profile lat/lng → animates to profile coords', () => {
    mockState.locationCoords = null
    mockState.meData = { latitude: 53.6458, longitude: -1.785 } // Huddersfield
    const { getByLabelText } = render(<MapScreen />, { wrapper })
    mockAnimateToRegion.mockClear()
    fireEvent.press(getByLabelText('Re-centre to my location'))
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1)
    const [region] = mockAnimateToRegion.mock.calls[0]!
    expect((region as any).latitude).toBeCloseTo(53.6458, 4)
    expect((region as any).longitude).toBeCloseTo(-1.785, 4)
  })

  it('tap locate-me without GPS AND without profile lat/lng → does NOT animate camera', () => {
    mockState.locationCoords = null
    mockState.meData = { latitude: null, longitude: null } // saved profile with no postcode
    const { getByLabelText } = render(<MapScreen />, { wrapper })
    mockAnimateToRegion.mockClear()
    fireEvent.press(getByLabelText('Re-centre to my location'))
    expect(mockAnimateToRegion).not.toHaveBeenCalled()
  })

  it('tap locate-me without GPS AND without /profile data at all → does NOT animate camera', () => {
    mockState.locationCoords = null
    mockState.meData = null
    const { getByLabelText } = render(<MapScreen />, { wrapper })
    mockAnimateToRegion.mockClear()
    fireEvent.press(getByLabelText('Re-centre to my location'))
    expect(mockAnimateToRegion).not.toHaveBeenCalled()
  })
})
