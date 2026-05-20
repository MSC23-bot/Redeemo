import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { NearbyByCategory } from '@/features/home/components/NearbyByCategory'
import { makeBranchTile } from '../../../fixtures/branchTile'

const sections = [
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
  },
]

describe('NearbyByCategory (Phase 2.3 branch-first)', () => {
  it('section header renders literal "{category.name} near you" copy (Amendment C regression pin §CM, Pin #18)', () => {
    // Phase 2.3 Amendment C pin — lock the current literal section-header
    // copy so §CM closure later is unambiguous.  When the supply-aware rail
    // cascade lands, this assertion will FAIL by design — forcing the §CM
    // PR to explicitly update the header copy per the new scope-aware rules.
    // Today the header concatenates the category name + " near you" — for
    // a fixture category named "Indian Restaurants" the header reads the
    // literal phrase "Indian Restaurants near you".
    const { getByText } = render(
      <NearbyByCategory
        sections={sections}
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
        sections={sections}
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
        sections={sections}
        onBranchPress={jest.fn()}
        onCategoryPress={onCategoryPress}
      />,
    )
    fireEvent.press(getByText('Indian Restaurants near you'))
    expect(onCategoryPress).toHaveBeenCalledWith('cat-indian-restaurants')
  })
})
