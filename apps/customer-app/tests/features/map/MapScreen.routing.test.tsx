// PR-3 Phase D — routing + Fold 3 contract pins.
//
// URL contract (plan §7.1): tap on a carousel card OR a list row →
//   router.push('/(app)/merchant/${merchantId}?branch=${branchId}&from=map')
// MerchantProfileScreen.onBack honours `from=map` by routing to
// /(app)/map (see resolveBackNavigation.test.ts for the helper pins).
//
// Fold 3 (plan §1.5): <MapView showsUserLocation> flips false whenever
// remoteCityName !== null (user is browsing a different city via
// <LocationSearch>). Dismissing <LocationBadge> restores it.

import React from 'react'
import { render, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { makeBranchTile } from '../../fixtures/branchTile'

// ─── Stable spies (hoisted module-level so jest.mock factories can read them) ─
let lastShowsUserLocation: boolean | undefined
let mockOnRegionChangeComplete: ((region: unknown) => void) | null = null

const mockPush = jest.fn()
const mockAnimateToRegion = jest.fn()

// MapBranchTile + MapListView captures — set on every render.
let capturedCarouselOnBranchPress: ((branchId: string) => void) | null = null
let capturedListOnBranchPress:     ((branchId: string) => void) | null = null

// SearchBar capture — needed because <LocationSearch> only mounts
// when MapScreen.showLocationSearch === true, which is driven by
// SearchBar.onChangeText with non-empty text.
let capturedSearchBarOnChangeText: ((text: string) => void) | null = null

// LocationSearch + LocationBadge captures.  `onCitySelect`'s
// signature matches `apps/customer-app/src/features/map/components/
// LocationSearch.tsx:78` — `(cityName, coords)` (two args).
let capturedLocationSearchOnCitySelect:
  | ((cityName: string, coords: { lat: number; lng: number }) => void) | null = null
let capturedLocationBadgeOnDismiss: (() => void) | null = null

// ─── react-native-maps mock ─ same shape as MapScreen.test.tsx but
//    also captures showsUserLocation per render so Fold 3 assertions
//    can read it.
jest.mock('react-native-maps', () => {
  const ReactLib = require('react')
  const { View } = require('react-native')
  const MockMapView = ReactLib.forwardRef((props: any, ref: any) => {
    mockOnRegionChangeComplete = props.onRegionChangeComplete ?? null
    lastShowsUserLocation      = props.showsUserLocation
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

// ─── MapPins mock — captures onPress so the carousel-mount gate
//    (selectedBranchId !== null && branches.length > 0) can be
//    activated in the carousel routing test by synthesising a pin tap.
let capturedMapPinsOnPress: ((branch: any) => void) | null = null
jest.mock('@/features/map/components/MapPins', () => ({
  __esModule: true,
  MapPins: (props: any) => {
    capturedMapPinsOnPress = props.onPress
    return null
  },
}))

// ─── MapBranchTile + MapListView mocks — capture onBranchPress so
//    tests can fire taps synthetically without driving the full
//    interaction chain.
jest.mock('@/features/map/components/MapBranchTile', () => ({
  __esModule: true,
  MapBranchTile: (props: any) => {
    capturedCarouselOnBranchPress = props.onBranchPress
    return null
  },
}))

jest.mock('@/features/map/components/MapListView', () => ({
  __esModule: true,
  MapListView: (props: any) => {
    capturedListOnBranchPress = props.onBranchPress
    return null
  },
}))

// SearchBar mock — captures onChangeText so the Fold 3 tests can
// simulate "user typed in the search box" → setShowLocationSearch(true)
// → <LocationSearch> mounts → its onCitySelect callback is captured.
jest.mock('@/features/search/components/SearchBar', () => ({
  __esModule: true,
  SearchBar: (props: any) => {
    capturedSearchBarOnChangeText = props.onChangeText
    return null
  },
}))

// ─── LocationSearch + LocationBadge mocks ─ capture handlers so
//    Fold 3 tests can drive remote-city state without keyboard input.
jest.mock('@/features/map/components/LocationSearch', () => ({
  __esModule: true,
  LocationSearch:    (props: any) => {
    capturedLocationSearchOnCitySelect = props.onCitySelect
    return null
  },
  UK_CITIES: [
    { name: 'London',     latitude: 51.5074, longitude: -0.1278 },
    { name: 'Manchester', latitude: 53.4808, longitude: -2.2426 },
  ],
}))

jest.mock('@/features/map/components/LocationBadge', () => ({
  __esModule: true,
  LocationBadge: (props: any) => {
    capturedLocationBadgeOnDismiss = props.onDismiss
    return null
  },
}))

// ─── Hook + router mocks (mirrors MapScreen.test.tsx) ────────────────────────

type BBox = { minLat: number; maxLat: number; minLng: number; maxLng: number }

const mockState = {
  inAreaData: null as null | {
    merchants: unknown[]
    branches?: unknown[]
    total:     number
    meta:      { resolvedArea: string; nearbyCount: number; cityCount: number; distantCount: number; emptyStateReason: 'none' | 'expanded_to_wider' | 'no_uk_supply' }
  },
  inAreaLoading:  false,
  inAreaFetching: false,
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
  useSearch: () => ({ data: undefined, isLoading: false, isFetching: false }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: { categories: [] } }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    location: { lat: 51.5074, lng: -0.1278 },
    status:   mockState.locationStatus,
    requestPermission: jest.fn(),
  }),
}))

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: () => ({ data: { amenities: [] }, isLoading: false }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}))

