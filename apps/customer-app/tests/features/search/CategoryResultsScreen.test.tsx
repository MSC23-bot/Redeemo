import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CategoryResultsScreen } from '@/features/search/screens/CategoryResultsScreen'

jest.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({
    data: { merchants: [{ id: 'm1', businessName: 'Test', tradingName: null, logoUrl: null, bannerUrl: null, primaryCategory: { id: 'c1', name: 'Food' }, subcategory: null, voucherCount: 2, maxEstimatedSaving: 10, distance: 500, nearestBranchId: 'b1', avgRating: 4.2, reviewCount: 15, isFavourited: false }], total: 1, limit: 20, offset: 0 },
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [{ id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, merchantCount: 12, parentId: null }] },
  }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ location: { lat: 51.5, lng: -0.1 } }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'c1' }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('CategoryResultsScreen', () => {
  it('renders merchant results', async () => {
    const { getByText } = render(<CategoryResultsScreen />, { wrapper })
    await waitFor(() => expect(getByText('Test')).toBeTruthy())
  })
})
