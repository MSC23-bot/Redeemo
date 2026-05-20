// §BH — small RedeemoLoader overlay on Map during first-data fetch.
//
// Locked 2026-05-16. The loader should appear ONLY when
// `merchants.length === 0 && isFetching === true && !showLocationPermission
// && emptyVariant === null`. It must NOT appear:
//   - when previous pins are still visible (§AY placeholderData case)
//   - when MapEmptyArea is rendering (offshore / no_uk_supply / viewport_empty)
//   - when the LocationPermission overlay is up (the map is in onboarding mode)
// It must NOT block map interaction (`pointerEvents="none"` on the wrapper).

import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { makeMerchantTile } from '../../fixtures/merchantTile'

// ─── react-native-maps mock ──────────────────────────────────────────────────
jest.mock('react-native-maps', () => {
  const ReactLib = require('react')
  const { View } = require('react-native')
  const MockMapView = ReactLib.forwardRef((props: any, ref: any) => {
    ReactLib.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }))
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
  inAreaData:     null as null | { merchants: any[]; total: number; meta: any },
  inAreaLoading:  false,
  inAreaFetching: false,
  searchData:     null as null | { merchants: any[]; total: number; meta?: any },
  searchLoading:  false,
  searchFetching: false,
  locationStatus: 'granted' as 'idle' | 'loading' | 'granted' | 'denied',
}

jest.mock('@/features/map/hooks/useInAreaBranches', () => ({
  useInAreaBranches: (bbox: BBox | null, _params: any = {}, enabled: boolean = true) => {
    const active = enabled && bbox !== null
    return {
      data:       active ? mockState.inAreaData : undefined,
      isLoading:  active ? mockState.inAreaLoading : false,
      isFetching: active ? mockState.inAreaFetching : false,
    }
  },
}))

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean = true) => ({
    data:       enabled ? mockState.searchData : undefined,
    isLoading:  enabled ? mockState.searchLoading : false,
    isFetching: enabled ? mockState.searchFetching : false,
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
    location: null,
    status:   mockState.locationStatus,
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

const LOADER_ACCESSIBILITY_LABEL = 'Loading nearby merchants'

const mockTile = makeMerchantTile({
  id: 'm1', businessName: 'Sample',
  primaryCategory: { id: 'c1', name: 'Food', pinColour: null, pinIcon: null },
  latitude: 51.5074, longitude: -0.1278,
})

describe('MapScreen — §BH first-fetch loader', () => {
  beforeEach(() => {
    mockState.inAreaData     = null
    mockState.inAreaLoading  = false
    mockState.inAreaFetching = false
    mockState.searchData     = null
    mockState.searchLoading  = false
    mockState.searchFetching = false
    mockState.locationStatus = 'granted'
  })

  it('shows the loader when merchants empty AND fetching (first-data fetch)', () => {
    mockState.inAreaData     = null
    mockState.inAreaLoading  = true
    mockState.inAreaFetching = true
    const { queryByLabelText } = render(<MapScreen />, { wrapper })
    expect(queryByLabelText(LOADER_ACCESSIBILITY_LABEL)).toBeTruthy()
  })

  it('does NOT show the loader when merchants are already present during refetch (§AY case)', () => {
    // Refetch in progress, but previous viewport's merchants are
    // still on screen via placeholderData → no loader.
    mockState.inAreaData = {
      merchants: [mockTile],
      total: 1,
      meta: { resolvedArea: 'Test', nearbyCount: 1, cityCount: 0, distantCount: 0, emptyStateReason: 'none' },
    }
    mockState.inAreaLoading  = false
    mockState.inAreaFetching = true
    const { queryByLabelText } = render(<MapScreen />, { wrapper })
    expect(queryByLabelText(LOADER_ACCESSIBILITY_LABEL)).toBeNull()
  })

  it('does NOT show the loader when no merchants AND not fetching (truly idle, e.g. offshore steady state)', () => {
    mockState.inAreaData     = null
    mockState.inAreaLoading  = false
    mockState.inAreaFetching = false
    const { queryByLabelText } = render(<MapScreen />, { wrapper })
    expect(queryByLabelText(LOADER_ACCESSIBILITY_LABEL)).toBeNull()
  })

  it('does NOT show the loader when MapEmptyArea / no_uk_supply is rendering', () => {
    // emptyVariant resolves to 'no_uk_supply' when merchants empty + not
    // loading + meta says no_uk_supply. Loader must yield to that.
    mockState.inAreaData = {
      merchants: [],
      total: 0,
      meta: { resolvedArea: 'Test', nearbyCount: 0, cityCount: 0, distantCount: 0, emptyStateReason: 'no_uk_supply' },
    }
    mockState.inAreaLoading  = false
    mockState.inAreaFetching = false
    const { queryByLabelText } = render(<MapScreen />, { wrapper })
    expect(queryByLabelText(LOADER_ACCESSIBILITY_LABEL)).toBeNull()
  })

  it('does NOT show the loader when LocationPermission overlay is up', () => {
    // status='idle' triggers the permission overlay. Even if fetching,
    // the loader must yield — the user is in the onboarding gate.
    mockState.locationStatus = 'idle'
    mockState.inAreaData     = null
    mockState.inAreaLoading  = true
    mockState.inAreaFetching = true
    const { queryByLabelText } = render(<MapScreen />, { wrapper })
    expect(queryByLabelText(LOADER_ACCESSIBILITY_LABEL)).toBeNull()
  })
})
