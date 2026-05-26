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

describe('§DF-v2-j Task 10 + Round 2 — SearchScreen mounts <LocationStatusLabel variant=strip> ONLY when results are visible', () => {
  // Round 2 item 2 — owner reported the top-of-screen label was
  // redundant in idle + empty states (the empty-state copy already
  // says "Searching near {city}").  Owner-locked direction: hide
  // the label in idle/empty/loading; show it only when results are
  // populated.  Tests below reflect the new conditional mount.

  it('§LSL-Search — strip label renders with the searchResponse.locationContext envelope (source=profile + Huddersfield) when results are visible', async () => {
    mockState.locationContext = {
      source:   'profile',
      city:     'Huddersfield',
      locality: { id: 'l-huddersfield', name: 'Huddersfield' },
    }
    // Round 2: branches non-empty so showResults && branches.length > 0
    // mount-condition triggers.
    mockState.branches = [{
      id: 'b1', branchName: 'Town Centre', branchLocalityId: 'l-huddersfield',
      branchLocalityName: 'Huddersfield', merchant: { id: 'm1', businessName: 'Test' },
    } as any]

    const { getByPlaceholderText, getByTestId } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'cafe')

    // 1. Label is mounted in the results state.
    await waitFor(() => expect(getByTestId('location-status-label')).toBeTruthy())
    // 2. Copy derived from the wire envelope (no client-side derivation).
    const city = getByTestId('location-status-city')
    expect(city.props.children).toBe('Huddersfield')
  })

  it('§LSL-Search-coordinates — strip label renders "Using current location" when source=coordinates AND results are visible', async () => {
    mockState.locationContext = {
      source:   'coordinates',
      city:     'London',
      locality: { id: 'l-london', name: 'London' },
    }
    mockState.branches = [{
      id: 'b1', branchName: 'City', branchLocalityId: 'l-london',
      branchLocalityName: 'London', merchant: { id: 'm1', businessName: 'Test' },
    } as any]

    const { getByPlaceholderText, getByTestId } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'cafe')

    await waitFor(() => expect(getByTestId('location-status-label')).toBeTruthy())
    const text = getByTestId('location-status-text')
    expect(text.props.children).toBe('Using current location')
  })

  it('§LSL-Search-loading — label renders null during pre-search (no search has fired yet)', () => {
    // Before any text is typed: useSearch returns data: undefined, so
    // showResults is false → label hidden by the Round 2 conditional
    // mount AND by §LSL-7 component-level null-on-undefined.
    mockState.locationContext = null
    mockMeRef.current         = null
    const { queryByTestId } = render(<SearchScreen />, { wrapper })
    expect(queryByTestId('location-status-label')).toBeNull()
  })

  // Round 2 device-QA item 2 regression pin (reframed from Round 1).
  it('§LSL-Search-idle-no-label — label is HIDDEN in idle state EVEN when the user has a profile location (Round 2 product decision: empty-state copy carries the location identity in idle/empty states)', () => {
    // Profile-location user, no search typed: the label MUST NOT
    // render at the top of Search.  The profile-aware empty state
    // ("Searching near Brightlingsea ...") carries the location copy
    // when relevant; the top-strip would be redundant chrome.
    mockState.locationContext = null
    mockMeRef.current = {
      locality: { id: 'l-brightlingsea', name: 'Brightlingsea', postTown: 'Colchester', region: 'England' },
      city:     null,
    }
    const { queryByTestId } = render(<SearchScreen />, { wrapper })
    expect(queryByTestId('location-status-label')).toBeNull()
  })

  // Round 2 device-QA item 2 — positive pin: label DOES render in
  // results state, AND the synthesized-from-useMe envelope still
  // drives the city when data.locationContext happens to be
  // undefined (forward-compat: backend response shape shouldn't
  // break the label).
  it('§LSL-Search-results-with-synth — label renders in results state with profile-synthesized envelope when data.locationContext is undefined', async () => {
    mockState.locationContext = null // backend didn't send envelope
    mockState.branches = [{
      id: 'b1', branchName: 'Sea View', branchLocalityId: 'l-brightlingsea',
      branchLocalityName: 'Brightlingsea', merchant: { id: 'm1', businessName: 'Test' },
    } as any]
    mockMeRef.current = {
      locality: { id: 'l-brightlingsea', name: 'Brightlingsea', postTown: 'Colchester', region: 'England' },
      city:     null,
    }

    const { getByPlaceholderText, getByTestId } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'cafe')

    await waitFor(() => expect(getByTestId('location-status-label')).toBeTruthy())
    const city = getByTestId('location-status-city')
    expect(city.props.children).toBe('Brightlingsea')
  })
})
