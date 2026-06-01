import React from 'react'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PopularSection } from '@/features/home/components/PopularSection'
import type { HomeRail, HomeRailMeta } from '@/lib/api/discovery'
import { makeBranchTile } from '../../../fixtures/branchTile'

// Phase 3C.1g M2.7 — embedded `<BranchTile>` renders `<FavouriteHeart>`
// which needs a `<QueryClientProvider>` in scope.
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return rtlRender(node, { wrapper: Wrapper })
}

// Task D.4 — Spec §11.7.
//
// `<PopularSection>` is the sibling rail that fires when Trending is empty
// OR when no effective location is resolved. Header copy is fixed ("Popular
// on Redeemo") via RailHeader's `fixedCopy` prop, NOT scope-driven.
//
// Distance/proximity chips MUST auto-hide on tiles built with
// `supplyRung: null / proximityBand: null / distanceMetres: null` (the
// no-location branch of `buildPopularRail`).  When classifiable tiles flow
// through (the "Trending empty, effLoc resolved" branch), the chip renders
// per the shared <BranchTile> contract.

const platformMeta: HomeRailMeta = {
  locality:      null,
  scope:         'platform',
  scopeExpanded: false,
  rungCounts:    {},
}

function makeRail(branches: HomeRail['branches'], meta: HomeRailMeta | null = platformMeta): HomeRail {
  return { branches, meta }
}

describe('<PopularSection>', () => {
  it('renders "Popular on Redeemo" header via fixedCopy', () => {
    const branches = [
      makeBranchTile({
        id:             'brn-pop-1',
        branchName:     'Soho',
        supplyRung:     null,
        proximityBand:  null,
        distanceMetres: null,
        distance:       null,
        merchant: {
          id:                   'm-pop-1',
          businessName:         'Test Cafe',
          primaryCategory:      { id: 'c1', name: 'Food & Drink', parentId: null },
          voucherCount:         2,
          maxEstimatedSaving:   8,
          totalEstimatedSaving: 16,
        },
      }),
    ]
    const { getByText } = render(
      <PopularSection rail={makeRail(branches)} onBranchPress={jest.fn()} />,
    )
    expect(getByText('Popular on Redeemo')).toBeTruthy()
  })

  it('Batch 2 M4 — renders inside the warm-tint band with a trending flame + subtitle', () => {
    const branches = [
      makeBranchTile({
        id:         'brn-pop-band',
        branchName: 'Soho',
        merchant: {
          id:                   'm-pop-band',
          businessName:         'Band Cafe',
          primaryCategory:      { id: 'c1', name: 'Food & Drink', parentId: null },
          voucherCount:         1,
          maxEstimatedSaving:   5,
          totalEstimatedSaving: 5,
        },
      }),
    ]
    const { getByTestId, getByText } = render(
      <PopularSection rail={makeRail(branches)} onBranchPress={jest.fn()} />,
    )
    expect(getByTestId('popular-band')).toBeTruthy()
    expect(getByTestId('rail-trending-mark')).toBeTruthy()
    expect(getByText('Most-redeemed near you')).toBeTruthy()
  })

  it('with null rung/band/distance tiles → tiles render WITHOUT distance/proximity chip', () => {
    const branches = [
      makeBranchTile({
        id:             'brn-pop-null',
        branchName:     'Camden',
        supplyRung:     null,
        proximityBand:  null,
        distanceMetres: null,
        distance:       null,
        merchant: {
          id:                   'm-pop-null',
          businessName:         'Null Bistro',
          primaryCategory:      { id: 'c1', name: 'Food & Drink', parentId: null },
          voucherCount:         3,
          maxEstimatedSaving:   12,
          totalEstimatedSaving: 36,
        },
      }),
    ]
    const { queryByText } = render(
      <PopularSection rail={makeRail(branches)} onBranchPress={jest.fn()} />,
    )
    // The shared <BranchTile> uses `formatDistance` (returns '' for null)
    // and <ProximityBandChip> (returns null for null).  No miles label and
    // no proximity-band chip label should render.
    // v1.9 PR #126 device-QA-6 (2026-05-23): NEAREST_ON_REDEEMO copy flipped
    // to 'Nearest match on Redeemo'; negative pin updated.
    expect(queryByText(/miles away/)).toBeNull()
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Nearest match on Redeemo')).toBeNull()
  })

  it('with classifiable tiles → distance/proximity chip renders', () => {
    const branches = [
      makeBranchTile({
        id:             'brn-pop-class',
        branchName:     'Shoreditch',
        supplyRung:     'CATCHMENT',
        proximityBand:  'IN_YOUR_AREA',
        distanceMetres: 1200,
        distance:       1200,
        branchCity:     'London',
        merchant: {
          id:                   'm-pop-class',
          businessName:         'Distance Diner',
          primaryCategory:      { id: 'c1', name: 'Food & Drink', parentId: null },
          voucherCount:         1,
          maxEstimatedSaving:   5,
          totalEstimatedSaving: 5,
        },
      }),
    ]
    const { getByText, getAllByText } = render(
      <PopularSection rail={makeRail(branches)} onBranchPress={jest.fn()} />,
    )
    // Batch 1B Tier 3 — the shared <BranchTile> renders the COMPACT
    // distance via formatDistanceCompact: 1200m → "0.7 mi" on info line 2.
    expect(getByText(/0\.7 mi/)).toBeTruthy()
    // Batch 1B: 'In your area' now renders as the inline proximity clause
    // inside the BranchTile info line. The standalone ProximityBandChip is
    // retired. Pin assertion: exactly ONE Text node contains the string.
    expect(getAllByText('In your area')).toHaveLength(1)
  })

  it('returns null when rail.meta is null (silent hide per §11.6)', () => {
    const { toJSON } = render(
      <PopularSection rail={{ branches: [], meta: null }} onBranchPress={jest.fn()} />,
    )
    expect(toJSON()).toBeNull()
  })

  it('fires onBranchPress with the branch.id on tile press', () => {
    const branches = [
      makeBranchTile({
        id:             'brn-pop-tap',
        branchName:     'Bristol',
        supplyRung:     null,
        proximityBand:  null,
        distanceMetres: null,
        distance:       null,
        merchant: {
          id:                   'm-pop-tap',
          businessName:         'Tap Cafe',
          primaryCategory:      { id: 'c1', name: 'Food & Drink', parentId: null },
          voucherCount:         2,
          maxEstimatedSaving:   6,
          totalEstimatedSaving: 12,
        },
      }),
    ]
    const onBranchPress = jest.fn()
    const { getByText } = render(
      <PopularSection rail={makeRail(branches)} onBranchPress={onBranchPress} />,
    )
    fireEvent.press(getByText('Tap Cafe'))
    expect(onBranchPress).toHaveBeenCalledWith('brn-pop-tap')
  })
})
