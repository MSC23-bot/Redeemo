import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { TrendingSection } from '@/features/home/components/TrendingSection'
import type { HomeRail, HomeRailMeta } from '@/lib/api/discovery'
import { makeBranchTile } from '../../../fixtures/branchTile'

const branches = [
  makeBranchTile({
    id:         'brn-trend-1',
    branchName: 'Shoreditch',
    distance:   600,
    avgRating:  4.6,
    reviewCount: 80,
    merchant: {
      id:                   'm-trend-1',
      businessName:         'Sunset Cafe',
      primaryCategory:      { id: 'c1', name: 'Food & Drink', parentId: null },
      voucherCount:         2,
      maxEstimatedSaving:   8,
      totalEstimatedSaving: 16,
    },
  }),
]

const cityMeta: HomeRailMeta = {
  locality:      { id: 'l-london', name: 'London' },
  scope:         'city',
  scopeExpanded: false,
  rungCounts:    {},
}

function makeRail(b: typeof branches, meta: HomeRailMeta | null = cityMeta): HomeRail {
  return { branches: b, meta }
}

describe('TrendingSection (Task D.4 — rail: HomeRail envelope)', () => {
  it('section header renders literal "Trending near you" copy (Amendment C regression pin §CM, Pin #17)', () => {
    // Phase 2.3 Amendment C pin — lock the current literal section-header
    // copy so §CM closure later is unambiguous.  Today the header is the
    // literal phrase "Trending near you".
    const { getByText } = render(
      <TrendingSection rail={makeRail(branches)} onBranchPress={jest.fn()} />,
    )
    expect(getByText('Trending near you')).toBeTruthy()
  })

  it('fires onBranchPress with the branch.id on tile press (Phase 2.3 branch-identity contract)', () => {
    const onBranchPress = jest.fn()
    const { getByText } = render(
      <TrendingSection rail={makeRail(branches)} onBranchPress={onBranchPress} />,
    )
    fireEvent.press(getByText('Sunset Cafe'))
    expect(onBranchPress).toHaveBeenCalledWith('brn-trend-1')
  })

  it('returns null when rail.meta is null (silent hide per §11.6)', () => {
    // Load-bearing for HomeScreen's Trending↔Popular swap — when Trending
    // hides via this branch, HomeScreen swaps in <PopularSection>.
    const { toJSON } = render(
      <TrendingSection rail={{ branches, meta: null }} onBranchPress={jest.fn()} />,
    )
    expect(toJSON()).toBeNull()
  })

  it('returns null when branches array is empty', () => {
    const { toJSON } = render(
      <TrendingSection rail={makeRail([])} onBranchPress={jest.fn()} />,
    )
    expect(toJSON()).toBeNull()
  })
})
