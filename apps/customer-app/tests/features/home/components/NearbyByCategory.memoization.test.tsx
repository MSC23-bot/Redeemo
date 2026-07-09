/**
 * Perf batch 1 (2026-07-09) — Task 1 regression pin.
 *
 * `useAnimatedReaction` is a global no-op stub under jest (tests/setup.ts),
 * so HomeScreen's `headerCollapsed` state can never actually flip inside a
 * unit test — there is no way to drive the real collapse-threshold reaction
 * from a test. Per the perf-batch-1 plan (Task 1 Step 3 fallback), this pins
 * memoization effectiveness at the COMPONENT level instead: a parent
 * re-render that leaves `<NearbyByCategory>`'s props referentially identical
 * must not re-invoke it — and, by extension, must not re-invoke its
 * `<NearbyCard>` children — which is the exact mechanism that stops a
 * `headerCollapsed` flip on the real HomeScreen from re-rendering the feed.
 */
import React from 'react'
import { View, Pressable } from 'react-native'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NearbyByCategory } from '@/features/home/components/NearbyByCategory'
import * as NearbyCardModule from '@/features/home/components/NearbyCard'
import type { HomeNearbyCategoryRail } from '@/lib/api/discovery'
import { makeBranchTile } from '../../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return rtlRender(node, { wrapper: Wrapper })
}

// Stable module-scope fixture (NOT rebuilt inside the harness component) —
// mirrors the referential stability HomeScreen now gets from
// `feed.nearbyByCategoryRails` (React Query only hands back a new reference
// when the underlying data actually changes).
const rails: HomeNearbyCategoryRail[] = [
  {
    category: { id: 'cat-food-drink', name: 'Food & Drink' },
    branches: [
      makeBranchTile({
        id: 'brn-memo-1',
        branchName: 'Memo Branch',
        distance: 500,
        merchant: {
          id: 'm-memo-1',
          businessName: 'Memo Merchant',
          primaryCategory: { id: 'cat-food-drink', name: 'Food & Drink', parentId: null },
          voucherCount: 1,
          maxEstimatedSaving: 5,
          totalEstimatedSaving: 5,
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

describe('NearbyByCategory / NearbyCard — perf batch 1 memoization (Task 1)', () => {
  it('a parent re-render with referentially-identical rails/onBranchPress/onCategoryPress does NOT re-invoke NearbyByCategory or its NearbyCard children', () => {
    const onBranchPress = jest.fn()
    const onCategoryPress = jest.fn()

    // Spy on the memo'd component's underlying render function
    // (`React.memo(fn)` returns `{ type: fn, ... }`) so we can count actual
    // invocations without touching product code.
    const nearbyCardRenderSpy = jest.spyOn(NearbyCardModule.NearbyCard, 'type')

    // Harness holds UNRELATED state (mirrors HomeScreen's headerCollapsed
    // boolean) that re-renders the tree but passes the exact same rails /
    // onBranchPress / onCategoryPress references down every time.
    function Harness() {
      const [, forceRerender] = React.useState(0)
      return (
        <View>
          <Pressable
            testID="force-rerender"
            onPress={() => forceRerender((t) => t + 1)}
          />
          <NearbyByCategory
            rails={rails}
            onBranchPress={onBranchPress}
            onCategoryPress={onCategoryPress}
          />
        </View>
      )
    }

    const { getByTestId } = render(<Harness />)
    expect(nearbyCardRenderSpy).toHaveBeenCalledTimes(1) // initial mount

    // Trigger the unrelated Harness re-render — same shape as a HomeScreen
    // `headerCollapsed` flip re-rendering the screen while the feed-derived
    // props stay referentially stable.
    fireEvent.press(getByTestId('force-rerender'))
    fireEvent.press(getByTestId('force-rerender'))

    // React.memo must have bailed out at the NearbyByCategory boundary, so
    // its NearbyCard child was never re-invoked.
    expect(nearbyCardRenderSpy).toHaveBeenCalledTimes(1)

    nearbyCardRenderSpy.mockRestore()
  })
})
