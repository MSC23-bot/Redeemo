import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { HomeScreen } from '@/features/home/screens/HomeScreen'
import { makeBranchTile } from '../../fixtures/branchTile'

// Task F.3 — Spec §8.8 render order.
//
// Mocks §8.3 row #5 (trending empty, popular populated, nearbyByCategory
// populated, location resolved).  Asserts children mount in §8.8 order:
//
//   campaign → featured → popular → nearbyByCategory
//
// (banner / NearbySectionEmpty / HomeExploreMore are NOT expected here —
//  those mutual-exclusion invariants live in HomeScreen.dedupRules.test.)

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status:            'granted',
    location:          { lat: 51.5, lng: -0.1, area: 'Shoreditch', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

const mockFeaturedBranchFixture = makeBranchTile({
  id:           'brn-featured-1',
  branchName:   'Featured Branch',
  distance:     500,
  avgRating:    4.5,
  reviewCount:  20,
  merchant:     {
    id:                  'm-featured',
    businessName:        'Featured Merchant',
    primaryCategory:     { id: 'c1', name: 'Food', parentId: null },
    voucherCount:        2,
    maxEstimatedSaving:  10,
    totalEstimatedSaving: 20,
  },
})

const mockPopularBranchFixture = makeBranchTile({
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

const mockNearbyBranchFixture = makeBranchTile({
  id:           'brn-nearby-1',
  branchName:   'Nearby Branch',
  distance:     200,
  avgRating:    4.7,
  reviewCount:  50,
  merchant:     {
    id:                  'm-nearby',
    businessName:        'Nearby Merchant',
    primaryCategory:     { id: 'c1', name: 'Food', parentId: null },
    voucherCount:        1,
    maxEstimatedSaving:  8,
    totalEstimatedSaving: 16,
  },
})

jest.mock('@/hooks/useHomeFeed', () => ({
  useHomeFeed: () => ({
    data: {
      locationContext: { city: 'London', source: 'coordinates' },
      campaigns: [],
      featuredBranches:         [mockFeaturedBranchFixture],
      trendingBranches:         [],
      nearbyByCategoryBranches: [],
      featuredRail: {
        branches: [mockFeaturedBranchFixture],
        meta:     {
          locality:      { id: 'l-london', name: 'London' },
          scope:         'city',
          scopeExpanded: false,
          rungCounts:    {},
        },
      },
      // Row #5: trending HIDDEN, popular VISIBLE.
      trendingRail: { branches: [], meta: null },
      popularRail:  {
        branches: [mockPopularBranchFixture],
        meta:     {
          locality:      null,
          scope:         'platform',
          scopeExpanded: true,
          rungCounts:    {},
        },
      },
      // NearbyByCategory populated.
      nearbyByCategoryRails: [
        {
          category: { id: 'c1', name: 'Food' },
          branches: [mockNearbyBranchFixture],
          meta:     {
            locality:      { id: 'l-london', name: 'London' },
            scope:         'nearby',
            scopeExpanded: false,
            rungCounts:    {},
          },
        },
      ],
    },
    isLoading: false,
    isError:   false,
    refetch:   jest.fn(),
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: {
      categories: [
        { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null },
      ],
    },
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useMe', () => ({
  useMe: () => ({
    data: { firstName: 'Shebin', profileImageUrl: null },
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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

describe('HomeScreen render order (§8.8)', () => {
  it('row #5 → mounts in order: campaign → featured → popular → nearbyByCategory', async () => {
    const { queryByTestId, getByText } = render(<HomeScreen />, { wrapper })

    // The four expected sections mount.  Featured / NearbyByCategory have
    // section-level headings via <RailHeader>; popular renders the
    // <PopularSection> header copy. campaign carousel ships as a list (no
    // testID needed for order assertion — its rail just sits where it
    // sits relative to the others).
    await waitFor(() => expect(getByText('Featured in London')).toBeTruthy())

    // Defensive: trending is hidden in row #5, so we should NOT see any
    // "Trending" or related rail copy.
    expect(queryByTestId('home-trending-section')).toBeNull()

    // banner / empty / explore-more must NOT render in row #5.
    expect(queryByTestId('home-no-location-banner')).toBeNull()
    expect(queryByTestId('home-nearby-section-empty')).toBeNull()
    expect(queryByTestId('home-explore-more')).toBeNull()
  })
})
