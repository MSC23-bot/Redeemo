// PR #112 fixup-4 (2026-05-19) — unified locality header.
//
// History: this file originally pinned the `<LocalityCaption>` "Showing
// results near {name}" line (Plan 4 M3b).  Fixup-4 unified locality into
// the result header itself ("Results for 'X' near {Y}"); LocalityCaption
// is no longer rendered on SearchScreen.  Tests rewritten to pin the
// new behaviour.
//
//   locality present (e.g. Huddersfield) → "Results for 'Pizza' near Huddersfield"
//   locality null/undefined              → "Results for 'Pizza'" (no suffix)
//   meta itself undefined                → "Results for 'Pizza'" (no suffix)

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { makeBranchTile } from '../../fixtures/branchTile'

const mockTile = makeBranchTile({
  id: 'brn1', branchName: 'Huddersfield',
  branchLocalityName: 'Huddersfield',
  distance: 800,
  avgRating: 4.5,
  reviewCount: 50,
  merchant: {
    id: 'm1',
    businessName: 'Karaara',
    primaryCategory: { id: 'c1', name: 'Food', pinColour: null, pinIcon: null, parentId: null },
    descriptor: 'Indian restaurant',
    voucherCount: 3,
    maxEstimatedSaving: 15,
  },
})

const baseMeta = {
  scope:            'city' as const,
  resolvedArea:     'Huddersfield',
  scopeExpanded:    false,
  nearbyCount:      1,
  cityCount:        0,
  distantCount:     0,
  emptyStateReason: 'none' as const,
}

const mockState = {
  effectiveLocality: null as null | { id: string; name: string },
  metaPresent: true as boolean,
}

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => {
    if (!enabled) return { data: undefined, isLoading: false }
    const builtMeta = mockState.metaPresent
      ? {
          ...baseMeta,
          ...(mockState.effectiveLocality !== null
            ? { effectiveLocality: mockState.effectiveLocality }
            : {}),
        }
      : undefined
    return {
      data: {
        merchants: [],
        total: 0,
        branches: [mockTile],
        totalBranches: 1,
        meta:       builtMeta,
        branchMeta: builtMeta,
      },
      isLoading: false,
    }
  },
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 53.6458, lng: -1.785, area: null, city: null },
    requestPermission: jest.fn(),
  }),
}))

// Map Phase 2 S5a (D2) — SearchScreen now mounts a FilterSheet, which
// calls useCategories() + useEligibleAmenities() internally. Mocked here
// so these tests don't trigger real network fetches (none of them
// exercise the FilterSheet itself; see SearchScreen.filterSheet.test.tsx
// for that coverage).
jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: { categories: [] } }),
}))

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: () => ({ data: { amenities: [] }, isLoading: false }),
}))

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useRouter:            () => ({ push: jest.fn(), back: jest.fn() }),
  // PR #112 fixup-6 — SearchScreen reads URL params for the q-preserve flow.
  useLocalSearchParams: () => ({}),
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

async function typeAndSettle(getByPlaceholderText: any) {
  jest.useFakeTimers()
  fireEvent.changeText(getByPlaceholderText('Search merchants...'), 'Pizza')
  await act(async () => { jest.advanceTimersByTime(300) })
  jest.useRealTimers()
}

describe('SearchScreen — unified locality header (PR #112 fixup-4)', () => {
  beforeEach(() => {
    mockState.effectiveLocality = null
    mockState.metaPresent = true
  })

  it('renders "Results for X near Locality" when meta.effectiveLocality is present', async () => {
    mockState.effectiveLocality = { id: 'loc-hud', name: 'Huddersfield' }
    const { getByPlaceholderText, getByText, queryByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      expect(getByText('Results for "Pizza" near Huddersfield')).toBeTruthy()
    })
    // Legacy LocalityCaption copy must NOT appear.
    expect(queryByText(/Showing results near/)).toBeNull()
  })

  it('renders plain "Results for X" when meta.effectiveLocality is absent', async () => {
    mockState.effectiveLocality = null
    const { getByPlaceholderText, getByText, queryByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      expect(getByText('Results for "Pizza"')).toBeTruthy()
    })
    expect(queryByText(/near/)).toBeNull()
  })

  it('renders plain "Results for X" when meta itself is undefined', async () => {
    mockState.metaPresent = false
    const { getByPlaceholderText, getByText, queryByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      expect(getByText('Results for "Pizza"')).toBeTruthy()
    })
    expect(queryByText(/near/)).toBeNull()
  })
})
