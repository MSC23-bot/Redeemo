// Plan 4 M4.5 — SearchScreen header copy variants for searchChip.
//
// §M4-AMENDMENT-2026-05-22 A1 Path 5b: NO standalone <SearchChip>
// component.  The existing unified header at SearchScreen.tsx reads
// `branchMeta.searchChip` and renders one of three copy variants:
//
//   searchChip.mode === 'PLACE': `Offers in <Place>`
//     (q IS the place — drop the "Results for X" framing because q ===
//      the matched Locality name)
//
//   searchChip.mode === 'TAG':   `<Tag> offers near <Locality>` /
//                                 `<Tag> offers` (when locality absent)
//
//   searchChip === null:         existing `Results / Closest matches`
//                                 behaviour unchanged (pinned by
//                                 `SearchScreen.locality.test.tsx`).
//
// This file pins the PLACE + TAG branches.  null is covered by
// SearchScreen.locality.test.tsx.

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { makeBranchTile } from '../../fixtures/branchTile'

const mockTile = makeBranchTile({
  id: 'brn1', branchName: 'Test Branch',
  distance: 800,
  merchant: { id: 'm1', businessName: 'Covelum', voucherCount: 3, maxEstimatedSaving: 12 },
})

const baseMeta = {
  scope:            'platform' as const,
  resolvedArea:     'United Kingdom',
  scopeExpanded:    false,
  nearbyCount:      0,
  cityCount:        0,
  distantCount:     1,
  emptyStateReason: 'none' as const,
}

const mockState = {
  effectiveLocality: null as null | { id: string; name: string },
  searchChip:        null as null | { mode: 'PLACE' | 'TAG'; label: string },
}

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => {
    if (!enabled) return { data: undefined, isLoading: false }
    const builtMeta = {
      ...baseMeta,
      ...(mockState.effectiveLocality !== null
        ? { effectiveLocality: mockState.effectiveLocality }
        : {}),
      ...(mockState.searchChip !== null
        ? { searchChip: mockState.searchChip }
        : {}),
    }
    return {
      data: {
        branches:      [mockTile],
        totalBranches: 1,
        branchMeta:    builtMeta,
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
  useRouter:            () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

import { SearchScreen } from '@/features/search/screens/SearchScreen'

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

async function typeAndSettle(getByPlaceholderText: any, term: string) {
  jest.useFakeTimers()
  fireEvent.changeText(getByPlaceholderText('Search merchants...'), term)
  await act(async () => { jest.advanceTimersByTime(300) })
  jest.useRealTimers()
}

describe('SearchScreen — searchChip header copy variants (Plan 4 M4.5)', () => {
  beforeEach(() => {
    mockState.effectiveLocality = null
    mockState.searchChip        = null
  })

  it('PLACE mode: renders "Offers in <Place>" (drops the "Results for X" framing)', async () => {
    mockState.searchChip        = { mode: 'PLACE', label: 'Brightlingsea' }
    mockState.effectiveLocality = { id: 'loc-br', name: 'Brightlingsea' }
    const { getByPlaceholderText, getByText, queryByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Brightlingsea')
    await waitFor(() => {
      expect(getByText('Offers in Brightlingsea')).toBeTruthy()
    })
    // The legacy "Results for X" copy must NOT appear on the PLACE path —
    // q IS the place, so "Results for 'Brightlingsea'" would read as
    // a tautology / mid-flow stop word.
    expect(queryByText(/Results for "Brightlingsea"/)).toBeNull()
    expect(queryByText(/near Brightlingsea/)).toBeNull()
  })

  it('TAG mode + locality present: renders "<Tag> offers near <Locality>"', async () => {
    mockState.searchChip        = { mode: 'TAG', label: 'Brunch' }
    mockState.effectiveLocality = { id: 'loc-hud', name: 'Huddersfield' }
    const { getByPlaceholderText, getByText, queryByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Brunch')
    await waitFor(() => {
      expect(getByText('Brunch offers near Huddersfield')).toBeTruthy()
    })
    expect(queryByText(/Results for "Brunch"/)).toBeNull()
  })

  it('TAG mode + no locality: renders bare "<Tag> offers"', async () => {
    mockState.searchChip        = { mode: 'TAG', label: 'Halal' }
    mockState.effectiveLocality = null
    const { getByPlaceholderText, getByText, queryByText } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Halal')
    await waitFor(() => {
      expect(getByText('Halal offers')).toBeTruthy()
    })
    expect(queryByText(/near/)).toBeNull()
    expect(queryByText(/Results for "Halal"/)).toBeNull()
  })
})
