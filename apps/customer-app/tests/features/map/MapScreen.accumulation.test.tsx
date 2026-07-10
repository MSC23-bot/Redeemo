// Map Phase 2 S2 Task 1 — region-accumulation cache, end-to-end through
// MapScreen (acceptance criterion 1 of the programme plan):
//
//   "Pan Huddersfield→London→back: Huddersfield pins render instantly
//    from cache (no blank beat), refresh quietly."
//
// Uses the REAL `useInAreaBranches` hook (real React Query caching +
// query keys) with `discoveryApi.getInAreaBranches` mocked at the
// network boundary, so this test exercises the actual integration
// between the live viewport query and the accumulation store — not just
// the store in isolation (see `regionAccumulationStore.test.ts` for the
// store's own unit coverage).

import React from 'react'
import { render, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { discoveryApi } from '@/lib/api/discovery'
import { makeBranchTile } from '../../fixtures/branchTile'

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

jest.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({ data: undefined, isLoading: false, isFetching: false }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: { categories: [] } }),
}))

jest.mock('@/hooks/useLocation', () => ({
  // No GPS — forces the initial-camera cascade to branch 3 (LONDON_REGION
  // fallback) so the test controls every fetched bbox deterministically.
  useUserLocation: () => ({ location: null, status: 'denied', requestPermission: jest.fn() }),
}))

jest.mock('@/hooks/useMe', () => ({
  // No saved profile coords either — same reasoning as above.
  useMe: () => ({ data: null, isLoading: false, isError: false }),
  meQueryKey: ['me'],
}))

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: () => ({ data: { amenities: [] }, isLoading: false }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}))

jest.spyOn(discoveryApi, 'getInAreaBranches')

import { MapScreen } from '@/features/map/screens/MapScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

// London gets TWO branches and Huddersfield gets ONE — the counts
// themselves disambiguate which tile is actually rendering at each
// assertion (rather than a coincidental "still 1 item" false positive).
const londonBranches = [
  makeBranchTile({ id: 'brn-london-1', branchName: 'London Branch 1' }),
  makeBranchTile({ id: 'brn-london-2', branchName: 'London Branch 2' }),
]
const huddersfieldBranch = makeBranchTile({ id: 'brn-huddersfield', branchName: 'Huddersfield Branch' })

function meta(reason: 'none' = 'none') {
  return { resolvedArea: '', nearbyCount: 0, cityCount: 0, distantCount: 0, emptyStateReason: reason }
}

describe('MapScreen — region-accumulation cache (Map Phase 2 S2 Task 1)', () => {
  beforeEach(() => {
    (discoveryApi.getInAreaBranches as jest.Mock).mockReset()
    mockOnRegionChangeComplete = null
    mockAnimateToRegion.mockClear()
  })

  it('pan Huddersfield → London → back: Huddersfield pins render instantly from the accumulation store while the live refetch is still in flight', async () => {
    (discoveryApi.getInAreaBranches as jest.Mock).mockImplementation((opts: any) => {
      // Initial-cascade LONDON_REGION-derived bbox (fetch #1).
      if (Math.abs(opts.minLat - 51.482) < 0.001) {
        return Promise.resolve({ merchants: [], branches: londonBranches, total: 2, meta: meta() })
      }
      // Pan to Huddersfield (fetch #2).
      if (Math.abs(opts.minLat - 53.625) < 0.001) {
        return Promise.resolve({ merchants: [], branches: [huddersfieldBranch], total: 1, meta: meta() })
      }
      // Pan back near-London — a DIFFERENT quantized bbox from fetch #1
      // (so this is a genuine React-Query cache MISS, not a same-key
      // revisit), held pending so the assertion window observes
      // accumulation, not a resolved refetch.
      if (Math.abs(opts.minLat - 51.485) < 0.001) {
        return new Promise(() => {})
      }
      return Promise.resolve({ merchants: [], branches: [], total: 0, meta: meta() })
    })

    // Real timers throughout — this test cares about the accumulation
    // union, not the exact 500ms debounce boundary (that's covered by
    // MapScreen.test.tsx's dedicated debounce tests). `waitFor` polls
    // with real timers (properly `act`-wrapped) rather than a blind
    // `setTimeout` sleep, so it also tolerates the debounce + mocked
    // fetch resolving on their own schedule.
    const { getByText, queryByText } = render(<MapScreen />, { wrapper })

    // Initial-cascade London fetch resolves.
    await waitFor(() => expect(getByText('List (2)')).toBeTruthy())

    // Pan to Huddersfield.
    expect(mockOnRegionChangeComplete).not.toBeNull()
    act(() => {
      mockOnRegionChangeComplete!({ latitude: 53.65, longitude: -1.78, latitudeDelta: 0.05, longitudeDelta: 0.05 })
    })
    await waitFor(() => expect(getByText('List (1)')).toBeTruthy(), { timeout: 2000 }) // now showing Huddersfield's 1

    // Pan back toward London (slightly offset — new quantized key, so
    // this is a genuine fresh fetch, held pending by the mock above).
    act(() => {
      mockOnRegionChangeComplete!({ latitude: 51.51, longitude: -0.1278, latitudeDelta: 0.05, longitudeDelta: 0.05 })
    })

    // The third fetch never resolves (mocked pending forever). If
    // accumulation were absent, `branches` would be empty during this
    // gap (blank map). With it, London's remembered 2-branch tile from
    // fetch #1 renders immediately — the count itself (2, not 1 or 0)
    // proves it's London's tile reappearing, not a coincidental leftover
    // from the Huddersfield fetch. `waitFor` still applies here (rather
    // than an immediate synchronous assertion) so the 500ms debounce has
    // definitely committed the new (pending) query before we check.
    await waitFor(() => expect(getByText('List (2)')).toBeTruthy(), { timeout: 2000 })
    expect(queryByText('No merchants in this area')).toBeNull()
  })
})
