// PR #124 fixup-5 (2026-05-22) — PLACE-fallback honesty regression pins.
//
// Owner device QA blockers:
//   1. q="Leeds" with NO branches in Leeds Locality (only Huddersfield
//      catchment-edge merchants) was claiming "Offers in Leeds" and
//      showing Nearby / Your city pills anchored to the user's GPS
//      city — misleading because the user searched LEEDS, not their
//      device city.
//   2. q="Bristol" / q="Manchester" with scopeExpanded=true (backend
//      cascaded to platform) showed "Offers in <Place>" alongside
//      14 platform merchants — overclaim.
//
// Locked rule:
//   placeFallback = searchChip.mode === 'PLACE' AND (
//     scopeExpanded === true OR
//     no branch has branchLocalityId === effectiveLocality.id
//   )
//
// When placeFallback is true:
//   - ScopePillRow is HIDDEN
//   - Honest banner shown: "We do not have merchants in <Place> yet.
//     Here are the closest matches we have."
//   - Header reads "Closest matches near <Place>" (fixup-2 already)

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { makeBranchTile } from '../../fixtures/branchTile'

const huddersfieldTile = makeBranchTile({
  id: 'brn_karaara_hud',
  branchName: 'Huddersfield',
  branchLocalityName: 'Huddersfield',
  branchLocalityId: 'loc-huddersfield',  // distinct from search-place Locality
  merchant: { id: 'm_karaara', businessName: 'Karaara' },
})

const leedsTile = makeBranchTile({
  id: 'brn_in_leeds',
  branchName: 'Leeds',
  branchLocalityName: 'Leeds',
  branchLocalityId: 'loc-leeds',
  merchant: { id: 'm_leeds', businessName: 'A Leeds Merchant' },
})

const baseMeta = {
  scope:            'city' as const,
  resolvedArea:     'Your city',
  scopeExpanded:    false,
  nearbyCount:      0,
  cityCount:        0,
  distantCount:     0,
  emptyStateReason: 'none' as const,
}

