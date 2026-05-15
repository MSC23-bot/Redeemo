// Plan 4 M3b follow-up — CategoryResultsScreen renders the locality
// caption when meta.effectiveLocality is present, hides when absent.

import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { makeMerchantTile } from '../../fixtures/merchantTile'

const mockTile = makeMerchantTile({
  id: 'm1', businessName: 'Test Merchant',
  primaryCategory: { id: 'c1', name: 'Food', pinColour: null, pinIcon: null },
  voucherCount: 2, maxEstimatedSaving: 10, distance: 500, nearestBranchId: 'b1',
  avgRating: 4.2, reviewCount: 15,
})

const baseMeta = {
  scope:            'city' as const,
  resolvedArea:     'Huddersfield',
  scopeExpanded:    false,
  nearbyCount:      1,
  cityCount:        0,
  distantCount:     0,
  emptyStateReason: 'none' as const,
}

const mockState = {
  effectiveLocality: null as null | { id: string; name: string },
}

jest.mock('@/hooks/useCategoryMerchants', () => ({
  useCategoryMerchants: (id: string | null) => ({
    data: id
      ? {
          merchants: [mockTile],
          total: 1,
          meta: {
            ...baseMeta,
            ...(mockState.effectiveLocality !== null
              ? { effectiveLocality: mockState.effectiveLocality }
              : {}),
          },
        }
      : undefined,
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({ data: undefined, isLoading: false }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: {
      categories: [
        { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null, intentType: 'LOCAL' },
      ],
    },
  }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ location: { lat: 53.6458, lng: -1.785 } }),
}))

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: () => ({ data: { amenities: [] }, isLoading: false }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'c1' }),
}))

import { CategoryResultsScreen } from '@/features/search/screens/CategoryResultsScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('CategoryResultsScreen — effectiveLocality caption (Plan 4 M3b)', () => {
  beforeEach(() => { mockState.effectiveLocality = null })

  it('renders "Showing results near {name}" when meta.effectiveLocality is present', async () => {
    mockState.effectiveLocality = { id: 'loc-hud', name: 'Huddersfield' }
    const { getByText } = render(<CategoryResultsScreen />, { wrapper })
    await waitFor(() => {
      expect(getByText('Showing results near Huddersfield')).toBeTruthy()
    })
  })

  it('hides the caption when meta.effectiveLocality is absent', async () => {
    mockState.effectiveLocality = null
    const { queryByText } = render(<CategoryResultsScreen />, { wrapper })
    await waitFor(() => expect(queryByText(/Showing results near/)).toBeNull())
  })
})
