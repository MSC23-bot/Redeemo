import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FeaturedCarousel } from '@/features/home/components/FeaturedCarousel'
import { makeBranchTile } from '../../../fixtures/branchTile'

const branches = [
  makeBranchTile({
    id: 'brn-pizza-1',
    branchName: 'Shoreditch',
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

describe('FeaturedCarousel (Phase 2.3 branch-first)', () => {
  it('renders section header with star icon', () => {
    const { getByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={jest.fn()} onSeeAll={jest.fn()} />,
    )
    expect(getByText('Featured')).toBeTruthy()
  })

  it('renders See all link', () => {
    const { getByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={jest.fn()} onSeeAll={jest.fn()} />,
    )
    expect(getByText('See all')).toBeTruthy()
  })

  it('renders branch tiles with FEATURED badge', () => {
    const { getAllByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={jest.fn()} onSeeAll={jest.fn()} />,
    )
    expect(getAllByText('FEATURED')).toHaveLength(2)
  })

  it('returns null when branches array is empty', () => {
    const { toJSON } = render(
      <FeaturedCarousel branches={[]} onBranchPress={jest.fn()} onSeeAll={jest.fn()} />,
    )
    expect(toJSON()).toBeNull()
  })

  it('calls onSeeAll when See all is pressed', () => {
    const onSeeAll = jest.fn()
    const { getByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={jest.fn()} onSeeAll={onSeeAll} />,
    )
    fireEvent.press(getByText('See all'))
    expect(onSeeAll).toHaveBeenCalled()
  })

  it('calls onBranchPress with branch.id when a tile is pressed', () => {
    // Phase 2.3 navigation pin — adapter swaps `id: branch.id`, so the
    // shared <MerchantTile>'s onPress(id) callback fires with the BRANCH
    // id (load-bearing for ?branch=<branchId>&from=home URL contract).
    const onBranchPress = jest.fn()
    const { getByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={onBranchPress} onSeeAll={jest.fn()} />,
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
      <FeaturedCarousel branches={branches} onBranchPress={jest.fn()} onSeeAll={jest.fn()} />,
    )
    expect(getByText(/0\.5 miles away/)).toBeTruthy()
    expect(getByText(/0\.7 miles away/)).toBeTruthy()
  })

  it('section header renders literal "Featured" copy (Amendment C regression pin §CM, Pin #16)', () => {
    // Phase 2.3 Amendment C pin — lock the current literal section-header
    // copy so §CM closure later is unambiguous.  When the supply-aware rail
    // cascade lands, this assertion will FAIL by design — forcing the §CM
    // PR to explicitly update the header copy per the new scope-aware rules.
    // Today the header is the bare word "Featured" — not "Featured near you",
    // not dynamic scope-aware copy.
    const { getByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={jest.fn()} onSeeAll={jest.fn()} />,
    )
    expect(getByText('Featured')).toBeTruthy()
  })

  it('renders one tile per branch for a multi-branch Featured merchant (Covelum fan-out)', () => {
    // Phase 2.3 §M one-pin-per-branch / one-tile-per-branch regression
    // pin — when a Featured merchant has multiple active branches (the
    // canonical owner-flagged Covelum Brightlingsea + Colchester case),
    // FeaturedCarousel must render BOTH as separate <MerchantTile> instances.
    // Tapping either tile fires onBranchPress with the BRANCH id (not the
    // shared merchant id) so URL routing carries branch attribution.
    //
    // Note: the shared <MerchantTile> renders `merchant.businessName`
    // (not branchName) as the headline — so both Covelum tiles surface
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
        branches={covelumBranches}
        onBranchPress={onBranchPress}
        onSeeAll={jest.fn()}
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
