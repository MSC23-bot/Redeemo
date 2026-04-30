import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AllCategoriesScreen } from '@/features/search/screens/AllCategoriesScreen'

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [
      // PR B fixtures use Plan-1.5 fields. `merchantCount` (singular) is
      // intentionally absent — it doesn't exist on the API response, only
      // `merchantCountByCity` does. The broken count line was removed in
      // M4 per owner decision #5.
      { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null,  merchantCountByCity: { London: 12 }, intentType: 'LOCAL' },
      { id: 'c2', name: 'Beauty',       iconUrl: null, pinColour: '#E91E8C', pinIcon: null, parentId: null,  merchantCountByCity: { London: 8 },  intentType: 'LOCAL' },
      // Subcategory — should NOT appear on the AllCategoriesScreen list
      { id: 's1', name: 'Italian',      iconUrl: null, pinColour: null,      pinIcon: null, parentId: 'c1' },
    ] },
    isLoading: false,
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('AllCategoriesScreen', () => {
  it('renders title', () => {
    const { getByText } = render(<AllCategoriesScreen />, { wrapper })
    expect(getByText('All Categories')).toBeTruthy()
  })

  it('renders top-level category names', () => {
    const { getByText } = render(<AllCategoriesScreen />, { wrapper })
    expect(getByText('Food & Drink')).toBeTruthy()
    expect(getByText('Beauty')).toBeTruthy()
  })

  it('does NOT render subcategories (parentId !== null filtered out)', () => {
    const { queryByText } = render(<AllCategoriesScreen />, { wrapper })
    expect(queryByText('Italian')).toBeNull()
  })

  it('does NOT render the broken "{count} merchants nearby" line (decision #5)', () => {
    const { queryByText } = render(<AllCategoriesScreen />, { wrapper })
    expect(queryByText(/merchants nearby/)).toBeNull()
    expect(queryByText('undefined merchants nearby')).toBeNull()
  })
})
