// §BE 2026-05-17 — MapScreen's keyboard search/return cascade.
//
// Pre-§BE the keyboard return key on the Map SearchBar did nothing.
// Locked behaviour (this PR):
//   1. In-list match (substring against UK_CITIES) → geocode the
//      canonical name → animate the map to those coords.
//   2. Out-of-list fallback → geocode the typed text directly via
//      Expo's `Location.geocodeAsync`.  Lets owners reach
//      towns/postcodes not yet in the hardcoded list.
//   3. Geocode returns null → non-blocking toast with the locked
//      copy "Couldn't find that place. Try a different city name."
//
// Tests below mock geocodeCity directly so they don't depend on the
// device's native geocoder (which can vary by iOS locale).

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── react-native-maps mock (mirrors MapScreen.loader.test.tsx) ─────────────

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
    default:    MockMapView,
    Marker:     (props: any) => ReactLib.createElement(View, props),
  }
})

// ─── Hook mocks ──────────────────────────────────────────────────────────────

const mockState = {
  // PR-3 Phase D — fixtures now optionally carry `branches[]`.
  inAreaData:     null as null | { merchants: any[]; branches?: any[]; total: number; meta: any },
  inAreaLoading:  false,
  inAreaFetching: false,
  searchData:     null as null | { merchants: any[]; branches?: any[]; total: number; meta?: any },
  searchLoading:  false,
  searchFetching: false,
  locationStatus: 'granted' as 'idle' | 'loading' | 'granted' | 'denied',
}

jest.mock('@/features/map/hooks/useInAreaBranches', () => ({
  useInAreaBranches: (bbox: any, _params: any = {}, enabled: boolean = true) => {
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

// ─── Toast + geocoding mocks (the load-bearing ones) ─────────────────────────

const mockToastShow = jest.fn()
jest.mock('@/design-system', () => {
  const actual = jest.requireActual('@/design-system')
  return {
    ...actual,
    useToast: () => ({ show: mockToastShow }),
  }
})

const mockGeocodeCity = jest.fn()
jest.mock('@/lib/geocoding', () => ({
  geocodeCity: (q: string) => mockGeocodeCity(q),
}))

import { MapScreen } from '@/features/map/screens/MapScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('MapScreen — §BE keyboard search/return submit cascade', () => {
  beforeEach(() => {
    mockState.inAreaData     = null
    mockState.inAreaLoading  = false
    mockState.inAreaFetching = false
    mockState.searchData     = null
    mockState.searchLoading  = false
    mockState.searchFetching = false
    mockState.locationStatus = 'granted'
    mockToastShow.mockReset()
    mockGeocodeCity.mockReset()
  })

  // In-list match: typed query matches a UK_CITIES entry; submit
  // geocodes the canonical name and animates the map. Toast must NOT
  // fire.
  it('in-list match: typed "Huddersfield" → geocodes "Huddersfield" → no toast', async () => {
    mockGeocodeCity.mockResolvedValueOnce({ lat: 53.6458, lng: -1.785 })
    const { getByLabelText } = render(<MapScreen />, { wrapper })
    const input = getByLabelText('Search merchants')
    fireEvent.changeText(input, 'Huddersfield')
    fireEvent(input, 'submitEditing')
    await waitFor(() => {
      expect(mockGeocodeCity).toHaveBeenCalledWith('Huddersfield')
    })
    expect(mockToastShow).not.toHaveBeenCalled()
  })

  // Out-of-list match: typed query isn't in UK_CITIES, but Expo's
  // geocoder still resolves it. Submit geocodes the typed text
  // verbatim and animates the map.  Toast must NOT fire.
  it('out-of-list match: typed "Whitstable" → geocoder resolves → no toast', async () => {
    mockGeocodeCity.mockResolvedValueOnce({ lat: 51.36, lng: 1.025 })
    const { getByLabelText } = render(<MapScreen />, { wrapper })
    const input = getByLabelText('Search merchants')
    fireEvent.changeText(input, 'Whitstable')
    fireEvent(input, 'submitEditing')
    await waitFor(() => {
      expect(mockGeocodeCity).toHaveBeenCalledWith('Whitstable')
    })
    expect(mockToastShow).not.toHaveBeenCalled()
  })

  // Geocode failure: typed query is gibberish that the geocoder
  // cannot resolve. Submit must surface the locked toast copy.
  it('failed geocode: typed "Hudderzfieldxxx" → null geocode → toast fires with locked copy', async () => {
    mockGeocodeCity.mockResolvedValueOnce(null)
    const { getByLabelText } = render(<MapScreen />, { wrapper })
    const input = getByLabelText('Search merchants')
    fireEvent.changeText(input, 'Hudderzfieldxxx')
    fireEvent(input, 'submitEditing')
    await waitFor(() => {
      expect(mockToastShow).toHaveBeenCalledWith(
        "Couldn't find that place. Try a different city name.",
      )
    })
  })

  // Empty query: submit must be a no-op. No geocode, no toast.
  it('empty query: submit with whitespace-only input is a no-op', async () => {
    const { getByLabelText } = render(<MapScreen />, { wrapper })
    const input = getByLabelText('Search merchants')
    fireEvent.changeText(input, '   ')
    fireEvent(input, 'submitEditing')
    // Defer a tick so a fire would have settled before asserting.
    await new Promise((r) => setTimeout(r, 0))
    expect(mockGeocodeCity).not.toHaveBeenCalled()
    expect(mockToastShow).not.toHaveBeenCalled()
  })
})
