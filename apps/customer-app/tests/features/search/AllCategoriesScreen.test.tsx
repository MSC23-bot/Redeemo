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
      { id: 'c1', name: 'Food & Drink',    iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null,  merchantCountByCity: { London: 12 }, intentType: 'LOCAL' },
      { id: 'c2', name: 'Beauty',          iconUrl: null, pinColour: '#E91E8C', pinIcon: null, parentId: null,  merchantCountByCity: { London: 8 },  intentType: 'LOCAL' },
      // Health & Medical has no confirmed icon → exercises the placeholder-cross branch.
      { id: 'c3', name: 'Health & Medical', iconUrl: null, pinColour: '#2FA39B', pinIcon: null, parentId: null,  merchantCountByCity: { London: 4 },  intentType: 'LOCAL' },
      // Subcategory — should NOT appear on the AllCategoriesScreen list
      { id: 's1', name: 'Italian',         iconUrl: null, pinColour: null,      pinIcon: null, parentId: 'c1' },
    ] },
    isLoading: false,
  }),
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))

beforeEach(() => mockPush.mockClear())

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

  it('row press routes to /category/[id]', () => {
    const { getByLabelText } = render(<AllCategoriesScreen />, { wrapper })
    fireEvent.press(getByLabelText('Food & Drink category'))
    expect(mockPush).toHaveBeenCalledWith('/category/c1')
  })

  it('renders Health & Medical (placeholder-icon branch) and still routes', () => {
    // No confirmed health-medical icon → AllCategoriesScreen draws the '+'
    // placeholder cross. It must render and route without crashing.
    const { getByText, getByLabelText } = render(<AllCategoriesScreen />, { wrapper })
    expect(getByText('Health & Medical')).toBeTruthy()
    fireEvent.press(getByLabelText('Health & Medical category'))
    expect(mockPush).toHaveBeenCalledWith('/category/c3')
  })
})
