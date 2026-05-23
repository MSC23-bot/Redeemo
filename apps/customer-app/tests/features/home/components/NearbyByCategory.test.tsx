import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { NearbyByCategory } from '@/features/home/components/NearbyByCategory'
import type { HomeNearbyCategoryRail } from '@/lib/api/discovery'
import { makeBranchTile } from '../../../fixtures/branchTile'

// Phase E (Task E.2) — `<NearbyByCategory>` migrated from the legacy
// `sections: { category, branches }[]` prop to the new `rails:
// HomeNearbyCategoryRail[]` envelope.  Per-category header copy now flows
// through `<RailHeader railKind="nearbyByCategory">` with conditional copy
// driven by `rail.meta.locality.name`.

const rails: HomeNearbyCategoryRail[] = [
  {
    category: { id: 'cat-indian-restaurants', name: 'Indian Restaurants' },
    branches: [
      makeBranchTile({
        id: 'brn-curry-1',
        branchName: 'Brick Lane',
        distance: 700,
        merchant: {
          id: 'm-curry-1',
          businessName: 'Karaara Tandoor',
          primaryCategory: {
            id: 'cat-indian-restaurants',
            name: 'Indian Restaurants',
            parentId: null,
          },
          voucherCount: 2,
          maxEstimatedSaving: 12,
          totalEstimatedSaving: 22,
        },
      }),
    ],
    meta: {
      locality:      { id: 'l1', name: 'Huddersfield' },
      scope:         'city',
      scopeExpanded: false,
      rungCounts:    {},
    },
  },
]

describe('NearbyByCategory (Phase E rails envelope)', () => {
  it('section header renders literal "{category.name} near you" copy via <RailHeader railKind="nearbyByCategory">', () => {
    // Phase 2.3 Amendment C pin (Pin #18) preserved through Phase E — the
    // RailHeader implementation today returns `${categoryName} near you`
    // when `railKind === 'nearbyByCategory'` and a `categoryName` is
    // supplied. For a fixture category named "Indian Restaurants" the
    // header reads the literal phrase "Indian Restaurants near you".
    const { getByText } = render(
      <NearbyByCategory
        rails={rails}
        onBranchPress={jest.fn()}
        onCategoryPress={jest.fn()}
      />,
    )
    expect(getByText('Indian Restaurants near you')).toBeTruthy()
  })

  it('fires onBranchPress with the branch.id on tile press (Phase 2.3 branch-identity contract)', () => {
    const onBranchPress = jest.fn()
    const { getByText } = render(
      <NearbyByCategory
        rails={rails}
        onBranchPress={onBranchPress}
        onCategoryPress={jest.fn()}
      />,
    )
    fireEvent.press(getByText('Karaara Tandoor'))
    expect(onBranchPress).toHaveBeenCalledWith('brn-curry-1')
  })

  it('fires onCategoryPress with the category.id on header press (existing nav contract preserved)', () => {
    const onCategoryPress = jest.fn()
    const { getByText } = render(
      <NearbyByCategory
        rails={rails}
        onBranchPress={jest.fn()}
        onCategoryPress={onCategoryPress}
      />,
    )
    fireEvent.press(getByText('Indian Restaurants near you'))
    expect(onCategoryPress).toHaveBeenCalledWith('cat-indian-restaurants')
  })

  it('returns null when every rail has meta=null (defensive guard against contract drift)', () => {
    const driftedRails: HomeNearbyCategoryRail[] = [
      {
        category: rails[0]!.category,
        branches: rails[0]!.branches,
        meta:     null,
      },
    ]
    const { toJSON } = render(
      <NearbyByCategory
        rails={driftedRails}
        onBranchPress={jest.fn()}
        onCategoryPress={jest.fn()}
      />,
    )
    expect(toJSON()).toBeNull()
  })

  it('returns null when rails array is empty', () => {
    const { toJSON } = render(
      <NearbyByCategory
        rails={[]}
        onBranchPress={jest.fn()}
        onCategoryPress={jest.fn()}
      />,
    )
    expect(toJSON()).toBeNull()
  })
})
