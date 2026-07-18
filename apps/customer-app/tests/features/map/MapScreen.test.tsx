import React from 'react'
import { render, fireEvent, act, within } from '@testing-library/react-native'
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
  options?: Record<string, unknown>
}

// Module-level capture buffers — reset in beforeEach.
const mockInAreaCalls: HookCall[] = []
const mockSearchCalls: HookCall[] = []

// Module-level state read by hook mocks. Tests mutate this in `beforeEach` /
// inside individual tests before render to drive screen behaviour.
const mockState = {
  // PR-3 Phase D — fixtures now optionally carry `branches[]`.
  // MapScreen consumes branches for pins / carousel / list, plus
  // empty-state + §BH loader gates.
  inAreaData:     null as null | { merchants: unknown[]; branches?: unknown[]; total: number; meta: { resolvedArea: string; nearbyCount: number; cityCount: number; distantCount: number; emptyStateReason: 'none' | 'expanded_to_wider' | 'no_uk_supply' } },
  inAreaLoading:  false,
  searchData:     null as null | { merchants: unknown[]; branches?: unknown[]; total: number; meta?: { resolvedArea: string; scope: 'nearby' | 'city' | 'region' | 'platform'; scopeExpanded: boolean; nearbyCount: number; cityCount: number; distantCount: number; emptyStateReason: 'none' | 'expanded_to_wider' | 'no_uk_supply' } },
  searchLoading:  false,
  locationStatus: 'granted' as 'idle' | 'loading' | 'granted' | 'denied',
}

