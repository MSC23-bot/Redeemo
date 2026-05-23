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
  it('section header renders the bare category name via <RailHeader railKind="nearbyByCategory">', () => {
    // PR #126 device-QA fixup (2026-05-23): owner-locked drop of the per-
    // category `near you` suffix.  Section header now renders just the
    // category name ("Indian Restaurants") instead of "Indian Restaurants
    // near you" — the rail's local-claim is carried at the tile level by
    // distance + proximity-band chips, and repeating `near you` on every
    // category felt clunky.  See RailHeader.tsx for the full owner
    // direction + rationale.
    const { getByText } = render(
      <NearbyByCategory
        rails={rails}
        onBranchPress={jest.fn()}
        onCategoryPress={jest.fn()}
      />,
    )
    expect(getByText('Indian Restaurants')).toBeTruthy()
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
    fireEvent.press(getByText('Indian Restaurants'))
    expect(onCategoryPress).toHaveBeenCalledWith('cat-indian-restaurants')
  })

  it('v1.5 — cascaded category rail header renders "{Category} on Redeemo"', () => {
    // v1.5 PR #126 device-QA-3 (β1, 2026-05-23): when a category rail has
    // cascaded to platform supply (meta.scopeExpanded === true), the
    // header reads "{Category} on Redeemo" instead of the bare neutral
    // name.  Mirrors Featured cascade framing.
    const cascadedRails: HomeNearbyCategoryRail[] = [
      {
        category: { id: 'cat-restaurants', name: 'Restaurants' },
        branches: [
          makeBranchTile({
            id: 'brn-far-1',
            branchName: 'Distant Restaurant',
            distance: 35_000,
            merchant: {
              id: 'm-far-1',
              businessName: 'Far Restaurant',
              primaryCategory: { id: 'cat-restaurants', name: 'Restaurants', parentId: null },
              voucherCount: 1,
              maxEstimatedSaving: 5,
              totalEstimatedSaving: 5,
            },
          }),
        ],
        meta: {
          locality:      { id: 'l1', name: 'Manchester' },
          scope:         'platform',
          scopeExpanded: true,
          rungCounts:    {},
        },
      },
    ]
    const { getByText } = render(
      <NearbyByCategory
        rails={cascadedRails}
        onBranchPress={jest.fn()}
        onCategoryPress={jest.fn()}
      />,
    )
    expect(getByText('Restaurants on Redeemo')).toBeTruthy()
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
