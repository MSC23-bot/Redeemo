import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchScreen } from '@/features/search/screens/SearchScreen'
import { makeMerchantTile } from '../../fixtures/merchantTile'

// jest.mock factories cannot reference out-of-scope variables — use the
// `mock`-prefixed escape hatch to share the merchant fixture across the
// useSearch mock and the assertions below.
const mockPizzaExpress = makeMerchantTile({
  id: 'm1', businessName: 'Pizza Express',
  primaryCategory: { id: 'c1', name: 'Food', pinColour: null, pinIcon: null },
  voucherCount: 3, maxEstimatedSaving: 15, distance: 800, nearestBranchId: 'b1',
  avgRating: 4.5, reviewCount: 50,
})

const mockMeta = {
  scope:            'city' as const,
  resolvedArea:     'London',
  scopeExpanded:    false,
  nearbyCount:      0,
  cityCount:        1,
  distantCount:     12,
  emptyStateReason: 'none' as const,
}

// Per-scenario state — flipped by individual tests via the controlled flag.
const mockSearchState = {
  scenario: 'happy' as 'happy' | 'empty' | 'expanded' | 'no_uk_supply',
}

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => {
    if (!enabled) return { data: undefined, isLoading: false }
    switch (mockSearchState.scenario) {
      case 'empty':
        return {
          data: { merchants: [], total: 0, meta: { ...mockMeta, emptyStateReason: 'none' } },
          isLoading: false,
        }
      case 'expanded':
        return {
          data: {
            merchants: [mockPizzaExpress], total: 1,
            meta: { ...mockMeta, scopeExpanded: true, emptyStateReason: 'expanded_to_wider' },
          },
          isLoading: false,
        }
      case 'no_uk_supply':
        return {
          data: {
            merchants: [], total: 0,
            meta: { ...mockMeta, nearbyCount: 0, cityCount: 0, distantCount: 0, emptyStateReason: 'no_uk_supply' },
          },
          isLoading: false,
        }
      default:
        return {
          data: { merchants: [mockPizzaExpress], total: 1, meta: mockMeta },
          isLoading: false,
        }
    }
  },
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

async function typeAndSettle(getByPlaceholderText: any, text: string = 'Pizza') {
  jest.useFakeTimers()
  fireEvent.changeText(getByPlaceholderText('Search merchants...'), text)
  await act(async () => { jest.advanceTimersByTime(300) })
  jest.useRealTimers()
}

describe('SearchScreen', () => {
  beforeEach(() => { mockSearchState.scenario = 'happy' })

  it('renders search input', () => {
    const { getByPlaceholderText } = render(<SearchScreen />, { wrapper })
    expect(getByPlaceholderText('Search merchants...')).toBeTruthy()
  })

  it('shows trending searches before typing', () => {
    const { getByText } = render(<SearchScreen />, { wrapper })
    expect(getByText('Trending')).toBeTruthy()
  })

  it('shows results after typing', async () => {
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(getByText('Pizza Express')).toBeTruthy())
  })

  it('renders ScopePillRow with tier counts after typing', async () => {
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      // Locked label set: Nearby, Your city, UK-wide. region is NOT surfaced.
      expect(getByText(/Nearby · 0/)).toBeTruthy()
      expect(getByText(/Your city · 1/)).toBeTruthy()
      expect(getByText(/UK-wide · 12/)).toBeTruthy()
    })
  })

  it('renders "No merchants found" copy when results are empty (reason=none)', async () => {
    mockSearchState.scenario = 'empty'
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(getByText('No merchants found')).toBeTruthy())
  })

  it('renders "No matches in the UK yet" copy when reason=no_uk_supply', async () => {
    mockSearchState.scenario = 'no_uk_supply'
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(getByText(/No matches in the UK yet/)).toBeTruthy())
  })

  it('renders "showing wider results" banner when reason=expanded_to_wider AND results exist', async () => {
    mockSearchState.scenario = 'expanded'
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      expect(getByText(/showing wider results/)).toBeTruthy()
      // banner does not replace results — list still shows
      expect(getByText('Pizza Express')).toBeTruthy()
    })
  })

  it('does NOT surface a "region" pill — only Nearby / Your city / UK-wide', async () => {
    const { getByPlaceholderText, queryByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(queryByText(/Region/i)).toBeNull())
  })
})
