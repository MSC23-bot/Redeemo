// Tier 1 polish PR (2026-05-22) — §CS Phase A pin.
//
// Locks the CategoryResultsScreen loading-empty behaviour:
//   - while loading + branches.length === 0: 6-row skeleton renders
//   - settled + branches.length > 0:           skeleton GONE, BranchTile rows render
//   - settled + branches.length === 0:         skeleton GONE, EmptyStateMessage renders
//
// Distinct from CategoryResultsScreen.test.tsx (which pins routing,
// scope-pill counts, sort caption, etc.).  Re-uses the same hook
// mocking pattern (jest.mock factory captures mockState ref so per-test
// state flips work).

import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CategoryResultsScreen } from '@/features/search/screens/CategoryResultsScreen'
import { makeBranchTile } from '../../fixtures/branchTile'

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
  nearbyCount:      0,
  cityCount:        0,
  distantCount:     0,
  emptyStateReason: 'none',
}

const mockState = {
  intentType:          'LOCAL' as 'LOCAL' | 'DESTINATION' | 'MIXED',
  categoryHookData:    undefined as any,
  categoryHookLoading: true,
  searchHookData:      null as any,
}

const mockRouteParams: { id: string | undefined } = { id: 'c1' }

jest.mock('@/hooks/useCategoryMerchants', () => ({
  useCategoryMerchants: (id: string | null) => ({
    data:      id ? mockState.categoryHookData : undefined,
    isLoading: id ? mockState.categoryHookLoading : false,
  }),
}))

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, _enabled: boolean) => ({
    data: null,
    isLoading: false,
  }),
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
  useUserLocation: () => ({ location: { lat: 51.5, lng: -0.1 } }),
}))

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: () => ({ data: { amenities: [] }, isLoading: false }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockRouteParams,
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('CategoryResultsScreen — loading skeleton (§CS Phase A)', () => {
  beforeEach(() => {
    mockState.intentType          = 'LOCAL'
    mockState.categoryHookData    = undefined
    mockState.categoryHookLoading = true
    mockRouteParams.id            = 'c1'
  })

  it('renders 6 skeleton rows while isLoading && branches.length === 0', () => {
    const { getAllByTestId } = render(<CategoryResultsScreen />, { wrapper })
    expect(getAllByTestId('category-results-skeleton-row')).toHaveLength(6)
  })

  it('does NOT render skeleton once loaded with branches', () => {
    mockState.categoryHookLoading = false
    mockState.categoryHookData    = {
      merchants:     [],
      total:         1,
      meta:          mockMeta,
      branches:      [makeBranchTile({ id: 'b1', merchant: { businessName: 'Loaded' } })],
      totalBranches: 1,
      branchMeta:    mockMeta,
    }
    const { queryAllByTestId, getByText } = render(<CategoryResultsScreen />, { wrapper })
    expect(queryAllByTestId('category-results-skeleton-row')).toHaveLength(0)
    expect(getByText('Loaded')).toBeTruthy()
  })

  it('does NOT render skeleton when settled with empty results — renders empty-state copy instead', () => {
    mockState.categoryHookLoading = false
    mockState.categoryHookData    = {
      merchants:     [],
      total:         0,
      meta:          mockMeta,
      branches:      [],
      totalBranches: 0,
      branchMeta:    mockMeta,
    }
    const { queryAllByTestId, getByText } = render(<CategoryResultsScreen />, { wrapper })
    expect(queryAllByTestId('category-results-skeleton-row')).toHaveLength(0)
    expect(getByText('No merchants found')).toBeTruthy()
  })
})
