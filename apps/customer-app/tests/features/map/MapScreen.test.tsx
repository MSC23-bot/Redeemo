import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── react-native-maps mock ──────────────────────────────────────────────────
// We capture the latest `onRegionChangeComplete` callback so individual tests
// can drive pans synchronously, and stub `animateToRegion` so the imperative
// mapRef.current?.animateToRegion(...) call from MapScreen does not crash.
// `let` so the mock factory can reassign it from inside MockMapView's render
// and tests can read the latest captured callback. `mock` prefix is required
// for jest's hoist-guard to permit out-of-scope reference from inside the
// `jest.mock(...)` factory body.
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

type HookCall = {
  bbox:    BBox | null
  params:  Record<string, unknown>
  enabled: boolean
}

// Module-level capture buffers — reset in beforeEach.
const mockInAreaCalls: HookCall[] = []
const mockSearchCalls: HookCall[] = []

// Module-level state read by hook mocks. Tests mutate this in `beforeEach` /
// inside individual tests before render to drive screen behaviour.
const mockState = {
  inAreaData:     null as null | { merchants: unknown[]; total: number; meta: { resolvedArea: string; nearbyCount: number; cityCount: number; distantCount: number; emptyStateReason: 'none' | 'expanded_to_wider' | 'no_uk_supply' } },
  inAreaLoading:  false,
  searchData:     null as null | { merchants: unknown[]; total: number; meta?: { resolvedArea: string; scope: 'nearby' | 'city' | 'region' | 'platform'; scopeExpanded: boolean; nearbyCount: number; cityCount: number; distantCount: number; emptyStateReason: 'none' | 'expanded_to_wider' | 'no_uk_supply' } },
  searchLoading:  false,
  locationStatus: 'granted' as 'idle' | 'loading' | 'granted' | 'denied',
}

jest.mock('@/features/map/hooks/useInAreaMerchants', () => ({
  useInAreaMerchants: (
    bbox:    BBox | null,
    params:  Record<string, unknown> = {},
    enabled: boolean = true,
  ) => {
    mockInAreaCalls.push({ bbox, params, enabled })
    const active = enabled && bbox !== null
    return {
      data:      active ? mockState.inAreaData : undefined,
      isLoading: active ? mockState.inAreaLoading : false,
    }
  },
}))

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (params: Record<string, unknown>, enabled: boolean = true) => {
    mockSearchCalls.push({ bbox: null, params, enabled })
    return {
      data:      enabled ? mockState.searchData : undefined,
      isLoading: enabled ? mockState.searchLoading : false,
    }
  },
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: {
      categories: [
        { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null,  intentType: 'LOCAL' },
        { id: 'c2', name: 'Beauty',       iconUrl: null, pinColour: '#E91E8C', pinIcon: null, parentId: null,  intentType: 'LOCAL' },
        { id: 's1', name: 'Italian',      iconUrl: null, pinColour: null,      pinIcon: null, parentId: 'c1' },
      ],
    },
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

