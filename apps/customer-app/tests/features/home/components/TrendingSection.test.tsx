import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { TrendingSection } from '@/features/home/components/TrendingSection'
import { makeBranchTile } from '../../../fixtures/branchTile'

const branches = [
  makeBranchTile({
    id: 'brn-trend-1',
    branchName: 'Shoreditch',
    distance: 600,
    avgRating: 4.6,
    reviewCount: 80,
    merchant: {
      id: 'm-trend-1',
      businessName: 'Sunset Cafe',
      primaryCategory: { id: 'c1', name: 'Food & Drink', parentId: null },
      voucherCount: 2,
      maxEstimatedSaving: 8,
      totalEstimatedSaving: 16,
    },
  }),
]

describe('TrendingSection (Phase 2.3 branch-first)', () => {
  it('section header renders literal "Trending near you" copy (Amendment C regression pin §CM, Pin #17)', () => {
    // Phase 2.3 Amendment C pin — lock the current literal section-header
    // copy so §CM closure later is unambiguous.  When the supply-aware rail
    // cascade lands, this assertion will FAIL by design — forcing the §CM
    // PR to explicitly update the header copy per the new scope-aware rules.
    // Today the header is the literal phrase "Trending near you".
    const { getByText } = render(
      <TrendingSection branches={branches} onBranchPress={jest.fn()} />,
    )
    expect(getByText('Trending near you')).toBeTruthy()
  })

  it('fires onBranchPress with the branch.id on tile press (Phase 2.3 branch-identity contract)', () => {
    const onBranchPress = jest.fn()
    const { getByText } = render(
      <TrendingSection branches={branches} onBranchPress={onBranchPress} />,
    )
    fireEvent.press(getByText('Sunset Cafe'))
    expect(onBranchPress).toHaveBeenCalledWith('brn-trend-1')
  })
})
