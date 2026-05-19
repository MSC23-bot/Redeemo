// Plan 4 M3b follow-up — SearchScreen renders the locality caption
// when meta.effectiveLocality is present, hides when absent.

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { makeBranchTile } from '../../fixtures/branchTile'

// Discovery Rebaseline PR-2 (Phase 2.1) — SearchScreen now reads the
// additive `branches` arm; this caption test ports its fixture to the
// `BranchTile` shape.
const mockTile = makeBranchTile({
  id: 'brn1', branchName: 'Huddersfield',
  branchLocalityName: 'Huddersfield',
  distance: 800,
  avgRating: 4.5,
  reviewCount: 50,
  merchant: {
    id: 'm1',
    businessName: 'Karaara',
    primaryCategory: { id: 'c1', name: 'Food', pinColour: null, pinIcon: null, parentId: null },
    descriptor: 'Indian restaurant',
    voucherCount: 3,
    maxEstimatedSaving: 15,
  },
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
  metaPresent: true as boolean,
}

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => {
    if (!enabled) return { data: undefined, isLoading: false }
    return {
      data: {
        merchants: [],
        total: 0,
        branches: [mockTile],
        totalBranches: 1,
        meta: mockState.metaPresent
          ? {
              ...baseMeta,
              ...(mockState.effectiveLocality !== null
                ? { effectiveLocality: mockState.effectiveLocality }
                : {}),
            }
          : undefined,
      },
      isLoading: false,
    }
  },
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 53.6458, lng: -1.785, area: null, city: null },
    requestPermission: jest.fn(),
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}))

import { SearchScreen } from '@/features/search/screens/SearchScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

async function typeAndSettle(getByPlaceholderText: any) {
  jest.useFakeTimers()
  fireEvent.changeText(getByPlaceholderText('Search merchants...'), 'Pizza')
  await act(async () => { jest.advanceTimersByTime(300) })
  jest.useRealTimers()
}

describe('SearchScreen — effectiveLocality caption (Plan 4 M3b)', () => {
  beforeEach(() => {
    mockState.effectiveLocality = null
    mockState.metaPresent = true
  })

  it('renders "Showing results near {name}" when meta.effectiveLocality is present', async () => {
    mockState.effectiveLocality = { id: 'loc-hud', name: 'Huddersfield' }
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      expect(getByText('Showing results near Huddersfield')).toBeTruthy()
    })
  })

  it('hides the caption when meta.effectiveLocality is absent', async () => {
    mockState.effectiveLocality = null
    const { getByPlaceholderText, queryByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(queryByText(/Showing results near/)).toBeNull())
  })

  it('hides the caption when meta itself is undefined', async () => {
    mockState.metaPresent = false
    const { getByPlaceholderText, queryByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(queryByText(/Showing results near/)).toBeNull())
  })
})
