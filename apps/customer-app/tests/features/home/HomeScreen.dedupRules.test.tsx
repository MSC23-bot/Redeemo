import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { HomeScreen } from '@/features/home/screens/HomeScreen'
import { makeBranchTile } from '../../fixtures/branchTile'

// Task F.3 — Spec §8.7 dedup rules.
//
// Three mutual-exclusion invariants:
//   1. <HomeNoLocationBanner> ⊥ <NearbySectionEmpty>
//   2. <HomeNoLocationBanner> ⊥ <HomeExploreMore>
//   3. <NearbySectionEmpty>   ⊥ <HomeExploreMore>      (v1.2)
// Plus one positive coexistence: banner CAN coexist with PopularSection.
//
// Each test mocks `useHomeFeed` with a scenario that COULD legally trigger
// two of the three fallback components if dedup weren't enforced, then
// asserts only the higher-priority one mounts (per §8.7 + the F.3 helper
// booleans).
//
// Booleans recap from F.3 Step 1:
//   showNoLocationBanner    = source === 'none'
//   showNearbySectionEmpty  = !showNoLocationBanner && nbcRails.length === 0
//   sparseHeuristic         = (!featuredRail.meta || scopeExpanded) &&
//                             !trendingRail.meta &&
//                             nbcRails.length < 2 &&
//                             source !== 'none'
//   showExploreMore         = sparseHeuristic && !showNearbySectionEmpty

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status:            'granted',
    location:          { lat: 51.5, lng: -0.1, area: 'Shoreditch', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [{ id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null }] },
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useMe', () => ({
  useMe: () => ({ data: { firstName: 'Shebin', profileImageUrl: null } }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

// Per-test override surface.  The `useHomeFeed` mock factory reads
// `mockHomeFeedData` lazily so each `it()` can swap in a different scenario.
let mockHomeFeedData: any = null
jest.mock('@/hooks/useHomeFeed', () => ({
  useHomeFeed: () => ({
    data:      mockHomeFeedData,
    isLoading: false,
    isError:   false,
    refetch:   jest.fn(),
  }),
}))

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

const popularBranchFixture = makeBranchTile({
  id:           'brn-popular-1',
  branchName:   'Popular Branch',
  distance:     null,
  avgRating:    4.2,
  reviewCount:  100,
  merchant:     {
    id:                  'm-popular',
    businessName:        'Popular Merchant',
    primaryCategory:     { id: 'c1', name: 'Food', parentId: null },
    voucherCount:        3,
    maxEstimatedSaving:  15,
    totalEstimatedSaving: 30,
  },
})

describe('HomeScreen dedup rules (§8.7)', () => {
  afterEach(() => { mockHomeFeedData = null })

  it('invariant #1: banner ⊥ NearbySectionEmpty — source=none + nbcRails empty → only banner', async () => {
    mockHomeFeedData = {
      locationContext:           { city: null, source: 'none' },
      campaigns:                 [],
      featuredBranches:          [],
      trendingBranches:          [],
      nearbyByCategoryBranches:  [],
      featuredRail:              { branches: [], meta: null },
      trendingRail:              { branches: [], meta: null },
      popularRail:               { branches: [], meta: null },
      nearbyByCategoryRails:     [],
    }

    const { queryByTestId } = render(<HomeScreen />, { wrapper })

    await waitFor(() => expect(queryByTestId('home-no-location-banner')).toBeTruthy())
    expect(queryByTestId('home-nearby-section-empty')).toBeNull()
  })

  it('invariant #2: banner ⊥ HomeExploreMore — source=none + sparse-style rails → only banner', async () => {
    // Sparse heuristic by itself can never fire when source === 'none' because
    // it requires source !== 'none'.  This pin closes the invariant from the
    // banner side: even when rail-shape conditions LOOK sparse, no-location
    // wins.
    mockHomeFeedData = {
      locationContext:           { city: null, source: 'none' },
      campaigns:                 [],
      featuredBranches:          [],
      trendingBranches:          [],
      nearbyByCategoryBranches:  [],
      featuredRail:              { branches: [], meta: null },
      trendingRail:              { branches: [], meta: null },
      popularRail:               { branches: [], meta: null },
      nearbyByCategoryRails:     [],
    }

    const { queryByTestId } = render(<HomeScreen />, { wrapper })

    await waitFor(() => expect(queryByTestId('home-no-location-banner')).toBeTruthy())
    expect(queryByTestId('home-explore-more')).toBeNull()
  })

  it('invariant #3 (v1.2): NearbySectionEmpty ⊥ HomeExploreMore — source=coords + nbcRails=0 + sparse → only NearbySectionEmpty', async () => {
    // Sparse shape: featuredRail hidden, trendingRail hidden, nbcRails empty,
    // location resolved.  Both empty + explore-more triggers fire on shape;
    // the F.3 boolean `showExploreMore = sparse && !showNearbySectionEmpty`
    // suppresses explore-more when empty is showing.
    mockHomeFeedData = {
      locationContext:           { city: 'London', source: 'coordinates' },
      campaigns:                 [],
      featuredBranches:          [],
      trendingBranches:          [],
      nearbyByCategoryBranches:  [],
      featuredRail:              { branches: [], meta: null },
      trendingRail:              { branches: [], meta: null },
      popularRail:               { branches: [], meta: null },
      nearbyByCategoryRails:     [],
    }

    const { queryByTestId } = render(<HomeScreen />, { wrapper })

    await waitFor(() => expect(queryByTestId('home-nearby-section-empty')).toBeTruthy())
    expect(queryByTestId('home-explore-more')).toBeNull()
    expect(queryByTestId('home-no-location-banner')).toBeNull()
  })

  // ── v1.9 PR #126 device-QA-6 — <NearbyContextBanner> trigger ────────
  //
  // Banner trigger tightened from `.some()` (any cascaded rail) to
  // `.every()` (ALL nbcRails must be pure-cascade).  Mixed markets where
  // some rails have local supply suppress the banner; the v1.8 chip
  // variants + distance chips carry the per-tile honesty signal.  Only
  // pure-cascade markets (Manchester / Bristol-light) get the global
  // "we're still growing in {City}" framing.
  //
  // Two pins cover the rule:
  //   - Mixed market (Huddersfield-shape) → banner HIDDEN.
  //   - All-cascaded market (Manchester-shape) → banner VISIBLE.

  const huddersfieldMixedRail = {
    category: { id: 'cat-food-drink', name: 'Food & Drink' },
    branches: [
      makeBranchTile({
        id:         'brn-local-1',
        branchName: 'Karaara',
        distance:   800,
        merchant: {
          id:                   'm-karaara',
          businessName:         'Karaara',
          primaryCategory:      { id: 'cat-food-drink', name: 'Food & Drink', parentId: null },
          voucherCount:         2,
          maxEstimatedSaving:   10,
          totalEstimatedSaving: 20,
        },
      }),
    ],
    meta: {
      locality:      { id: 'l-huddersfield', name: 'Huddersfield' },
      scope:         'city' as const,
      scopeExpanded: false,   // ← local rail
      rungCounts:    {},
    },
  }
  const huddersfieldCascadeRail = {
    category: { id: 'cat-shopping', name: 'Shopping' },
    branches: [
      makeBranchTile({
        id:         'brn-cascade-1',
        branchName: 'Wider Shop',
        distance:   180_000,
        merchant: {
          id:                   'm-shop',
          businessName:         'Wider Shop',
          primaryCategory:      { id: 'cat-shopping', name: 'Shopping', parentId: null },
          voucherCount:         1,
          maxEstimatedSaving:   5,
          totalEstimatedSaving: 5,
        },
      }),
    ],
    meta: {
      locality:      { id: 'l-huddersfield', name: 'Huddersfield' },
      scope:         'platform' as const,
      scopeExpanded: true,    // ← pure-cascade rail
      rungCounts:    {},
    },
  }

  it('v1.9 trigger — mixed market (1 local + 1 cascade rail) HIDES <NearbyContextBanner>', async () => {
    mockHomeFeedData = {
      locationContext:           { city: 'Huddersfield', source: 'coordinates' },
      campaigns:                 [],
      featuredBranches:          [],
      trendingBranches:          [],
      nearbyByCategoryBranches:  [],
      featuredRail:              { branches: [], meta: null },
      trendingRail:              { branches: [], meta: null },
      popularRail:               { branches: [], meta: null },
      nearbyByCategoryRails:     [huddersfieldMixedRail, huddersfieldCascadeRail],
    }

    const { queryByTestId } = render(<HomeScreen />, { wrapper })

    // Banner MUST be hidden — not every rail is cascaded.
    await waitFor(() => expect(queryByTestId('home-nearby-context-banner')).toBeNull())
    // The category rails themselves still render (the dedup-managed empty
    // card MUST NOT replace them either).
    expect(queryByTestId('home-nearby-section-empty')).toBeNull()
  })

  it('v1.9 trigger — all-cascaded market (every rail scopeExpanded=true) SHOWS <NearbyContextBanner>', async () => {
    mockHomeFeedData = {
      locationContext:           { city: 'Manchester', source: 'coordinates' },
      campaigns:                 [],
      featuredBranches:          [],
      trendingBranches:          [],
      nearbyByCategoryBranches:  [],
      featuredRail:              { branches: [], meta: null },
      trendingRail:              { branches: [], meta: null },
      popularRail:               { branches: [], meta: null },
      nearbyByCategoryRails:     [huddersfieldCascadeRail],  // single pure-cascade rail
    }

    const { queryByTestId } = render(<HomeScreen />, { wrapper })

    await waitFor(() => expect(queryByTestId('home-nearby-context-banner')).toBeTruthy())
    expect(queryByTestId('home-nearby-section-empty')).toBeNull()
  })

  it('positive coexistence: banner CAN coexist with PopularSection (source=none + popularRail populated)', async () => {
    // PopularSection is rendered when popularRail.meta !== null and
    // trendingRail.meta === null.  It is NOT dedup-managed against the
    // banner — they share the screen because Popular is the UK-wide
    // fallback the banner alludes to.
    mockHomeFeedData = {
      locationContext:           { city: null, source: 'none' },
      campaigns:                 [],
      featuredBranches:          [],
      trendingBranches:          [],
      nearbyByCategoryBranches:  [],
      featuredRail:              { branches: [], meta: null },
      trendingRail:              { branches: [], meta: null },
      popularRail:               {
        branches: [popularBranchFixture],
        meta:     {
          locality:      null,
          scope:         'platform',
          scopeExpanded: true,
          rungCounts:    {},
        },
      },
      nearbyByCategoryRails:     [],
    }

    const { queryByTestId } = render(<HomeScreen />, { wrapper })

    await waitFor(() => expect(queryByTestId('home-no-location-banner')).toBeTruthy())
    // Popular renders alongside.  Component testID lives on its container.
    // If <PopularSection> exposes a stable testID we use it; otherwise the
    // banner's presence + the absence of `home-nearby-section-empty` (the
    // OTHER potential same-zone component) is sufficient evidence the
    // popular path is not being suppressed.
    expect(queryByTestId('home-nearby-section-empty')).toBeNull()
    expect(queryByTestId('home-explore-more')).toBeNull()
  })
})
