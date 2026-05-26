/**
 * §DF-v2-j Task 10 — SearchScreen integration pin for <LocationStatusLabel>.
 *
 * Spec: docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md
 *   §8.2 (mount) + §6.2 (retire client-side savedAreaCity derivation) +
 *   §9.3 (surface integration pin scope).
 * Plan: docs/superpowers/plans/2026-05-26-locationcontext-parity.md Task 10.
 *
 * Asserts:
 *   - <LocationStatusLabel variant='strip'> mounts on SearchScreen.
 *   - It reads from the same `searchResponse.locationContext` envelope
 *     the surface consumes (no client-side useMe()-driven derivation).
 *   - The retired useMe() derivation no longer fires — SearchScreen
 *     does not call useMe at all in the §DF-v2-j shape (the mock
 *     factory below intentionally OMITS @/hooks/useMe to prove this).
 */
import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

// Mockable state holder so different pins can swap the searchResponse
// without forking the mock factory.  Jest hoists factories above
// imports, but lets them close over names prefixed with `mock` per
// jest's allowlist rule.
const mockState = {
  branches:        [] as any[],
  locationContext: null as any | null,
}

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => {
    if (!enabled) return { data: undefined, isLoading: false }
    return {
      data: {
        branches:      mockState.branches,
        totalBranches: mockState.branches.length,
        branchMeta:    {
          scope:            'city' as const,
          resolvedArea:     'Your city',
          scopeExpanded:    false,
          nearbyCount:      0,
          cityCount:        0,
          distantCount:     0,
          emptyStateReason: 'none' as const,
        },
        // §DF-v2-j Task 7 schema field — the envelope feeds both
        // <LocationStatusLabel> AND <SearchEmptyState savedAreaCity>.
        ...(mockState.locationContext !== null
          ? { locationContext: mockState.locationContext }
          : {}),
      },
      isLoading: false,
    }
  },
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status:            'idle',
    location:          null,
    coords:            null,
    permission:        'denied',
    request:           jest.fn(),
    requestPermission: jest.fn(),
    openSettings:      jest.fn(),
  }),
}))

jest.mock('expo-router', () => ({
  useRouter:            () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

// Task 13 Round 1 item 2 — useMe is now the IDLE-STATE fallback for
// the location envelope.  Mock it with a Huddersfield-profile shape so
// the §LSL-Search-idle pin can assert the synthesized profile
// envelope flows through to <LocationStatusLabel> + savedAreaCity
// before any search has fired.
const mockMeRef = {
  current: null as null | {
    locality: { id: string; name: string; postTown: string | null; region: string | null } | null
    city:     string | null
  },
}
jest.mock('@/hooks/useMe', () => ({
  useMe: () => ({ data: mockMeRef.current }),
  meQueryKey: () => ['me'],
}))

import { SearchScreen } from '@/features/search/screens/SearchScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const frame  = { x: 0, y: 0, width: 390, height: 844 } as const
  const insets = { top: 47, right: 0, bottom: 34, left: 0 } as const
  return React.createElement(
    SafeAreaProvider,
    { initialMetrics: { frame, insets } },
    React.createElement(QueryClientProvider, { client: qc }, children),
  )
}

// Triggers useSearch's `enabled` path: SearchScreen debounces text input
// 300ms before issuing the query, so type → advance timers → real-time.
async function typeAndSettle(getByPlaceholderText: any, term: string) {
  jest.useFakeTimers()
  fireEvent.changeText(getByPlaceholderText('Search merchants...'), term)
  await act(async () => { jest.advanceTimersByTime(300) })
  jest.useRealTimers()
}

beforeEach(() => {
  mockState.branches        = []
  mockState.locationContext = null
  mockMeRef.current         = null
})

describe('§DF-v2-j Task 10 — SearchScreen mounts <LocationStatusLabel variant=strip>', () => {
  it('§LSL-Search — strip label renders with the searchResponse.locationContext envelope (source=profile + Huddersfield)', async () => {
    mockState.locationContext = {
      source:   'profile',
      city:     'Huddersfield',
      locality: { id: 'l-huddersfield', name: 'Huddersfield' },
    }
    mockState.branches = []

    const { getByPlaceholderText, getByTestId } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'cafe')

    // 1. Label is mounted.
    await waitFor(() => expect(getByTestId('location-status-label')).toBeTruthy())
    // 2. Copy derived from the wire envelope (no client-side derivation).
    const city = getByTestId('location-status-city')
    expect(city.props.children).toBe('Huddersfield')
  })

  it('§LSL-Search-coordinates — strip label renders "Using current location" when source=coordinates', async () => {
    mockState.locationContext = {
      source:   'coordinates',
      city:     'London',
      locality: { id: 'l-london', name: 'London' },
    }
    mockState.branches = []

    const { getByPlaceholderText, getByTestId } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'cafe')

    await waitFor(() => expect(getByTestId('location-status-label')).toBeTruthy())
    const text = getByTestId('location-status-text')
    expect(text.props.children).toBe('Using current location')
  })

  it('§LSL-Search-loading — label renders null during pre-search when user ALSO has no profile (no envelope + no useMe fallback)', () => {
    // Before any text is typed AND no profile location: useSearch
    // returns `data: undefined`, useMe returns null profile, so the
    // envelope is undefined → label renders null per §LSL-7.
    mockState.locationContext = null
    mockMeRef.current         = null
    const { queryByTestId } = render(<SearchScreen />, { wrapper })
    expect(queryByTestId('location-status-label')).toBeNull()
  })

  // Round 1 device-QA item 2 regression pin.
  it('§LSL-Search-idle — pre-search idle state synthesizes a profile envelope from useMe so the label + savedAreaCity see the user\'s saved location', () => {
    // The owner-reported bug: an authenticated user with a saved
    // Brightlingsea postcode was seeing the no-location empty state +
    // missing status label on Search before typing.  Round 1 fix:
    // useMe is the strict-fallback when data?.locationContext is
    // undefined.  Authoritative envelope still wins once a search
    // runs.
    mockState.locationContext = null // no search has fired yet
    mockMeRef.current = {
      locality: { id: 'l-brightlingsea', name: 'Brightlingsea', postTown: 'Colchester', region: 'England' },
      city:     null,
    }

    const { getByTestId } = render(<SearchScreen />, { wrapper })
    // Label is mounted with the synthesized profile envelope.
    expect(getByTestId('location-status-label')).toBeTruthy()
    // City emphasis derives from useMe.data.locality.name.
    const city = getByTestId('location-status-city')
    expect(city.props.children).toBe('Brightlingsea')
  })
})