const mockState = {
  branches:         [] as any[],
  searchChip:       null as null | { mode: 'PLACE' | 'TAG'; label: string },
  effectiveLocality: null as null | { id: string; name: string },
  scopeExpanded:    false,
  emptyStateReason: 'none' as 'none' | 'expanded_to_wider' | 'no_uk_supply',
  nearbyCount:      0,
  cityCount:        0,
  distantCount:     0,
}

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => {
    if (!enabled) return { data: undefined, isLoading: false }
    return {
      data: {
        branches:      mockState.branches,
        totalBranches: mockState.branches.length,
        branchMeta: {
          ...baseMeta,
          scope:           mockState.scopeExpanded ? 'platform' : 'city',
          scopeExpanded:   mockState.scopeExpanded,
          emptyStateReason: mockState.emptyStateReason,
          nearbyCount:      mockState.nearbyCount,
          cityCount:        mockState.cityCount,
          distantCount:     mockState.distantCount,
          ...(mockState.effectiveLocality !== null
            ? { effectiveLocality: mockState.effectiveLocality }
            : {}),
          ...(mockState.searchChip !== null
            ? { searchChip: mockState.searchChip }
            : {}),
        },
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

describe('SearchScreen — PLACE-fallback honesty (PR #124 fixup-5)', () => {
  beforeEach(() => {
    mockState.branches          = []
    mockState.searchChip        = null
    mockState.effectiveLocality = null
    mockState.scopeExpanded     = false
    mockState.emptyStateReason  = 'none'
    mockState.nearbyCount       = 0
    mockState.cityCount         = 0
    mockState.distantCount      = 0
  })

  it('Leeds + NO in-Leeds branches (only Huddersfield catchment merchants) → banner + hidden pills + "Closest matches near Leeds" header', async () => {
    // Models the device-QA scenario: q="Leeds" returns 3 Huddersfield
    // merchants classified as NEARBY rung (catchment edge), nothing
    // actually in Leeds Locality.
    //
    // PR #124 fixup-7 (2026-05-22) — banner + header MUST agree.
    // Pre-fixup-7 the header read "Offers in Leeds" while the banner
    // contradicted it.  Header now reads "Closest matches near Leeds"
    // whenever placeFallback is true.
    mockState.searchChip        = { mode: 'PLACE', label: 'Leeds' }
    mockState.effectiveLocality = { id: 'loc-leeds', name: 'Leeds' }
    mockState.branches          = [huddersfieldTile]  // branchLocalityId='loc-huddersfield'
    mockState.nearbyCount       = 1                    // Hudders is NEARBY-rung from Leeds
    mockState.cityCount         = 0
    mockState.distantCount      = 0
    mockState.scopeExpanded     = false

    const { getByPlaceholderText, getByTestId, queryByText, getByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Leeds')

    await waitFor(() => {
      expect(getByTestId('place-fallback-banner')).toBeTruthy()
    })
    // Header MUST use the fallback "Closest matches near <Place>" framing.
    expect(getByText('Closest matches near Leeds')).toBeTruthy()
    // Header MUST NOT overclaim with "Offers in Leeds".
    expect(queryByText('Offers in Leeds')).toBeNull()
    // ScopePillRow is HIDDEN — no Nearby / Your city / More places labels.
    expect(queryByText(/^Nearby/)).toBeNull()
    expect(queryByText(/^Your city/)).toBeNull()
    expect(queryByText(/^More places/)).toBeNull()
  })

  it('Bristol + scopeExpanded (platform cascade) → banner + hidden pills + "Closest matches near" header', async () => {
    mockState.searchChip        = { mode: 'PLACE', label: 'Bristol' }
    mockState.effectiveLocality = { id: 'loc-bristol', name: 'Bristol' }
    mockState.branches          = [huddersfieldTile]  // unrelated to Bristol
    mockState.nearbyCount       = 0
    mockState.cityCount         = 0
    mockState.distantCount      = 14
    mockState.scopeExpanded     = true
    mockState.emptyStateReason  = 'expanded_to_wider'

    const { getByPlaceholderText, getByTestId, queryByText, getByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Bristol')

    await waitFor(() => {
      expect(getByTestId('place-fallback-banner')).toBeTruthy()
    })
    expect(getByText('Closest matches near Bristol')).toBeTruthy()
    expect(queryByText('Offers in Bristol')).toBeNull()
    expect(queryByText(/^Nearby/)).toBeNull()
    expect(queryByText(/^Your city/)).toBeNull()
    expect(queryByText(/^More places/)).toBeNull()
  })

  it('Place WITH in-place supply → pills visible + "Offers in <Place>" header (NO fallback banner)', async () => {
    // A Leeds-branch tile (branchLocalityId === 'loc-leeds') matches the
    // searched Locality.  placeFallback is false; pills render; header
    // shows "Offers in Leeds".
    mockState.searchChip        = { mode: 'PLACE', label: 'Leeds' }
    mockState.effectiveLocality = { id: 'loc-leeds', name: 'Leeds' }
    mockState.branches          = [leedsTile]
    mockState.nearbyCount       = 1
    mockState.cityCount         = 0
    mockState.distantCount      = 0
    mockState.scopeExpanded     = false

    const { getByPlaceholderText, queryByTestId, getByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Leeds')

    await waitFor(() => {
      expect(getByText('Offers in Leeds')).toBeTruthy()
    })
    // Banner NOT shown.
    expect(queryByTestId('place-fallback-banner')).toBeNull()
    // Pills are visible.
    // ScopePillRow may render `Nearby · 1` (with count); match the label prefix.
    expect(getByText(/^Nearby/)).toBeTruthy()
  })

  it('Place WITH matching branchLocalityName but DIFFERENT branchLocalityId → in-place (name-fallback ladder)', async () => {
    // PR #124 fixup-6 (2026-05-22) — owner device QA on Huddersfield
    // exposed that the dev DB has MULTIPLE Locality rows named
    // "Huddersfield" (different LADs / different sources).  The
    // `tryPlaceMatch` resolved one Locality row; the branches were
    // linked to a different Locality row.  Strict id-only match
    // incorrectly fired the fallback banner.  Identity ladder now
    // falls back to branchLocalityName (case-insensitive) and
    // branchPostTown match.
    const huddTileSameNameDifferentId = makeBranchTile({
      id: 'brn_pinos_hud',
      branchName: 'Huddersfield',
      branchLocalityName: 'Huddersfield',
      branchLocalityId: 'loc-hud-row-A',  // a different row from search-place locality
      merchant: { id: 'm_pinos', businessName: 'Pinos Pizzeria' },
    })
    mockState.searchChip        = { mode: 'PLACE', label: 'Huddersfield' }
    mockState.effectiveLocality = { id: 'loc-hud-row-B', name: 'Huddersfield' }  // DIFFERENT row id
    mockState.branches          = [huddTileSameNameDifferentId]
    mockState.nearbyCount       = 1
    mockState.cityCount         = 0
    mockState.distantCount      = 0
    mockState.scopeExpanded     = false

    const { getByPlaceholderText, queryByTestId, getByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Huddersfield')

    await waitFor(() => {
      expect(getByText('Offers in Huddersfield')).toBeTruthy()
    })
    // Banner NOT shown — name match counts as in-place even though ids differ.
    expect(queryByTestId('place-fallback-banner')).toBeNull()
  })

  it('Place WITH matching branchPostTown (and null branchLocalityId) → in-place (postTown-fallback ladder)', async () => {
    // Even-stricter fallback: if a branch has null branchLocalityId AND
    // null branchLocalityName but its branchPostTown matches the
    // searched place, it counts as in-place.  Pre-Plan-4-M1 seed
    // branches may have null locality fields and only postTown set.
    const tileWithPostTownOnly = makeBranchTile({
      id: 'brn_some_branch',
      branchName: 'Some Branch',
      branchLocalityName: null,
      branchLocalityId: null,
      branchPostTown: 'Huddersfield',
      merchant: { id: 'm_some', businessName: 'Some Merchant' },
    })
    mockState.searchChip        = { mode: 'PLACE', label: 'Huddersfield' }
    mockState.effectiveLocality = { id: 'loc-hud', name: 'Huddersfield' }
    mockState.branches          = [tileWithPostTownOnly]
    mockState.nearbyCount       = 1
    mockState.scopeExpanded     = false

    const { getByPlaceholderText, queryByTestId, getByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Huddersfield')

    await waitFor(() => {
      expect(getByText('Offers in Huddersfield')).toBeTruthy()
    })
    expect(queryByTestId('place-fallback-banner')).toBeNull()
  })

  it('Non-PLACE search (TAG / null) is unaffected — pills visible', async () => {
    mockState.searchChip        = { mode: 'TAG', label: 'Brunch' }
    mockState.effectiveLocality = { id: 'loc-hud', name: 'Huddersfield' }
    mockState.branches          = [huddersfieldTile]
    mockState.nearbyCount       = 1
    mockState.cityCount         = 0
    mockState.distantCount      = 0
    mockState.scopeExpanded     = false

    const { getByPlaceholderText, queryByTestId, getByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Brunch')

    await waitFor(() => {
      expect(getByText(/Brunch offers/)).toBeTruthy()
    })
    expect(queryByTestId('place-fallback-banner')).toBeNull()
    // ScopePillRow may render `Nearby · 1` (with count); match the label prefix.
    expect(getByText(/^Nearby/)).toBeTruthy()
  })
})
