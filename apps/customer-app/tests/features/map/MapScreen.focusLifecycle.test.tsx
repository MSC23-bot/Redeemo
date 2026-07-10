// Map Phase 2 S2 Task 3 — focus lifecycle.
//
// Map's queries pause while the Map tab isn't focused (e.g. the user is
// on Home/Search/Savings/Profile). `tests/setup.ts` globally mocks
// `useIsFocused` to always return `true` (so every OTHER screen's tests
// are unaffected) — this file overrides that with a file-scoped
// `jest.mock` (which takes precedence for this file only) so the mock
// can be flipped between focused/unfocused per test.

import React from 'react'
import { render, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let mockIsFocused = true
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockIsFocused,
}))

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

type BBox = { minLat: number; maxLat: number; minLng: number; maxLng: number }
type HookCall = { bbox: BBox | null; params: Record<string, unknown>; enabled: boolean }

const mockInAreaCalls: HookCall[] = []
const mockSearchCalls: HookCall[] = []

jest.mock('@/features/map/hooks/useInAreaBranches', () => ({
  useInAreaBranches: (bbox: BBox | null, params: Record<string, unknown> = {}, enabled: boolean = true) => {
    mockInAreaCalls.push({ bbox, params, enabled })
    const active = enabled && bbox !== null
    return { data: undefined, isLoading: false, isFetching: false, ...( active ? {} : {}) }
  },
}))

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (params: Record<string, unknown>, enabled: boolean = true) => {
    mockSearchCalls.push({ bbox: null, params, enabled })
    return { data: undefined, isLoading: false, isFetching: false }
  },
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: { categories: [] } }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ location: null, status: 'denied', requestPermission: jest.fn() }),
}))

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

import { MapScreen } from '@/features/map/screens/MapScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('MapScreen — focus lifecycle (Map Phase 2 S2 Task 3)', () => {
  beforeEach(() => {
    mockInAreaCalls.length = 0
    mockSearchCalls.length = 0
    mockIsFocused = true
  })

  it('when focused, the in-area query is enabled once the bbox cascade resolves', () => {
    render(<MapScreen />, { wrapper })
    const settled = mockInAreaCalls[mockInAreaCalls.length - 1]!
    expect(settled.enabled).toBe(true)
    expect(settled.bbox).not.toBeNull()
  })

  it('when NOT focused, the in-area query is disabled even once the bbox cascade resolves', () => {
    mockIsFocused = false
    render(<MapScreen />, { wrapper })
    const settled = mockInAreaCalls[mockInAreaCalls.length - 1]!
    expect(settled.enabled).toBe(false)
    // The bbox cascade still runs (camera still centres) — only the
    // QUERY pauses, not the rest of the screen's state.
    expect(settled.bbox).not.toBeNull()
  })

  it('re-focusing the tab re-enables the query (rerender flips isFocused true→ back on)', () => {
    mockIsFocused = false
    const { rerender } = render(<MapScreen />, { wrapper })
    expect(mockInAreaCalls[mockInAreaCalls.length - 1]!.enabled).toBe(false)

    mockIsFocused = true
    act(() => { rerender(<MapScreen />) })
    expect(mockInAreaCalls[mockInAreaCalls.length - 1]!.enabled).toBe(true)
  })
})
