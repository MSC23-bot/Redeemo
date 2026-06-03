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
      // Health & Medical is a MAPPED category (real card-base + glyph) — it does
      // NOT exercise a placeholder branch. (Corrected: only the unmapped Family &
      // Kids glyph is a placeholder, tracked as a documented non-blocking follow-up.)
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
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/category/[id]', params: { id: 'c1' } })
  })

  it('renders a mapped category (Health & Medical) and routes by slug', () => {
    // Health & Medical has a real card-base + glyph; it renders and routes like
    // any mapped category. (The "placeholder-cross branch" framing was stale —
    // the cross only renders for a slug with a card-base but no glyph, which the
    // 11 same-keyed maps never produce; the real placeholder is the family-kids
    // glyph asset, a documented follow-up.)
    const { getByText, getByLabelText } = render(<AllCategoriesScreen />, { wrapper })
    expect(getByText('Health & Medical')).toBeTruthy()
    fireEvent.press(getByLabelText('Health & Medical category'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/category/[id]', params: { id: 'c3' } })
  })
})
