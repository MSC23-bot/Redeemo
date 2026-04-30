import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomeScreen } from '@/features/home/screens/HomeScreen'
import { makeMerchantTile } from '../../../fixtures/merchantTile'

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 51.5, lng: -0.1, area: 'Shoreditch', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

// jest.mock factories are hoisted and cannot reference out-of-scope
// variables — except those whose name starts with `mock` (case-insensitive).
const mockFeaturedFixture = makeMerchantTile({
  id: 'm1', businessName: 'Test Pizza',
  primaryCategory: { id: 'c1', name: 'Food', pinColour: null, pinIcon: null },
  voucherCount: 2, maxEstimatedSaving: 10, distance: 500, nearestBranchId: 'b1',
  avgRating: 4.5, reviewCount: 20,
})

jest.mock('@/hooks/useHomeFeed', () => ({
  useHomeFeed: () => ({
    data: {
      locationContext: { city: 'London', source: 'coordinates' },
      featured: [mockFeaturedFixture],
      trending: [],
      campaigns: [],
      nearbyByCategory: [],
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
    await waitFor(() => expect(getByText('Featured')).toBeTruthy())
  })

  it('renders category grid', async () => {
    const { getByText } = render(<HomeScreen />, { wrapper })
    await waitFor(() => expect(getByText('Food & Drink')).toBeTruthy())
  })
})
