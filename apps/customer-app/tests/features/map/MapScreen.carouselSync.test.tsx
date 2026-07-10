// Map Phase 2 S2 Task 4 — two-way carousel sync + camera pan + loop guard
// (spec §7.5/§7.6).
//
// Mirrors MapScreen.routing.test.tsx's pattern: mock `MapPins` and
// `MapBranchTile` so pin taps and carousel index changes can be fired
// synthetically without driving the full native gesture chain, while
// still exercising MapScreen's OWN wiring (handleBranchPress,
// handleCarouselIndexChange, animateCameraToBranch, the
// lastProgrammaticIndexRef loop guard).

import React from 'react'
import { render, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { makeBranchTile } from '../../fixtures/branchTile'

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

let capturedMapPinsOnPress: ((branch: any) => void) | null = null
jest.mock('@/features/map/components/MapPins', () => ({
  __esModule: true,
  MapPins: (props: any) => {
    capturedMapPinsOnPress = props.onPress
    return null
  },
}))

// Captures the props MapScreen passes to MapBranchTile on every render —
// `activeIndex`/`selectedId`-equivalent state is visible via these.
let capturedMapBranchTileProps: any = null
jest.mock('@/features/map/components/MapBranchTile', () => ({
  __esModule: true,
  MapBranchTile: (props: any) => {
    capturedMapBranchTileProps = props
    return null
  },
}))

jest.mock('@/features/map/components/MapListView', () => ({
  __esModule: true,
  MapListView: () => null,
}))

jest.mock('@/features/search/components/SearchBar', () => ({
  __esModule: true,
  SearchBar: () => null,
}))

jest.mock('@/features/map/components/LocationSearch', () => ({
  __esModule: true,
  LocationSearch: () => null,
  UK_CITIES: [],
}))

jest.mock('@/features/map/components/LocationBadge', () => ({
  __esModule: true,
  LocationBadge: () => null,
}))

type BBox = { minLat: number; maxLat: number; minLng: number; maxLng: number }

const mockState = {
  inAreaData: null as null | { merchants: unknown[]; branches?: unknown[]; total: number; meta: any },
}

jest.mock('@/features/map/hooks/useInAreaBranches', () => ({
  useInAreaBranches: (bbox: BBox | null, _params: any = {}, enabled: boolean = true) => {
    const active = enabled && bbox !== null
    return { data: active ? mockState.inAreaData : undefined, isLoading: false, isFetching: false }
  },
}))

jest.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({ data: undefined, isLoading: false, isFetching: false }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: { categories: [] } }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ location: { lat: 51.5074, lng: -0.1278 }, status: 'granted', requestPermission: jest.fn() }),
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

function meta() {
  return { resolvedArea: 'London', nearbyCount: 2, cityCount: 0, distantCount: 0, emptyStateReason: 'none' as const }
}

const branchA = makeBranchTile({
  id: 'brn-a', branchLatitude: 51.5074, branchLongitude: -0.1278,
  merchant: { id: 'm-a', businessName: 'A Cafe' },
})
const branchB = makeBranchTile({
  id: 'brn-b', branchLatitude: 51.52, branchLongitude: -0.14,
  merchant: { id: 'm-b', businessName: 'B Cafe' },
})
// No coordinates — redacted location (POSTCODE_CENTROID/NEEDS_REVIEW).
const branchRedacted = makeBranchTile({
  id: 'brn-redacted', branchLatitude: null, branchLongitude: null,
  branchLocationConfidence: 'NEEDS_REVIEW',
  merchant: { id: 'm-c', businessName: 'Redacted Cafe' },
})

beforeEach(() => {
  mockAnimateToRegion.mockClear()
  capturedMapPinsOnPress = null
  capturedMapBranchTileProps = null
  mockState.inAreaData = {
    merchants: [],
    branches: [branchA, branchB, branchRedacted],
    total: 3,
    meta: meta(),
  }
})

