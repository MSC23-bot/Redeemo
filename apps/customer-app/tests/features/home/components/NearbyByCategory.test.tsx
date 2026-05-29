import React from 'react'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NearbyByCategory } from '@/features/home/components/NearbyByCategory'
import type { HomeNearbyCategoryRail } from '@/lib/api/discovery'
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
  it('section header renders the parent-category label via homeCategoryRailLabel (v1.6)', () => {
    // v1.6 PR #126 device-QA-4 (2026-05-23): rail groupings are PARENT-
    // category (e.g. "Food & Drink", "Beauty & Wellness").  The display
    // copy passes through `homeCategoryRailLabel` to produce sentence-case
    // + " picks" so the rail header does not feel like a duplicate of the
    // top category navigation grid.  Fixture above carries "Indian
    // Restaurants" as a stand-in parent name → expected display is
    // "Indian restaurants picks".
    const { getByText } = render(
      <NearbyByCategory
        rails={rails}
        onBranchPress={jest.fn()}
        onCategoryPress={jest.fn()}
      />,
    )
    expect(getByText('Indian restaurants picks')).toBeTruthy()
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
    // v1.6: rail label is now "Indian restaurants picks" (parent-style
    // labelling) — but the press still resolves to the underlying
    // rail.category.id, not the leaf merchant name.
    fireEvent.press(getByText('Indian restaurants picks'))
    expect(onCategoryPress).toHaveBeenCalledWith('cat-indian-restaurants')
  })

  it('v1.6 — cascaded category rail header uses the SAME label rule (no "on Redeemo" suffix; banner does that work)', () => {
    // v1.6 PR #126 device-QA-4 (2026-05-23) supersedes v1.5: cascade rails
    // no longer append "on Redeemo" per-rail — the <NearbyContextBanner>
    // already carries the platform-claim message.  Local + cascade rails
    // share `homeCategoryRailLabel()` → "{Sentence-cased parent} picks".
    const cascadedRails: HomeNearbyCategoryRail[] = [
      {
        category: { id: 'cat-food-drink', name: 'Food & Drink' },
        branches: [
          makeBranchTile({
            id: 'brn-far-1',
            branchName: 'Distant Restaurant',
            distance: 35_000,
            merchant: {
              id: 'm-far-1',
              businessName: 'Far Restaurant',
              primaryCategory: { id: 'cat-food-drink', name: 'Food & Drink', parentId: null },
              voucherCount: 1,
              maxEstimatedSaving: 5,
              totalEstimatedSaving: 5,
            },
          }),
          makeBranchTile({
            id: 'brn-far-2',
            branchName: 'Other Distant Restaurant',
            distance: 40_000,
            merchant: {
              id: 'm-far-2',
              businessName: 'Other Far Restaurant',
              primaryCategory: { id: 'cat-food-drink', name: 'Food & Drink', parentId: null },
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
    const { getByText, queryByText } = render(
      <NearbyByCategory
        rails={cascadedRails}
        onBranchPress={jest.fn()}
        onCategoryPress={jest.fn()}
      />,
    )
    expect(getByText('Food & drink picks')).toBeTruthy()
    // Negative pin: the retired v1.5 "on Redeemo" suffix must NOT appear.
    expect(queryByText('Food & Drink on Redeemo')).toBeNull()
  })

  it('v1.6 — "See all" chip HIDES on one-card rails (rail.branches.length < 2)', () => {
    // v1.6 PR #126 device-QA-4 (2026-05-23) owner direction: a one-card
    // rail with a "See all" chip implies more merchants behind it, which
    // is misleading when the parent category genuinely has only one
    // merchant nearby.  Threshold: only render the chip when
    // branches.length >= 2.  Header text itself remains tappable for
    // completeness (just without the chevron promise).
    const oneCardRails: HomeNearbyCategoryRail[] = [
      {
        category: { id: 'cat-shopping', name: 'Shopping' },
        branches: [
          makeBranchTile({
            id: 'brn-shop-1',
            branchName: 'Solo Boutique',
            distance: 800,
            merchant: {
              id: 'm-shop-1',
              businessName: 'Solo Boutique',
              primaryCategory: { id: 'cat-shopping', name: 'Shopping', parentId: null },
              voucherCount: 1,
              maxEstimatedSaving: 3,
              totalEstimatedSaving: 3,
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
    const { queryByText, getByText } = render(
      <NearbyByCategory
        rails={oneCardRails}
        onBranchPress={jest.fn()}
        onCategoryPress={jest.fn()}
      />,
    )
    // Header label still renders.
    expect(getByText('Shopping picks')).toBeTruthy()
    // The "See all" chip is suppressed on a one-card rail.
    expect(queryByText('See all')).toBeNull()
  })

  it('v1.6 — "See all" chip SHOWS on multi-card rails (rail.branches.length >= 2)', () => {
    // v1.6 PR #126 device-QA-4 (2026-05-23): positive pin — the chip
    // must still render on rails with ≥ 2 branches.  Re-uses the
    // multi-branch cascade fixture above (Food & Drink, 2 branches).
    const multiCardRails: HomeNearbyCategoryRail[] = [
      {
        category: { id: 'cat-food-drink', name: 'Food & Drink' },
        branches: [
          makeBranchTile({
            id: 'brn-fd-1',
            branchName: 'First Restaurant',
            distance: 500,
            merchant: {
              id: 'm-fd-1',
              businessName: 'First Restaurant',
              primaryCategory: { id: 'cat-food-drink', name: 'Food & Drink', parentId: null },
              voucherCount: 1,
              maxEstimatedSaving: 5,
              totalEstimatedSaving: 5,
            },
          }),
          makeBranchTile({
            id: 'brn-fd-2',
            branchName: 'Second Restaurant',
            distance: 900,
            merchant: {
              id: 'm-fd-2',
              businessName: 'Second Restaurant',
              primaryCategory: { id: 'cat-food-drink', name: 'Food & Drink', parentId: null },
              voucherCount: 1,
              maxEstimatedSaving: 4,
              totalEstimatedSaving: 4,
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
    const { getByText } = render(
      <NearbyByCategory
        rails={multiCardRails}
        onBranchPress={jest.fn()}
        onCategoryPress={jest.fn()}
      />,
    )
    expect(getByText('See all')).toBeTruthy()
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
