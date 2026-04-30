import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CategoryResultsScreen } from '@/features/search/screens/CategoryResultsScreen'
import { makeMerchantTile } from '../../fixtures/merchantTile'

const mockTile = makeMerchantTile({
  id: 'm1', businessName: 'Test Merchant',
  primaryCategory: { id: 'c1', name: 'Food', pinColour: null, pinIcon: null },
  voucherCount: 2, maxEstimatedSaving: 10, distance: 500, nearestBranchId: 'b1',
  avgRating: 4.2, reviewCount: 15,
})

type EmptyReason = 'none' | 'expanded_to_wider' | 'no_uk_supply'
type Scope = 'nearby' | 'city' | 'region' | 'platform'
const mockMeta: {
  scope: Scope
  resolvedArea: string
  scopeExpanded: boolean
  nearbyCount: number
  cityCount: number
  distantCount: number
  emptyStateReason: EmptyReason
} = {
  scope:            'city',
  resolvedArea:     'London',
  scopeExpanded:    false,
  nearbyCount:      5,
  cityCount:        12,
  distantCount:     30,
  emptyStateReason: 'none',
}

// Per-test toggles for which hook's mock returns data + the intentType on the
// looked-up category. Captured at call time so tests can flip them before
// rendering.
const mockState = {
  intentType:        'LOCAL'   as 'LOCAL' | 'DESTINATION' | 'MIXED',
  categoryHookData:  { merchants: [mockTile], total: 1, meta: mockMeta },
  searchHookData:    null as any,
}

jest.mock('@/hooks/useCategoryMerchants', () => ({
  useCategoryMerchants: (id: string | null) => ({
    data: id ? mockState.categoryHookData : undefined,
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => ({
    data: enabled ? mockState.searchHookData : undefined,
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: {
      categories: [
        { id: 'c1', name: 'Food & Drink',  iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null,  intentType: mockState.intentType },
        { id: 'c2', name: 'Travel & Hotels', iconUrl: null, pinColour: null,    pinIcon: null, parentId: null,  intentType: 'DESTINATION' },
        { id: 's1', name: 'Italian',       iconUrl: null, pinColour: null,    pinIcon: null, parentId: 'c1' },
        { id: 's2', name: 'Pizza',         iconUrl: null, pinColour: null,    pinIcon: null, parentId: 'c1' },
      ],
    },
  }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ location: { lat: 51.5, lng: -0.1 } }),
}))

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: () => ({ data: { amenities: [] }, isLoading: false }),
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
  beforeEach(() => {
    mockState.intentType        = 'LOCAL'
    mockState.categoryHookData  = { merchants: [mockTile], total: 1, meta: mockMeta }
    mockState.searchHookData    = null
  })

  it('renders merchant results from useCategoryMerchants by default', async () => {
    const { getByText } = render(<CategoryResultsScreen />, { wrapper })
    await waitFor(() => expect(getByText('Test Merchant')).toBeTruthy())
  })

  it('renders the locked LOCAL/MIXED sort caption "Default: nearby first"', () => {
    mockState.intentType = 'LOCAL'
    const { getByText } = render(<CategoryResultsScreen />, { wrapper })
    expect(getByText('Default: nearby first')).toBeTruthy()
  })

  it('renders the DESTINATION sort caption "Default: best-rated nearby first" for DESTINATION categories', () => {
    mockState.intentType = 'DESTINATION'
    const { getByText } = render(<CategoryResultsScreen />, { wrapper })
    expect(getByText('Default: best-rated nearby first')).toBeTruthy()
  })

  it('renders ScopePillRow with tier counts from meta', () => {
    const { getByText } = render(<CategoryResultsScreen />, { wrapper })
    expect(getByText(/Nearby · 5/)).toBeTruthy()
    expect(getByText(/Your city · 12/)).toBeTruthy()
    expect(getByText(/UK-wide · 30/)).toBeTruthy()
  })

  it('renders empty-state copy when category-hook returns 0 merchants (reason=none)', () => {
    mockState.categoryHookData = {
      merchants: [],
      total: 0,
      meta: { ...mockMeta, emptyStateReason: 'none' },
    }
    const { getByText } = render(<CategoryResultsScreen />, { wrapper })
    expect(getByText('No merchants found')).toBeTruthy()
  })

  it('renders the wider-results banner when reason=expanded_to_wider AND results exist', () => {
    mockState.categoryHookData = {
      merchants: [mockTile],
      total: 1,
      meta: { ...mockMeta, scopeExpanded: true, emptyStateReason: 'expanded_to_wider' },
    }
    const { getByText } = render(<CategoryResultsScreen />, { wrapper })
    expect(getByText(/showing wider results/)).toBeTruthy()
    expect(getByText('Test Merchant')).toBeTruthy()  // results still rendered
  })

  it('renders "No matches in the UK yet" copy when reason=no_uk_supply', () => {
    mockState.categoryHookData = {
      merchants: [],
      total: 0,
      meta: { ...mockMeta, nearbyCount: 0, cityCount: 0, distantCount: 0, emptyStateReason: 'no_uk_supply' },
    }
    const { getByText } = render(<CategoryResultsScreen />, { wrapper })
    expect(getByText(/No matches in the UK yet/)).toBeTruthy()
  })

  it('exposes a Filters button (entry point to FilterSheet)', () => {
    const { getByLabelText } = render(<CategoryResultsScreen />, { wrapper })
    expect(getByLabelText('Open filters')).toBeTruthy()
  })

  it('exposes a Back button (returns to Home / previous screen)', () => {
    const { getByLabelText } = render(<CategoryResultsScreen />, { wrapper })
    expect(getByLabelText('Go back')).toBeTruthy()
  })
})
