import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomeScreen } from '@/features/home/screens/HomeScreen'
import { makeBranchTile } from '../../../fixtures/branchTile'

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 51.5, lng: -0.1, area: 'Shoreditch', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

// jest.mock factories are hoisted and cannot reference out-of-scope
// variables — except those whose name starts with `mock` (case-insensitive).
const mockFeaturedBranchFixture = makeBranchTile({
  id: 'brn-pizza-1',
  branchName: 'Shoreditch',
  distance: 500,
  avgRating: 4.5,
  reviewCount: 20,
  merchant: {
    id: 'm1',
    businessName: 'Test Pizza',
    primaryCategory: { id: 'c1', name: 'Food', parentId: null },
    voucherCount: 2,
    maxEstimatedSaving: 10,
    totalEstimatedSaving: 20,
  },
})

jest.mock('@/hooks/useHomeFeed', () => ({
  useHomeFeed: () => ({
    data: {
      locationContext: { city: 'London', source: 'coordinates' },
      featured: [],
      trending: [],
      campaigns: [],
      nearbyByCategory: [],
      featuredBranches: [mockFeaturedBranchFixture],
      trendingBranches: [],
      nearbyByCategoryBranches: [],
      featuredRail: {
        branches: [mockFeaturedBranchFixture],
        meta: {
          locality:      { id: 'l-london', name: 'London' },
          scope:         'city',
          scopeExpanded: false,
          rungCounts:    {},
        },
      },
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [{ id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null }] },
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
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('HomeScreen', () => {
  it('renders greeting with user name', async () => {
    const { getByText } = render(<HomeScreen />, { wrapper })
    await waitFor(() => expect(getByText(/Shebin/)).toBeTruthy())
  })

  it('renders featured section', async () => {
    const { getByText } = render(<HomeScreen />, { wrapper })
    // Phase C.6 — section copy is now "Featured in {City}" from <RailHeader>
    // driven by feed.featuredRail.meta.locality.name.
    await waitFor(() => expect(getByText('Featured in London')).toBeTruthy())
  })

  it('renders category grid', async () => {
    const { getByText } = render(<HomeScreen />, { wrapper })
    await waitFor(() => expect(getByText('Food & Drink')).toBeTruthy())
  })
})