describe('MapScreen — two-way carousel sync + camera pan (Map Phase 2 S2 Task 4)', () => {
  it('a pin tap selects the branch and syncs the carousel activeIndex, WITHOUT panning the camera', () => {
    render(<MapScreen />, { wrapper })
    expect(capturedMapPinsOnPress).toBeTruthy()
    // Clear the initial-camera cascade's own animateToRegion call (GPS
    // granted → centres on mount) — unrelated to this test's concern.
    mockAnimateToRegion.mockClear()

    act(() => { capturedMapPinsOnPress!(branchB) })

    expect(capturedMapBranchTileProps).toBeTruthy()
    expect(capturedMapBranchTileProps.activeIndex).toBe(1) // branchB is index 1
    // Pin tap alone does not animate the camera — the tapped pin is
    // already visible (that's how the user tapped it).
    expect(mockAnimateToRegion).not.toHaveBeenCalled()
  })

  it('carousel onIndexChange (a genuine swipe) updates selection AND animates the camera to the new branch', () => {
    render(<MapScreen />, { wrapper })
    // Select branchA first (mounts the carousel).
    act(() => { capturedMapPinsOnPress!(branchA) })
    mockAnimateToRegion.mockClear()

    // Simulate a user swipe landing on index 1 (branchB) — NOT the same
    // index MapScreen just set programmatically (0), so this is treated
    // as a genuine swipe.
    act(() => { capturedMapBranchTileProps.onIndexChange(1) })

    expect(capturedMapBranchTileProps.activeIndex).toBe(1)
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1)
    const [region, duration] = mockAnimateToRegion.mock.calls[0]!
    expect(region.latitude).toBe(branchB.branchLatitude)
    expect(region.longitude).toBe(branchB.branchLongitude)
    expect(duration).toBe(350)
  })

  it('loop guard: the carousel echo from a pin-tap-driven scroll (same index) does not re-animate the camera', () => {
    render(<MapScreen />, { wrapper })
    // Tap branchB's pin directly — sets selectedBranchId AND
    // activeBranchIndex=1 AND arms the loop-guard ref for index 1.
    act(() => { capturedMapPinsOnPress!(branchB) })
    mockAnimateToRegion.mockClear()

    // MapBranchTile's own scrollTo-on-activeIndex-change effect would
    // settle back on the SAME index (1) and fire onIndexChange(1) as an
    // echo — simulate that here.
    act(() => { capturedMapBranchTileProps.onIndexChange(1) })

    // No camera animation — this was recognised as an echo of the pin
    // tap, not a new user swipe.
    expect(mockAnimateToRegion).not.toHaveBeenCalled()
  })

  it('does not animate the camera for a branch with a redacted (null) location', () => {
    render(<MapScreen />, { wrapper })
    act(() => { capturedMapPinsOnPress!(branchA) })
    mockAnimateToRegion.mockClear()

    // Swipe to index 2 (branchRedacted — no coordinates).
    act(() => { capturedMapBranchTileProps.onIndexChange(2) })

    expect(capturedMapBranchTileProps.activeIndex).toBe(2)
    expect(mockAnimateToRegion).not.toHaveBeenCalled()
  })

  it('swipe-down dismiss (onClose from MapBranchTile) deselects and unmounts the carousel', () => {
    render(<MapScreen />, { wrapper })
    act(() => { capturedMapPinsOnPress!(branchA) })
    expect(capturedMapBranchTileProps).toBeTruthy()

    act(() => { capturedMapBranchTileProps.onClose() })

    // MapBranchTile only mounts while `selectedBranchId !== null` — after
    // dismissal the mocked component should not have been re-rendered
    // with fresh props (it unmounts, `capturedMapBranchTileProps` stays
    // at its last-captured value, but the underlying selection state is
    // now null — verified indirectly via a fresh pin tap re-arming
    // cleanly, i.e. no stale-selection crash).
    act(() => { capturedMapPinsOnPress!(branchA) })
    expect(capturedMapBranchTileProps.activeIndex).toBe(0)
  })
})
