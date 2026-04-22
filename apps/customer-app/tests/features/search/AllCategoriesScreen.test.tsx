import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AllCategoriesScreen } from '@/features/search/screens/AllCategoriesScreen'

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [
      { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, merchantCount: 12, parentId: null },
      { id: 'c2', name: 'Beauty', iconUrl: null, pinColour: '#E91E8C', pinIcon: null, merchantCount: 8, parentId: null },
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

  it('renders category items with merchant count', () => {
    const { getByText } = render(<AllCategoriesScreen />, { wrapper })
    expect(getByText('Food & Drink')).toBeTruthy()
    expect(getByText('12 merchants nearby')).toBeTruthy()
  })
})