// Import after mocks are registered.
import { MapScreen } from '@/features/map/screens/MapScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  mockPush.mockReset()
  mockAnimateToRegion.mockReset()
  capturedMapPinsOnPress             = null
  capturedCarouselOnBranchPress      = null
  capturedListOnBranchPress          = null
  capturedSearchBarOnChangeText      = null
  capturedLocationSearchOnCitySelect = null
  capturedLocationBadgeOnDismiss     = null
  lastShowsUserLocation              = undefined
  mockOnRegionChangeComplete         = null
  mockState.inAreaData     = null
  mockState.inAreaLoading  = false
  mockState.inAreaFetching = false
  mockState.locationStatus = 'granted'
})

// ────────────────────────────────────────────────────────────────────────
// URL contract — carousel card tap.
//
// MapBranchTile fires onBranchPress(branchId) when a card is tapped.
// MapScreen.handleBranchNavigate resolves branch.id → branch.merchant.id
// and pushes the locked Phase D URL:
//   /(app)/merchant/${merchantId}?branch=${branchId}&from=map
// ────────────────────────────────────────────────────────────────────────

describe('PR-3 Phase D — carousel tap URL contract', () => {
  // Helper — activate the carousel by synthesising a pin tap on
  // <MapPins>, which sets selectedBranchId, which unlocks
  // <MapBranchTile>'s mount gate on the next render.
  function activateCarousel(
    rerender: (ui: React.ReactElement) => void,
    branch:   any,
  ) {
    expect(capturedMapPinsOnPress).toBeTruthy()
    act(() => { capturedMapPinsOnPress!(branch) })
    rerender(<MapScreen />)
    expect(capturedCarouselOnBranchPress).toBeTruthy()
  }

  it('routes to /(app)/merchant/${merchantId}?branch=${branchId}&from=map', () => {
    const covelumBrightlingsea = makeBranchTile({
      id:              'brn-covelum-bri',
      branchLatitude:  51.8054,
      branchLongitude: 1.0244,
      merchant:        { id: 'm-covelum', businessName: 'Covelum' },
    })
    mockState.inAreaData = {
      merchants: [],
      branches:  [covelumBrightlingsea],
      total:     1,
      meta:      { resolvedArea: 'London', nearbyCount: 0, cityCount: 0, distantCount: 1, emptyStateReason: 'none' },
    }

    const { rerender } = render(<MapScreen />, { wrapper })
    activateCarousel(rerender, covelumBrightlingsea)

    act(() => {
      capturedCarouselOnBranchPress!('brn-covelum-bri')
    })

    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/merchant/m-covelum?branch=brn-covelum-bri&from=map',
    )
  })

  it('multi-branch merchant: tap on each carousel card pushes that branch in the URL', () => {
    const brightlingsea = makeBranchTile({
      id:              'brn-covelum-bri',
      branchLatitude:  51.8054,
      branchLongitude: 1.0244,
      merchant:        { id: 'm-covelum', businessName: 'Covelum' },
    })
    const colchester = makeBranchTile({
      id:              'brn-covelum-col',
      branchLatitude:  51.8959,
      branchLongitude: 0.8919,
      merchant:        { id: 'm-covelum', businessName: 'Covelum' },
    })
    mockState.inAreaData = {
      merchants: [],
      branches:  [brightlingsea, colchester],
      total:     2,
      meta:      { resolvedArea: 'London', nearbyCount: 0, cityCount: 0, distantCount: 2, emptyStateReason: 'none' },
    }

    const { rerender } = render(<MapScreen />, { wrapper })
    activateCarousel(rerender, brightlingsea)

    act(() => { capturedCarouselOnBranchPress!('brn-covelum-bri') })
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/merchant/m-covelum?branch=brn-covelum-bri&from=map',
    )

    act(() => { capturedCarouselOnBranchPress!('brn-covelum-col') })
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/merchant/m-covelum?branch=brn-covelum-col&from=map',
    )
  })
})

