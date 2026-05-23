import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FeaturedCarousel } from '@/features/home/components/FeaturedCarousel'
import type { HomeRail, HomeRailMeta } from '@/lib/api/discovery'
import { makeBranchTile } from '../../../fixtures/branchTile'

// v1.4 (PR #126 device-QA-3, 2026-05-23): branches now pass the §6.4.1
// strict-locality identity ladder against the test meta below — sets
// branchLocalityId === meta.locality.id so the new `allBranchesInLocality`
// check resolves to TRUE, producing "Featured in Huddersfield" copy.
// Pre-v1.4 the tests relied on the loose "any NEARBY+CITY scope = `in {City}`"
// rule, which the v1.4 honesty fix tightened.
const branches = [
  makeBranchTile({
    id: 'brn-pizza-1',
    branchName: 'Shoreditch',
    branchLocalityId: 'l-huddersfield',
    distance: 800,
    avgRating: 4.5,
    reviewCount: 50,
    merchant: {
      id: 'm1',
      businessName: 'Pizza Place',
      primaryCategory: { id: 'c1', name: 'Food & Drink', parentId: null },
      voucherCount: 3,
      maxEstimatedSaving: 15,
      totalEstimatedSaving: 45,
    },
  }),
  makeBranchTile({
    id: 'brn-hair-1',
    branchName: 'Camden',
    branchLocalityId: 'l-huddersfield',
    distance: 1200,
    avgRating: 4.8,
    reviewCount: 30,
    isFavourited: true,
    merchant: {
      id: 'm2',
      businessName: 'Hair Salon',
      primaryCategory: { id: 'c2', name: 'Beauty', parentId: null },
      voucherCount: 2,
      maxEstimatedSaving: 10,
      totalEstimatedSaving: 20,
    },
  }),
]

const huddersfieldMeta: HomeRailMeta = {
  locality:      { id: 'l-huddersfield', name: 'Huddersfield' },
  scope:         'city',
  scopeExpanded: false,
  rungCounts:    {},
}

const platformMeta: HomeRailMeta = {
  locality:      { id: 'l-huddersfield', name: 'Huddersfield' },
  scope:         'platform',
  scopeExpanded: true,
  rungCounts:    {},
}

function makeRail(b: typeof branches, meta: HomeRailMeta = huddersfieldMeta): HomeRail {
  return { branches: b, meta }
}

