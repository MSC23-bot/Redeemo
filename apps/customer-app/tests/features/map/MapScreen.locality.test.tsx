// Plan 4 M3b follow-up — MapScreen renders the viewport locality badge
// when meta.effectiveLocality is present and suppression rules allow.

import React from 'react'
import { render, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { makeMerchantTile } from '../../fixtures/merchantTile'

// ─── react-native-maps mock ──────────────────────────────────────────────────
let mockOnRegionChangeComplete: ((region: unknown) => void) | null = null
const mockAnimateToRegion = jest.fn()

jest.mock('react-native-maps', () => {
  const ReactLib = require('react')
  const { View } = require('react-native')
  const MockMapView = ReactLib.forwardRef((props: any, ref: any) => {
    mockOnRegionChangeComplete = props.onRegionChangeComplete ?? null
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

const mockTile = makeMerchantTile({
  id: 'm1', businessName: 'Bella',
  primaryCategory: { id: 'c1', name: 'Food', pinColour: null, pinIcon: null },
  voucherCount: 1, maxEstimatedSaving: 5, distance: 600, nearestBranchId: 'b1',
})

const inAreaBaseMeta = {
  resolvedArea:     'Huddersfield',
  nearbyCount:      1,
  cityCount:        0,
  distantCount:     0,
  emptyStateReason: 'none' as const,
}

const mockState = {
  effectiveLocality: null as null | { id: string; name: string },
  locationStatus: 'granted' as 'idle' | 'loading' | 'granted' | 'denied',
}

// PR-3 Phase D — `mockBranch` mirrors `mockTile` so the inAreaData
// envelope is production-coherent (both arrays populated when the
// viewport has supply). MapScreen now gates empty-state + §BH loader
// on `branches.length`.
const { makeBranchTile } = require('../../fixtures/branchTile')
const mockBranch = makeBranchTile({
  id: 'brn1', branchLatitude: 51.5, branchLongitude: -0.1,
  merchant: { id: 'm1', businessName: 'Test' },
})

jest.mock('@/features/map/hooks/useInAreaBranches', () => ({
  useInAreaBranches: (bbox: BBox | null, _params: any, enabled = true) => {
    if (!enabled || bbox === null) return { data: undefined, isLoading: false }
    return {
      data: {
        merchants: [mockTile],
        branches:  [mockBranch],
        total: 1,
        meta: {
          ...inAreaBaseMeta,
          ...(mockState.effectiveLocality !== null
            ? { effectiveLocality: mockState.effectiveLocality }
            : {}),
        },
      },
      isLoading: false,
    }
  },
}))

jest.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({ data: undefined, isLoading: false }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: {
      categories: [
        { id: 'c1', name: 'Food', iconUrl: null, pinColour: null, pinIcon: null, parentId: null, intentType: 'LOCAL' },
      ],
    },
  }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    location: { lat: 53.6458, lng: -1.785, area: null, city: null },
    status: mockState.locationStatus,
    requestPermission: jest.fn(),
  }),
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

describe('MapScreen — viewport locality badge (Plan 4 M3b)', () => {
  beforeEach(() => {
    mockState.effectiveLocality = null
    mockState.locationStatus = 'granted'
    mockOnRegionChangeComplete = null
    mockAnimateToRegion.mockClear()
  })

  it('renders "Map centred near {name}" when meta.effectiveLocality is present', () => {
    mockState.effectiveLocality = { id: 'loc-hud', name: 'Huddersfield' }
    const { getByText } = render(<MapScreen />, { wrapper })
    expect(getByText('Map centred near Huddersfield')).toBeTruthy()
  })

  it('hides the badge when meta.effectiveLocality is absent', () => {
    mockState.effectiveLocality = null
    const { queryByText } = render(<MapScreen />, { wrapper })
    expect(queryByText(/Map centred near/)).toBeNull()
  })

  it('suppresses the badge while the LocationPermission overlay is showing', () => {
    mockState.effectiveLocality = { id: 'loc-hud', name: 'Huddersfield' }
    mockState.locationStatus = 'idle' // triggers the permission overlay
    const { queryByText } = render(<MapScreen />, { wrapper })
    expect(queryByText(/Map centred near/)).toBeNull()
  })

  it('suppresses the badge when the camera pans offshore', () => {
    mockState.effectiveLocality = { id: 'loc-hud', name: 'Huddersfield' }
    const { getByText, queryByText } = render(<MapScreen />, { wrapper })
    // confirm it's visible at the seeded UK region first
    expect(getByText('Map centred near Huddersfield')).toBeTruthy()

    // Pan offshore (north Atlantic)
    expect(mockOnRegionChangeComplete).not.toBeNull()
    act(() => {
      mockOnRegionChangeComplete!({
        latitude: 30, longitude: -40, latitudeDelta: 0.5, longitudeDelta: 0.5,
      })
    })
    expect(queryByText(/Map centred near/)).toBeNull()
  })
})
