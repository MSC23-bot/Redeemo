// Plan 4 M4.5 — SearchScreen header copy variants for searchChip.
//
// §M4-AMENDMENT-2026-05-22 A1 Path 5b: NO standalone <SearchChip>
// component.  The existing unified header at SearchScreen.tsx reads
// `branchMeta.searchChip` and renders one of three copy variants:
//
//   searchChip.mode === 'PLACE': `Offers in <Place>`
//     (q IS the place — drop the "Results for X" framing because q ===
//      the matched Locality name)
//
//   searchChip.mode === 'TAG':   `<Tag> offers near <Locality>` /
//                                 `<Tag> offers` (when locality absent)
//
//   searchChip === null:         existing `Results / Closest matches`
//                                 behaviour unchanged (pinned by
//                                 `SearchScreen.locality.test.tsx`).
//
// This file pins the PLACE + TAG branches.  null is covered by
// SearchScreen.locality.test.tsx.

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { makeBranchTile } from '../../fixtures/branchTile'

const mockTile = makeBranchTile({
  id: 'brn1', branchName: 'Test Branch',
  distance: 800,
  merchant: { id: 'm1', businessName: 'Covelum', voucherCount: 3, maxEstimatedSaving: 12 },
})

const baseMeta = {
  scope:            'platform' as const,
  resolvedArea:     'United Kingdom',
  scopeExpanded:    false,
  nearbyCount:      0,
  cityCount:        0,
  distantCount:     1,
  emptyStateReason: 'none' as const,
}

const mockState = {
  effectiveLocality: null as null | { id: string; name: string },
  searchChip:        null as null | { mode: 'PLACE' | 'TAG'; label: string },
  // PR #124 fixup-2 (2026-05-22) — scope-expansion signals for the
  // PLACE-mode honesty test.  When backend widened past the matched
  // place, customer-app reads these to switch header copy.
  scopeExpanded:     false,
  emptyStateReason:  'none' as 'none' | 'expanded_to_wider' | 'no_uk_supply',
  // PR #124 fixup-7 (2026-05-22) — per-test branch override so the
  // PLACE in-place test can pass a tile whose branchLocalityName
  // matches the searched place (closes the identity-ladder check).
  branches:          null as any[] | null,
}

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => {
    if (!enabled) return { data: undefined, isLoading: false }
    const builtMeta = {
      ...baseMeta,
      scopeExpanded:    mockState.scopeExpanded,
      emptyStateReason: mockState.emptyStateReason,
      ...(mockState.effectiveLocality !== null
        ? { effectiveLocality: mockState.effectiveLocality }
        : {}),
      ...(mockState.searchChip !== null
        ? { searchChip: mockState.searchChip }
        : {}),
    }
    const branches = mockState.branches ?? [mockTile]
    return {
      data: {
        branches,
        totalBranches: branches.length,
        branchMeta:    builtMeta,
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

async function typeAndSettle(getByPlaceholderText: any, term: string) {
  jest.useFakeTimers()
  fireEvent.changeText(getByPlaceholderText('Search merchants...'), term)
  await act(async () => { jest.advanceTimersByTime(300) })
  jest.useRealTimers()
}

describe('SearchScreen — searchChip header copy variants (Plan 4 M4.5)', () => {
  beforeEach(() => {
    mockState.effectiveLocality = null
    mockState.searchChip        = null
    mockState.scopeExpanded     = false
    mockState.emptyStateReason  = 'none'
    mockState.branches          = null
  })

  it('PLACE mode + in-place results: renders "Offers in <Place>"', async () => {
    // PR #124 fixup-7 (2026-05-22) — placeFallback now drives the
    // header.  For the in-place-results path, the fixture branch
    // MUST have branchLocalityName matching the searched place so
    // the identity ladder counts it as in-place.
    const inPlaceTile = makeBranchTile({
      id: 'brn-in-br', branchName: 'Brightlingsea',
      branchLocalityName: 'Brightlingsea',
      branchLocalityId: 'loc-br',
      merchant: { id: 'm1', businessName: 'Covelum', voucherCount: 3, maxEstimatedSaving: 12 },
    })
    const originalBranchOverride = mockTile  // keep reference to default if needed
    void originalBranchOverride
    mockState.searchChip        = { mode: 'PLACE', label: 'Brightlingsea' }
    mockState.effectiveLocality = { id: 'loc-br', name: 'Brightlingsea' }
    mockState.branches          = [inPlaceTile]
    const { getByPlaceholderText, getByText, queryByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Brightlingsea')
    await waitFor(() => {
      expect(getByText('Offers in Brightlingsea')).toBeTruthy()
    })
    // The legacy "Results for X" copy must NOT appear on the PLACE path —
    // q IS the place, so "Results for 'Brightlingsea'" would read as
    // a tautology / mid-flow stop word.
    expect(queryByText(/Results for "Brightlingsea"/)).toBeNull()
    expect(queryByText(/Closest matches near/)).toBeNull()
  })

  it('PLACE mode + scopeExpanded (widened past place): renders "Closest matches near <Place>" honesty', async () => {
    // PR #124 fixup-2 (2026-05-22) — owner-direction honesty rule.
    // Pre-fixup: header was always "Offers in Manchester" even when the
    // backend cascaded scope past the matched place and returned
    // platform-wide unrelated merchants.  Owner: "If the backend
    // intentionally widens beyond the searched place, the header/copy
    // must clearly say that."
    mockState.searchChip        = { mode: 'PLACE', label: 'Manchester' }
    mockState.effectiveLocality = { id: 'loc-man', name: 'Manchester' }
    mockState.scopeExpanded     = true
    mockState.emptyStateReason  = 'expanded_to_wider'
    const { getByPlaceholderText, getByText, queryByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Manchester')
    await waitFor(() => {
      expect(getByText('Closest matches near Manchester')).toBeTruthy()
    })
    // The overclaim copy "Offers in Manchester" must NOT appear when the
    // scope was widened past the matched place.
    expect(queryByText('Offers in Manchester')).toBeNull()
    // Legacy framings also absent.
    expect(queryByText(/Results for "Manchester"/)).toBeNull()
  })

  it('TAG mode + locality present: renders "<Tag> offers near <Locality>"', async () => {
    mockState.searchChip        = { mode: 'TAG', label: 'Brunch' }
    mockState.effectiveLocality = { id: 'loc-hud', name: 'Huddersfield' }
    const { getByPlaceholderText, getByText, queryByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Brunch')
    await waitFor(() => {
      expect(getByText('Brunch offers near Huddersfield')).toBeTruthy()
    })
    expect(queryByText(/Results for "Brunch"/)).toBeNull()
  })

  it('TAG mode + no locality: renders bare "<Tag> offers"', async () => {
    mockState.searchChip        = { mode: 'TAG', label: 'Halal' }
    mockState.effectiveLocality = null
    const { getByPlaceholderText, getByText, queryByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Halal')
    await waitFor(() => {
      expect(getByText('Halal offers')).toBeTruthy()
    })
    expect(queryByText(/near/)).toBeNull()
    expect(queryByText(/Results for "Halal"/)).toBeNull()
  })
})