describe('FeaturedCarousel (Phase C.6 — featuredRail envelope)', () => {
  it('renders <RailHeader> "Featured in Huddersfield" when scopeExpanded=false', () => {
    const { getByText } = render(
      <FeaturedCarousel rail={makeRail(branches)} onBranchPress={jest.fn()} />,
    )
    expect(getByText('Featured in Huddersfield')).toBeTruthy()
  })

  it('renders "Featured on Redeemo" + cascade subtitle when scopeExpanded=true', () => {
    const { getByText } = render(
      <FeaturedCarousel rail={makeRail(branches, platformMeta)} onBranchPress={jest.fn()} />,
    )
    expect(getByText('Featured on Redeemo')).toBeTruthy()
    expect(getByText('Here are the closest matches we have')).toBeTruthy()
  })

  it('renders branch tiles with FEATURED badge', () => {
    const { getAllByText } = render(
      <FeaturedCarousel rail={makeRail(branches)} onBranchPress={jest.fn()} />,
    )
    expect(getAllByText('FEATURED')).toHaveLength(2)
  })

  it('returns null when branches array is empty', () => {
    const { toJSON } = render(
      <FeaturedCarousel rail={makeRail([])} onBranchPress={jest.fn()} />,
    )
    expect(toJSON()).toBeNull()
  })

  it('returns null when rail.meta is null (silent hide per §11.6)', () => {
    const { toJSON } = render(
      <FeaturedCarousel rail={{ branches, meta: null }} onBranchPress={jest.fn()} />,
    )
    expect(toJSON()).toBeNull()
  })

  it('calls onBranchPress with branch.id when a tile is pressed', () => {
    // Phase 2.3 navigation pin — <BranchTile> passes branch.id directly
    // to onPress (load-bearing for ?branch=<branchId>&from=home URL contract).
    const onBranchPress = jest.fn()
    const { getByText } = render(
      <FeaturedCarousel rail={makeRail(branches)} onBranchPress={onBranchPress} />,
    )
    fireEvent.press(getByText('Pizza Place'))
    expect(onBranchPress).toHaveBeenCalledWith('brn-pizza-1')
  })

  it('renders distance via the shared formatDistance helper (§BY Pin #12)', () => {
    // Phase 2.3 §BY regression pin — Home tiles must source their
    // distance string from the shared `formatDistance` helper, NEVER
    // inline.  Fixture branches have `distance: 800` and `distance: 1200`
    // metres.  Shared helper output (locked miles-only contract):
    //   800m  → "0.5 miles away"
    //   1200m → "0.7 miles away"
    // If a future regression introduced inline metres formatting (e.g.
    // "800m") on the Home carousel, these assertions would fail.
    const { getByText } = render(
      <FeaturedCarousel rail={makeRail(branches)} onBranchPress={jest.fn()} />,
    )
    expect(getByText(/0\.5 miles away/)).toBeTruthy()
    expect(getByText(/0\.7 miles away/)).toBeTruthy()
  })

  it('renders one tile per branch for a multi-branch Featured merchant (Covelum fan-out)', () => {
    // Phase 2.3 §M one-pin-per-branch / one-tile-per-branch regression
    // pin — when a Featured merchant has multiple active branches (the
    // canonical owner-flagged Covelum Brightlingsea + Colchester case),
    // FeaturedCarousel must render BOTH as separate <BranchTile> instances.
    // Tapping either tile fires onBranchPress with the BRANCH id (not the
    // shared merchant id) so URL routing carries branch attribution.
    //
    // Note: <BranchTile> renders `branch.merchant.businessName`
    // as the headline — so both Covelum tiles surface
    // the text "Covelum".  We disambiguate by index via getAllByText().
    const covelumBranches = [
      makeBranchTile({
        id: 'brn-covelum-brightlingsea',
        branchName: 'Brightlingsea',
        distance: 1000,
        merchant: {
          id: 'covelum',
          businessName: 'Covelum',
          primaryCategory: { id: 'c-food', name: 'Food & Drink', parentId: null },
          voucherCount: 3,
          maxEstimatedSaving: 12,
          totalEstimatedSaving: 30,
        },
      }),
      makeBranchTile({
        id: 'brn-covelum-colchester',
        branchName: 'Colchester',
        distance: 2400,
        merchant: {
          id: 'covelum',
          businessName: 'Covelum',
          primaryCategory: { id: 'c-food', name: 'Food & Drink', parentId: null },
          voucherCount: 3,
          maxEstimatedSaving: 12,
          totalEstimatedSaving: 30,
        },
      }),
    ]
    const onBranchPress = jest.fn()
    const { getAllByText } = render(
      <FeaturedCarousel
        rail={makeRail(covelumBranches)}
        onBranchPress={onBranchPress}
      />,
    )

    // Both tiles render — the shared merchant name appears twice (one
    // per tile, not collapsed to a single tile).
    const covelumTitles = getAllByText('Covelum')
    expect(covelumTitles).toHaveLength(2)

    // Tapping the FIRST tile (Brightlingsea, in array order) fires
    // onBranchPress with the BRANCH id (not the merchant id "covelum").
    fireEvent.press(covelumTitles[0])
    expect(onBranchPress).toHaveBeenCalledWith('brn-covelum-brightlingsea')

    // Sanity check — pressing the second tile fires the OTHER branch id.
    fireEvent.press(covelumTitles[1])
    expect(onBranchPress).toHaveBeenCalledWith('brn-covelum-colchester')
  })
})
