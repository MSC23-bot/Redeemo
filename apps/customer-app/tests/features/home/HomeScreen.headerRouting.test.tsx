import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { HomeScreen } from '@/features/home/screens/HomeScreen'
import { makeBranchTile } from '../../fixtures/branchTile'

// §HSH.3 (pre-PR hardening) — brand-header routing + affordance pins.
//
// The brand-coloured Home header must keep its navigation contract:
//   - the full-width search bar routes to /search
//   - the header location row routes to the Your Location screen (/saved-area)
//   - the pinned collapsed brand header mounts
//   - there is NO Filter affordance on Home (Batch 2 M2 removal stays gone)

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status:            'granted',
    location:          { lat: 51.5, lng: -0.1, area: 'Shoreditch', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

const mockBranchFixture = makeBranchTile({
  id:               'brn-1',
  branchName:       'Branch 1',
  branchLocalityId: 'l-london',
  distance:         500,
  avgRating:        4.5,
  reviewCount:      10,
  merchant:         {
    id:                  'm1',
    businessName:        'Merchant 1',
    primaryCategory:     { id: 'c1', name: 'Food', parentId: null },
    voucherCount:        1,
    maxEstimatedSaving:  5,
    totalEstimatedSaving: 5,
  },
})

jest.mock('@/hooks/useHomeFeed', () => ({
  useHomeFeed: () => ({
    data: {
      locationContext:          { city: 'London', source: 'coordinates' },
      campaigns:                [],
      featuredBranches:         [mockBranchFixture],
      trendingBranches:         [],
      nearbyByCategoryBranches: [],
      featuredRail: {
        branches: [mockBranchFixture],
        meta:     { locality: { id: 'l-london', name: 'London' }, scope: 'city', scopeExpanded: false, rungCounts: {} },
      },
      trendingRail:          { branches: [], meta: null },
      popularRail:           { branches: [mockBranchFixture], meta: { locality: null, scope: 'platform', scopeExpanded: true, rungCounts: {} } },
      nearbyByCategoryRails:  [],
    },
    isLoading: false,
    isError:   false,
    refetch:   jest.fn(),
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [{ id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null }] },
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useMe', () => ({
  useMe: () => ({ data: { firstName: 'Mark', profileImageUrl: null } }),
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter:            () => ({ push: mockPush, setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect:       jest.fn(),
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

describe('HomeScreen brand header — routing + affordances (§HSH.3)', () => {
  beforeEach(() => mockPush.mockClear())

  it('search bar tap routes to /search', () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper })
    fireEvent.press(getByTestId('home-search-bar'))
    expect(mockPush).toHaveBeenCalledWith('/search')
  })

  it('header location tap routes to the Your Location screen (/saved-area)', () => {
    // The location row renders in BOTH the expanded header and the pinned
    // collapsed bar (shared <HomeHeaderLocation>); both wire to the same
    // handler. Press the first (expanded) — it must route to /saved-area.
    const { getAllByTestId } = render(<HomeScreen />, { wrapper })
    fireEvent.press(getAllByTestId('home-header-location-button')[0])
    expect(mockPush).toHaveBeenCalledWith('/saved-area')
  })

  it('mounts the pinned collapsed brand header', async () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('home-collapsed-header')).toBeTruthy())
  })

  it('renders NO Filter affordance on Home', () => {
    const { queryByLabelText } = render(<HomeScreen />, { wrapper })
    expect(queryByLabelText('Filter')).toBeNull()
  })
})
