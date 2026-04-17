import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchScreen } from '@/features/search/screens/SearchScreen'

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => ({
    data: enabled ? { merchants: [{ id: 'm1', businessName: 'Pizza Express', tradingName: null, logoUrl: null, bannerUrl: null, primaryCategory: { id: 'c1', name: 'Food' }, subcategory: null, voucherCount: 3, maxEstimatedSaving: 15, distance: 800, nearestBranchId: 'b1', avgRating: 4.5, reviewCount: 50, isFavourited: false }], total: 1, limit: 20, offset: 0 } : undefined,
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 51.5, lng: -0.1, area: 'Shoreditch', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('SearchScreen', () => {
  it('renders search input', () => {
    const { getByPlaceholderText } = render(<SearchScreen />, { wrapper })
    expect(getByPlaceholderText('Search merchants...')).toBeTruthy()
  })

  it('shows trending searches before typing', () => {
    const { getByText } = render(<SearchScreen />, { wrapper })
    expect(getByText('Trending')).toBeTruthy()
  })

  it('shows results after typing', async () => {
    jest.useFakeTimers()
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    fireEvent.changeText(getByPlaceholderText('Search merchants...'), 'Pizza')
    await act(async () => { jest.advanceTimersByTime(300) })
    await waitFor(() => expect(getByText('Pizza Express')).toBeTruthy())
    jest.useRealTimers()
  })
})