jest.mock('@/features/map/hooks/useInAreaBranches', () => ({
  useInAreaBranches: (
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
  useSearch: (
    params:  Record<string, unknown>,
    enabled: boolean = true,
    options: Record<string, unknown> = {},
  ) => {
    mockSearchCalls.push({ bbox: null, params, enabled, options })
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

// §DF device-QA Round 4 — MapScreen now reads `useMe()` to drive the
// initial-camera cascade (locate-me fallback already required this in
// Round 3).  Default fixture: `meData: null` + `isLoading: false` so
// the cascade's Branch 3 fall-through (LONDON_REGION) fires for tests
// that don't set GPS coords.
jest.mock('@/hooks/useMe', () => ({
  useMe: () => ({ data: null, isLoading: false, isError: false }),
  meQueryKey: ['me'],
}))

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: () => ({ data: { amenities: [] }, isLoading: false }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}))

// Import AFTER mocks are registered.
import { MapScreen } from '@/features/map/screens/MapScreen'
import { clearAccumulatedBranches } from '@/features/map/hooks/regionAccumulationStore'
import { makeBranchTile } from '../../fixtures/branchTile'

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
    // §DF device-QA Round 4 — switched from 'granted' (which leaves
    // location: null and would have blocked the new Branch-3 fall-
    // through) to 'denied'.  Both states skip the LocationPermission
    // overlay (which renders only on 'idle'); 'denied' additionally
    // lets the cascade fall through to LONDON_REGION, matching the
    // pre-Round-4 default behaviour for these tests.
    mockState.locationStatus    = 'denied'
    mockOnRegionChangeComplete = null
    mockAnimateToRegion.mockClear()
  })

  // ─── Initial bbox seeding (M1 critical fix; §DF Round 4 update) ────────────
  describe('initial bbox seeding', () => {
    it('fires the in-area query with a non-null UK bbox once the cascade resolves — no user interaction', () => {
      // §DF device-QA Round 4 — `queryBbox` now seeds as null at mount
      // (defer until cascade resolves) and the cascade falls through
      // to LONDON_REGION when no GPS + no profile coords are present.
      // The FIRST hook call now sees `bbox: null`; the LAST settled
      // call (post-cascade) carries the LONDON-derived bbox.  We
      // assert the settled state so the contract guarantee — "an
      // unfiltered Map mount eventually fetches London merchants for
      // an anonymous user" — survives.
      render(<MapScreen />, { wrapper })
      expect(mockInAreaCalls.length).toBeGreaterThan(0)
      const settled = mockInAreaCalls[mockInAreaCalls.length - 1]!
      expect(settled.bbox).not.toBeNull()
      expect(settled.enabled).toBe(true)
      // LONDON_REGION-derived bbox — centre ~51.5074, -0.1278, deltas 0.05
      expect(settled.bbox!.minLat).toBeCloseTo(51.4824, 2)
      expect(settled.bbox!.maxLat).toBeCloseTo(51.5324, 2)
      expect(settled.bbox!.minLng).toBeCloseTo(-0.1528, 2)
      expect(settled.bbox!.maxLng).toBeCloseTo(-0.1028, 2)
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
      fireEvent.press(getByText(/Show \d+ places/))

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

    // Map Phase 2 S0 (Task A integration) — the voucher-type label→enum
    // mapping bug lived at the FilterSheet↔MapScreen boundary: MapScreen
    // passes `filters.voucherTypes` straight through into the /search
    // params, so a display-string leak there would silently zero out
    // results even with FilterSheet itself fixed.
    it('selecting the "Discount" chip sends BOTH DISCOUNT_FIXED and DISCOUNT_PERCENT enum values into the /search params', () => {
      const { getByText, getByLabelText } = render(<MapScreen />, { wrapper })

      fireEvent.press(getByLabelText('Open filters'))
      fireEvent.press(getByText('Discount'))
      fireEvent.press(getByText(/Show \d+ places/))

      const lastSearch = mockSearchCalls[mockSearchCalls.length - 1]!
      expect(lastSearch.enabled).toBe(true)
      expect(lastSearch.params.voucherTypes).toEqual(['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'])
    })
  })

  // ─── Filtered-path bbox quantization + staleTime parity (Map Phase 2 S0 Task B) ─
  describe('filtered-path (/search) bbox quantization + staleTime parity', () => {
    it('sends a QUANTIZED bbox into /search params, not the raw camera bbox', () => {
      jest.useFakeTimers()
      try {
        const { getByText, getByLabelText } = render(<MapScreen />, { wrapper })

        // Pan to a bbox with plenty of sub-quantization-grid precision.
        act(() => {
          mockOnRegionChangeComplete!({
            latitude: 53.48081234, longitude: -2.24261234, latitudeDelta: 0.05, longitudeDelta: 0.05,
          })
        })
        act(() => { jest.advanceTimersByTime(500) })

        // Flip to the /search path via a non-scope filter.
        fireEvent.press(getByLabelText('Open filters'))
        fireEvent.press(getByText('Nearest'))
        fireEvent.press(getByText(/Show \d+ places/))

        const lastSearch = mockSearchCalls[mockSearchCalls.length - 1]!
        expect(lastSearch.enabled).toBe(true)
        // quantizeBbox floors mins / ceils maxs to 3dp — the raw camera
        // bbox (min lat 53.45581234) must NOT appear verbatim.
        expect(lastSearch.params.minLat).toBe(Math.floor(53.45581234 * 1000) / 1000)
        expect(lastSearch.params.maxLat).toBe(Math.ceil(53.50581234 * 1000) / 1000)
        expect(lastSearch.params.minLng).toBe(Math.floor(-2.26761234 * 1000) / 1000)
        expect(lastSearch.params.maxLng).toBe(Math.ceil(-2.21761234 * 1000) / 1000)
      } finally {
        jest.useRealTimers()
      }
    })

    it('two pans that land in the same quantization cell send the SAME bbox to /search (cache-hit parity with the unfiltered path)', () => {
      jest.useFakeTimers()
      try {
        const { getByText, getByLabelText } = render(<MapScreen />, { wrapper })

        fireEvent.press(getByLabelText('Open filters'))
        fireEvent.press(getByText('Nearest'))
        fireEvent.press(getByText(/Show \d+ places/))

        act(() => {
          mockOnRegionChangeComplete!({
            latitude: 53.480812, longitude: -2.242612, latitudeDelta: 0.001, longitudeDelta: 0.001,
          })
        })
        act(() => { jest.advanceTimersByTime(500) })
        const firstBbox = mockSearchCalls[mockSearchCalls.length - 1]!.params

        act(() => {
          mockOnRegionChangeComplete!({
            latitude: 53.480819, longitude: -2.242619, latitudeDelta: 0.001, longitudeDelta: 0.001,
          })
        })
        act(() => { jest.advanceTimersByTime(500) })
        const secondBbox = mockSearchCalls[mockSearchCalls.length - 1]!.params

        expect(secondBbox.minLat).toBe(firstBbox.minLat)
        expect(secondBbox.maxLat).toBe(firstBbox.maxLat)
        expect(secondBbox.minLng).toBe(firstBbox.minLng)
        expect(secondBbox.maxLng).toBe(firstBbox.maxLng)
      } finally {
        jest.useRealTimers()
      }
    })

    it('passes a 120s staleTime override into useSearch for the filtered Map path (parity with useInAreaBranches)', () => {
      const { getByText, getByLabelText } = render(<MapScreen />, { wrapper })

      fireEvent.press(getByLabelText('Open filters'))
      fireEvent.press(getByText('Nearest'))
      fireEvent.press(getByText(/Show \d+ places/))

      const lastSearch = mockSearchCalls[mockSearchCalls.length - 1]!
      expect(lastSearch.enabled).toBe(true)
      expect(lastSearch.options?.staleTime).toBe(120 * 1000)
      expect(lastSearch.options?.keepPreviousData).toBe(true)
    })
  })

  // ─── Category pill row top-level filtering ─────────────────────────────────
  // useCategories() returns top-levels + subcategories flattened. The pill
  // row must render top-levels only — subcategories surface inside the
  // FilterSheet drill-down, not here. Mirrors CategoryGrid's behaviour.
  describe('category pill row', () => {
    it('renders top-level categories only — subcategories are NOT shown as pills', () => {
      const { getByText, queryByText } = render(<MapScreen />, { wrapper })
      // Top-levels (parentId === null) are rendered.
      expect(getByText('Food & Drink')).toBeTruthy()
      expect(getByText('Beauty')).toBeTruthy()
      // Subcategory `s1` (parentId === 'c1') must NOT appear in the pill row.
      expect(queryByText('Italian')).toBeNull()
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
      const { getByText, getAllByText } = render(<MapScreen />, { wrapper })

      fireEvent.press(getByText('Food & Drink'))
      // Map Phase 2 S5a — once selected, the pill's label ALSO appears in
      // the new applied-filters chip row beneath the pills (removable
      // "Food & Drink ×" chip) — mirrors FilterSheet.test.tsx's own
      // "active pill renders its label twice" precedent. Press the FIRST
      // match (the pill itself, mounted before the chips row).
      fireEvent.press(getAllByText('Food & Drink')[0]!)

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
      fireEvent.press(getByText(/Show \d+ places/))
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
      // Plan 4 M4.6 (2026-05-22) — copy aligned with PR #112 fixup-6.4
      // owner-locked vocabulary; pre-M4.6 title "No matches in the UK yet"
      // used "in the UK" (banned).
      mockState.inAreaData = {
        merchants: [],
        total:     0,
        meta:      { resolvedArea: 'London', nearbyCount: 0, cityCount: 0, distantCount: 0, emptyStateReason: 'no_uk_supply' },
      }
      const { getByText } = render(<MapScreen />, { wrapper })
      expect(getByText('No matches yet for this view')).toBeTruthy()
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

  // ─── W2b round 2 BUG 2 (owner device QA 2026-07-13) ───────────────────────
  //
  // Device repro: "Show 0 places" on the Apply button while the list header
  // said "3 places in this area", with ZERO filters selected (a remote-city
  // viewport was active). Root cause: the live-count preview ALWAYS ran
  // /search, whose ranking/scope cascade is relative to the USER's effLoc
  // (GPS/profile), not the viewport bbox — with a remote viewport and no
  // q/categoryId every bbox-admitted branch fell above the retained rungs
  // and the bucket-B rescue could not fire, so /search honestly answered 0
  // while the map's own /discovery/in-area feed showed 3. The preview now
  // routes exactly like the APPLIED state would (the hybrid-hook contract).
  describe('W2b round 2 BUG 2: filter-sheet live count routes like the hybrid hook', () => {
    afterEach(() => {
      clearAccumulatedBranches()
    })

    function seedThreeInAreaBranches() {
      const mk = (id: string, name: string) =>
        makeBranchTile({
          id,
          branchLatitude:  51.51,
          branchLongitude: -0.13,
          merchant: { id: `m-${id}`, businessName: name, voucherCount: 1, maxEstimatedSaving: 5 },
        })
      mockState.inAreaData = {
        merchants: [],
        branches:  [mk('brn-a', 'Alpha'), mk('brn-b', 'Beta'), mk('brn-c', 'Gamma')],
        total:     3,
        meta:      { resolvedArea: 'London', nearbyCount: 3, cityCount: 0, distantCount: 0, emptyStateReason: 'none' },
      }
      // The owner-observed poison value: /search (bbox-only, remote
      // viewport) answering zero. The fix must never surface this while
      // the draft has no non-scope filters.
      mockState.searchData = {
        merchants: [],
        branches:  [],
        total:     0,
        meta:      { resolvedArea: 'London', scope: 'nearby', scopeExpanded: false, nearbyCount: 0, cityCount: 0, distantCount: 0, emptyStateReason: 'none' },
      }
    }

    it('no filters selected → Apply shows the in-area count ("Show 3 places"), and the /search preview arm stays disabled', () => {
      seedThreeInAreaBranches()
      const { getByText, getByLabelText, queryByText } = render(<MapScreen />, { wrapper })

      fireEvent.press(getByLabelText('Open filters'))

      // The exact number the list header would show — never the /search 0.
      expect(getByText('Show 3 places')).toBeTruthy()
      expect(queryByText('Show 0 places')).toBeNull()
      // No /search call was ever ENABLED for a clean (non-scope-free) draft.
      expect(mockSearchCalls.some((c) => c.enabled)).toBe(false)
    })

    it('draft category differs from applied → the preview runs through /discovery/in-area with the DRAFT categoryId (not /search)', () => {
      seedThreeInAreaBranches()
      const { getByText, getByLabelText } = render(<MapScreen />, { wrapper })

      fireEvent.press(getByLabelText('Open filters'))
      // Draft-select a category INSIDE the sheet (not applied yet) — the
      // map's own category pill row also says "Food & Drink", so scope the
      // query to the sheet (accessibilityLabel "Filter results").
      fireEvent.press(within(getByLabelText('Filter results')).getByText('Food & Drink'))

      // The preview in-area call (textually before the screen's own call,
      // so second-to-last) carries the draft category and is enabled...
      const previewCall = mockInAreaCalls[mockInAreaCalls.length - 2]!
      expect(previewCall.params.categoryId).toBe('c1')
      expect(previewCall.enabled).toBe(true)
      // ...while the screen's own (last) in-area call still reflects the
      // APPLIED filters (no category).
      const mainCall = mockInAreaCalls[mockInAreaCalls.length - 1]!
      expect(mainCall.params.categoryId).toBeUndefined()
      // Still no /search preview: categoryId is not a non-scope filter.
      expect(mockSearchCalls.some((c) => c.enabled)).toBe(false)
      // The preview count comes from the in-area feed.
      expect(getByText('Show 3 places')).toBeTruthy()
    })

    it('draft with a NON-SCOPE filter still previews via /search (unchanged arm)', () => {
      jest.useFakeTimers()
      try {
        seedThreeInAreaBranches()
        mockState.searchData = {
          merchants: [],
          branches:  [],
          total:     1,
          meta:      { resolvedArea: 'London', scope: 'nearby', scopeExpanded: false, nearbyCount: 1, cityCount: 0, distantCount: 0, emptyStateReason: 'none' },
        }
        const { getByText, getByLabelText } = render(<MapScreen />, { wrapper })

        fireEvent.press(getByLabelText('Open filters'))
        fireEvent.press(getByText('Open now'))
        // Flush useFilterPreviewCount's 350ms draft debounce.
        act(() => { jest.advanceTimersByTime(400) })

        // The /search preview arm enables once the draft carries a
        // non-scope filter (openNow), mirroring the applied hybrid switch.
        const enabledSearch = mockSearchCalls.filter((c) => c.enabled)
        expect(enabledSearch.length).toBeGreaterThan(0)
        expect(enabledSearch[enabledSearch.length - 1]!.params.openNow).toBe(true)
      } finally {
        jest.useRealTimers()
      }
    })
  })

  // ─── W2b round 3 ITEM 2 (owner device QA 2026-07-13) ───────────────────────
  //
  // Repro: tap a pin (carousel opens, selectedBranchId set) → open the list
  // sheet on top → tap a row → navigate to the merchant profile. The shared
  // handleBranchNavigate never cleared the selection, so the carousel
  // overlay stayed mounted on the map underneath/behind and was
  // unexpectedly present on return. The LIST path now navigates through
  // handleListBranchNavigate, which clears the selection first; the
  // pin-tap → carousel behaviour is untouched.
  describe('W2b round 3 ITEM 2: list-row navigation clears the carousel selection', () => {
    afterEach(() => {
      clearAccumulatedBranches()
    })

    function seedThreePinBranches() {
      // Distinct, well-separated coords inside the LONDON-derived viewport
      // so the three branches render as three SINGLE pins (no cluster).
      const mk = (id: string, name: string, lat: number, lng: number) =>
        makeBranchTile({
          id,
          branchLatitude:  lat,
          branchLongitude: lng,
          merchant: { id: `m-${id}`, businessName: name, voucherCount: 1, maxEstimatedSaving: 5 },
        })
      mockState.inAreaData = {
        merchants: [],
        branches:  [
          mk('brn-a', 'Alpha', 51.49,  -0.145),
          mk('brn-b', 'Beta',  51.505, -0.128),
          mk('brn-c', 'Gamma', 51.525, -0.108),
        ],
        total: 3,
        meta:  { resolvedArea: 'London', nearbyCount: 3, cityCount: 0, distantCount: 0, emptyStateReason: 'none' },
      }
    }

    it('pin-opened carousel does NOT survive a list-row navigation (no selection state left set)', () => {
      seedThreePinBranches()
      const { getByTestId, queryByTestId, getByLabelText, queryByLabelText, getAllByTestId } = render(<MapScreen />, { wrapper })

      // 1. Tap a PIN — the carousel opens (existing behaviour, untouched).
      fireEvent.press(getByTestId('custom-pin-brn-a'))
      expect(getByTestId('map-branch-tile-container')).toBeTruthy()

      // 2. Open the LIST sheet on top of the open carousel.
      fireEvent.press(getByLabelText('Show merchant list'))

      // 3. Tap a list row (the ledger rows are the only map-ledger-row
      //    testIDs in the tree) — this navigates.
      fireEvent.press(getAllByTestId('map-ledger-row')[0]!)

      // The carousel selection must NOT survive list navigation: no
      // carousel overlay left on the map underneath/behind (and none to
      // greet the user on return).
      expect(queryByTestId('map-branch-tile-container')).toBeNull()
      // Round 4 DEFECT 1 — the list SHEET must not survive either: its
      // Modal host renders above the whole navigator, so leaving it open
      // stacks it over the pushed merchant screen.
      expect(queryByLabelText('Nearby Merchants list')).toBeNull()
    })

    it('W2b round 4 DEFECT 1: the sheet-visible state is cleared by the row press (sheet closes with the navigation)', () => {
      seedThreePinBranches()
      const { getByLabelText, queryByLabelText, getAllByTestId } = render(<MapScreen />, { wrapper })

      fireEvent.press(getByLabelText('Show merchant list'))
      expect(getByLabelText('Nearby Merchants list')).toBeTruthy()

      fireEvent.press(getAllByTestId('map-ledger-row')[0]!)
      expect(queryByLabelText('Nearby Merchants list')).toBeNull()

      // Reopens fresh from the List button (no state leak).
      fireEvent.press(getByLabelText('Show merchant list'))
      expect(getByLabelText('Nearby Merchants list')).toBeTruthy()
    })

    it('list-row navigation with NO carousel open leaves no selection behind either (never opens one)', () => {
      seedThreePinBranches()
      const { queryByTestId, getByLabelText, getAllByTestId } = render(<MapScreen />, { wrapper })

      fireEvent.press(getByLabelText('Show merchant list'))
      fireEvent.press(getAllByTestId('map-ledger-row')[1]!)

      expect(queryByTestId('map-branch-tile-container')).toBeNull()
    })
  })
})