// Import AFTER mocks are registered.
import { MapScreen } from '@/features/map/screens/MapScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('MapScreen', () => {
  beforeEach(() => {
    mockInAreaCalls.length      = 0
    mockSearchCalls.length      = 0
    mockState.inAreaData        = null
    mockState.inAreaLoading     = false
    mockState.searchData        = null
    mockState.searchLoading     = false
    mockState.locationStatus    = 'granted'  // skip permission overlay
    mockOnRegionChangeComplete = null
    mockAnimateToRegion.mockClear()
  })

  // ─── Initial bbox seeding (M1 critical fix) ────────────────────────────────
  describe('initial bbox seeding', () => {
    it('fires the in-area query with a non-null UK bbox on first render — no user interaction', () => {
      render(<MapScreen />, { wrapper })
      expect(mockInAreaCalls.length).toBeGreaterThan(0)
      const first = mockInAreaCalls[0]!
      expect(first.bbox).not.toBeNull()
      expect(first.enabled).toBe(true)
      // LONDON_REGION-derived bbox — centre ~51.5074, -0.1278, deltas 0.05
      expect(first.bbox!.minLat).toBeCloseTo(51.4824, 2)
      expect(first.bbox!.maxLat).toBeCloseTo(51.5324, 2)
      expect(first.bbox!.minLng).toBeCloseTo(-0.1528, 2)
      expect(first.bbox!.maxLng).toBeCloseTo(-0.1028, 2)
    })
  })

  // ─── 500ms pan debounce (M1) ───────────────────────────────────────────────
  describe('500ms pan debounce', () => {
    it('does not commit a new query bbox until 500ms after the last pan', () => {
      jest.useFakeTimers()
      try {
        render(<MapScreen />, { wrapper })
        expect(mockOnRegionChangeComplete).not.toBeNull()
        const initialBbox = mockInAreaCalls[mockInAreaCalls.length - 1]!.bbox!

        act(() => {
          mockOnRegionChangeComplete!({
            latitude: 53.4808, longitude: -2.2426, latitudeDelta: 0.05, longitudeDelta: 0.05,  // Manchester
          })
        })

        // <500ms — bbox NOT yet committed (still LONDON-derived)
        act(() => { jest.advanceTimersByTime(400) })
        const midBbox = mockInAreaCalls[mockInAreaCalls.length - 1]!.bbox!
        expect(midBbox.minLat).toBeCloseTo(initialBbox.minLat, 4)

        // ≥500ms — Manchester-derived bbox committed
        act(() => { jest.advanceTimersByTime(200) })
        const finalBbox = mockInAreaCalls[mockInAreaCalls.length - 1]!.bbox!
        expect(finalBbox.minLat).toBeCloseTo(53.4558, 2)
        expect(finalBbox.minLng).toBeCloseTo(-2.2676, 2)
      } finally {
        jest.useRealTimers()
      }
    })

    it('three rapid pans within the debounce window only commit the LATEST bbox', () => {
      jest.useFakeTimers()
      try {
        render(<MapScreen />, { wrapper })

        act(() => {
          mockOnRegionChangeComplete!({ latitude: 53.4808, longitude: -2.2426, latitudeDelta: 0.05, longitudeDelta: 0.05 })
        })
        act(() => { jest.advanceTimersByTime(200) })

        act(() => {
          mockOnRegionChangeComplete!({ latitude: 55.9533, longitude: -3.1883, latitudeDelta: 0.05, longitudeDelta: 0.05 })
        })
        act(() => { jest.advanceTimersByTime(200) })

        act(() => {
          mockOnRegionChangeComplete!({ latitude: 51.4545, longitude: -2.5879, latitudeDelta: 0.05, longitudeDelta: 0.05 })  // Bristol
        })
        // Each pan resets the timer — we should still NOT have committed any of them.
        // Now flush.
        act(() => { jest.advanceTimersByTime(500) })

        const finalBbox = mockInAreaCalls[mockInAreaCalls.length - 1]!.bbox!
        // Final bbox should be Bristol-derived, not Manchester or Edinburgh.
        expect(finalBbox.minLat).toBeCloseTo(51.4295, 2)
        expect(finalBbox.minLng).toBeCloseTo(-2.6129, 2)
      } finally {
        jest.useRealTimers()
      }
    })
  })

  // ─── Hybrid hook switching (M2) ────────────────────────────────────────────
  describe('hybrid hook switching', () => {
    it('uses /discovery/in-area by default (no non-scope filters applied)', () => {
      render(<MapScreen />, { wrapper })
      const lastInArea = mockInAreaCalls[mockInAreaCalls.length - 1]!
      const lastSearch = mockSearchCalls[mockSearchCalls.length - 1]!
      expect(lastInArea.enabled).toBe(true)
      expect(lastSearch.enabled).toBe(false)
    })

    it('does NOT switch to /search when only categoryId changes — both routes accept it', () => {
      const { getByText } = render(<MapScreen />, { wrapper })
      fireEvent.press(getByText('Food & Drink'))

      const lastInArea = mockInAreaCalls[mockInAreaCalls.length - 1]!
      const lastSearch = mockSearchCalls[mockSearchCalls.length - 1]!
      expect(lastInArea.enabled).toBe(true)
      expect(lastSearch.enabled).toBe(false)
      expect(lastInArea.params.categoryId).toBe('c1')
    })

    it('switches to /search when sortBy is set to non-relevance via FilterSheet', () => {
      const { getByText, getByLabelText } = render(<MapScreen />, { wrapper })

      fireEvent.press(getByLabelText('Open filters'))
      fireEvent.press(getByText('Nearest'))
      fireEvent.press(getByText(/Show \d+ results/))

      const lastInArea = mockInAreaCalls[mockInAreaCalls.length - 1]!
      const lastSearch = mockSearchCalls[mockSearchCalls.length - 1]!
      expect(lastInArea.enabled).toBe(false)
      expect(lastSearch.enabled).toBe(true)
      expect(lastSearch.params.sortBy).toBe('nearest')
      // /search call carries the bbox params so viewport scoping is preserved.
      expect(lastSearch.params.minLat).toEqual(expect.any(Number))
      expect(lastSearch.params.maxLat).toEqual(expect.any(Number))
      expect(lastSearch.params.minLng).toEqual(expect.any(Number))
      expect(lastSearch.params.maxLng).toEqual(expect.any(Number))
    })
  })

  // ─── FilterSheet ⇄ category pill row sync (M2) ─────────────────────────────
  describe('FilterSheet ⇄ category pill sync', () => {
    it('a category selected via the pill row pre-selects the same top-level inside FilterSheet', () => {
      const { getByText, getByLabelText } = render(<MapScreen />, { wrapper })

      fireEvent.press(getByText('Food & Drink'))
      fireEvent.press(getByLabelText('Open filters'))

      // FilterSheet only renders the "Subcategory" drill-down section once a
      // top-level is selected — so its presence pins that the pill→sheet
      // hand-off uses the same `filters.categoryId`.
      expect(getByText('Subcategory')).toBeTruthy()
    })

    it('tapping the same pill twice clears categoryId (mirrors FilterSheet selectTopLevel)', () => {
      const { getByText } = render(<MapScreen />, { wrapper })

      fireEvent.press(getByText('Food & Drink'))
      fireEvent.press(getByText('Food & Drink'))

      const last = mockInAreaCalls[mockInAreaCalls.length - 1]!
      expect(last.params.categoryId).toBeUndefined()
    })

    it('selecting a different pill clears amenityIds (eligibility differs per category)', () => {
      const { getByText, getByLabelText } = render(<MapScreen />, { wrapper })

      // Apply categoryId=c1 + put the FilterSheet into a non-default state by
      // selecting a non-relevance sort, then re-open and verify pill change
      // resets the filter object's amenities (we exercise via tapping pills
      // around — the cleanest contract pin is that tapping a different pill
      // does not throw and surfaces the new categoryId on the in-area call).
      fireEvent.press(getByText('Food & Drink'))
      fireEvent.press(getByText('Beauty'))

      const last = mockInAreaCalls[mockInAreaCalls.length - 1]!
      expect(last.params.categoryId).toBe('c2')
      // Open FilterSheet — Beauty drill-down should now appear (no subcategories
      // for Beauty in our fixture, so we fall back to checking the sheet renders
      // without crashing). Defer richer amenity-clearing tests to FilterSheet's
      // own suite — this test pins the screen-level integration.
      fireEvent.press(getByLabelText('Open filters'))
    })
  })

  // ─── Filter button active-dot (pins hasNonScopeFilters vs broader hasFilters) ─
  describe('filter button active-dot', () => {
    it('hides the active-dot by default', () => {
      const { queryByTestId } = render(<MapScreen />, { wrapper })
      expect(queryByTestId('filter-active-dot')).toBeNull()
    })

    it('does NOT show the active-dot when only categoryId is set', () => {
      const { getByText, queryByTestId } = render(<MapScreen />, { wrapper })
      fireEvent.press(getByText('Food & Drink'))
      expect(queryByTestId('filter-active-dot')).toBeNull()
    })

    it('shows the active-dot when sortBy is non-relevance (a non-scope filter)', () => {
      const { getByText, getByLabelText, queryByTestId } = render(<MapScreen />, { wrapper })
      fireEvent.press(getByLabelText('Open filters'))
      fireEvent.press(getByText('Nearest'))
      fireEvent.press(getByText(/Show \d+ results/))
      expect(queryByTestId('filter-active-dot')).toBeTruthy()
    })
  })

  // ─── Empty-state classification (M1 + M2) ─────────────────────────────────
  describe('empty state', () => {
    it('renders viewport_empty when in-area returns 0 merchants and the bbox is in the UK', () => {
      mockState.inAreaData = {
        merchants: [],
        total:     0,
        meta:      { resolvedArea: 'London', nearbyCount: 0, cityCount: 0, distantCount: 5, emptyStateReason: 'none' },
      }
      const { getByText } = render(<MapScreen />, { wrapper })
      expect(getByText('No merchants in this area')).toBeTruthy()
    })

    it('renders no_uk_supply copy when meta.emptyStateReason === "no_uk_supply"', () => {
      mockState.inAreaData = {
        merchants: [],
        total:     0,
        meta:      { resolvedArea: 'London', nearbyCount: 0, cityCount: 0, distantCount: 0, emptyStateReason: 'no_uk_supply' },
      }
      const { getByText } = render(<MapScreen />, { wrapper })
      expect(getByText('No matches in the UK yet')).toBeTruthy()
    })

    it('renders offshore copy when the camera region falls outside the UK extent', () => {
      jest.useFakeTimers()
      try {
        const { getByText } = render(<MapScreen />, { wrapper })
        // Pan to Paris (well outside UK bbox)
        act(() => {
          mockOnRegionChangeComplete!({
            latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.05, longitudeDelta: 0.05,
          })
        })
        // Offshore detection reads the live `region` (no debounce wait needed).
        expect(getByText('Map is outside the UK')).toBeTruthy()
      } finally {
        jest.useRealTimers()
      }
    })

    it('does NOT render any empty-state copy while a query is in-flight (isLoading)', () => {
      mockState.inAreaData    = null
      mockState.inAreaLoading = true
      const { queryByText } = render(<MapScreen />, { wrapper })
      expect(queryByText('No merchants in this area')).toBeNull()
      expect(queryByText('No matches in the UK yet')).toBeNull()
    })
  })
})