// ────────────────────────────────────────────────────────────────────────
// URL contract — list row tap.
//
// MapListView fires onBranchPress(branchId) when a row is tapped. Same
// resolution + URL contract as the carousel.
// ────────────────────────────────────────────────────────────────────────

describe('PR-3 Phase D — list row tap URL contract', () => {
  it('routes to /(app)/merchant/${merchantId}?branch=${branchId}&from=map', () => {
    const brightlingsea = makeBranchTile({
      id:              'brn-covelum-bri',
      branchLatitude:  51.8054,
      branchLongitude: 1.0244,
      merchant:        { id: 'm-covelum', businessName: 'Covelum' },
    })
    mockState.inAreaData = {
      merchants: [],
      branches:  [brightlingsea],
      total:     1,
      meta:      { resolvedArea: 'London', nearbyCount: 0, cityCount: 0, distantCount: 1, emptyStateReason: 'none' },
    }

    render(<MapScreen />, { wrapper })
    expect(capturedListOnBranchPress).toBeTruthy()

    act(() => {
      capturedListOnBranchPress!('brn-covelum-bri')
    })

    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/merchant/m-covelum?branch=brn-covelum-bri&from=map',
    )
  })
})

// ────────────────────────────────────────────────────────────────────────
// Fold 3 — user-location dot suppression in remote browsing.
// ────────────────────────────────────────────────────────────────────────

describe('PR-3 Phase D — Fold 3 showsUserLocation', () => {
  // Helper — drives MapScreen into remote-browsing state by typing
  // into the SearchBar (mounts <LocationSearch>) then firing its
  // onCitySelect with the city payload.  Mirrors the production user
  // flow but bypasses keyboard input + UK_CITIES filtering.
  function enterRemoteCityMode(rerender: (ui: React.ReactElement) => void) {
    // Step 1 — simulate "user typed" so showLocationSearch flips true
    // and <LocationSearch> mounts (its onCitySelect is then captured).
    act(() => {
      capturedSearchBarOnChangeText!('manch')
    })
    rerender(<MapScreen />)
    expect(capturedLocationSearchOnCitySelect).toBeTruthy()
    // Step 2 — simulate city tap from the LocationSearch dropdown.
    act(() => {
      capturedLocationSearchOnCitySelect!('Manchester', { lat: 53.4808, lng: -2.2426 })
    })
    rerender(<MapScreen />)
  }

  it('normal mode (no remote city): <MapView showsUserLocation={true}>', () => {
    render(<MapScreen />, { wrapper })
    expect(lastShowsUserLocation).toBe(true)
  })

  it('remote browsing: tapping a city in <LocationSearch> hides the user-location dot', () => {
    const { rerender } = render(<MapScreen />, { wrapper })
    expect(lastShowsUserLocation).toBe(true)

    enterRemoteCityMode(rerender)

    expect(lastShowsUserLocation).toBe(false)
  })

  it('dismissing <LocationBadge> restores the user-location dot', () => {
    const { rerender } = render(<MapScreen />, { wrapper })

    enterRemoteCityMode(rerender)
    expect(lastShowsUserLocation).toBe(false)
    expect(capturedLocationBadgeOnDismiss).toBeTruthy()

    // Dismiss the badge.
    act(() => {
      capturedLocationBadgeOnDismiss!()
    })
    rerender(<MapScreen />)
    expect(lastShowsUserLocation).toBe(true)
  })

  it('Fold 3 is gated on locationStatus === "granted" too — dot stays hidden if permission is not granted', () => {
    mockState.locationStatus = 'denied'
    render(<MapScreen />, { wrapper })
    expect(lastShowsUserLocation).toBe(false)
  })
})
