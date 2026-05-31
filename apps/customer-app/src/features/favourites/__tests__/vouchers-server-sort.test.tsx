/**
 * Phase 3C.1g M2.5 — server-sort invariant pin (spec §9.3).
 *
 * Locked client-rendering invariant: the Vouchers FlatList renders
 * rows in the server-returned order.  The backend (M1.4) computes the
 * Smart 7-bucket global sort + paginates.  Any attempt at client-side
 * re-sort (memoised useEffect, .sort() in render, etc.) is a
 * regression.
 *
 * This test mocks `useFavouriteVouchers` to return a deliberately
 * out-of-priority-order page and asserts the FlatList renders rows
 * in EXACTLY that order — including a bucket-7 (Expired) row at the
 * TOP, which a client-side sort would push to the bottom.
 */

import React from 'react'
import { render } from '@testing-library/react-native'
import type { FavouriteVoucherItem, FavouriteVouchersResponse } from '@/lib/api/favourites'

const mockUseFavouriteBranches = jest.fn()
const mockUseFavouriteVouchers = jest.fn()
const mockUseRemoveFavourite   = jest.fn(() => ({
  remove:     jest.fn(),
  undo:       jest.fn(),
  isPending:  false,
  error:      null,
  clearError: jest.fn(),
}))
const mockUseRouter = jest.fn(() => ({ push: jest.fn(), setParams: jest.fn(), replace: jest.fn(), back: jest.fn() }))
const mockUseLocalSearchParams = jest.fn(() => ({ tab: 'vouchers' }))

jest.mock('../hooks/useFavouriteBranches', () => ({
  useFavouriteBranches: (...args: unknown[]) => mockUseFavouriteBranches(...args),
}))
jest.mock('../hooks/useFavouriteVouchers', () => ({
  useFavouriteVouchers: (...args: unknown[]) => mockUseFavouriteVouchers(...args),
}))
jest.mock('../hooks/useRemoveFavourite', () => ({
  // The real hook is generic over `T extends FavouriteRowLike` but the
  // factory's return shape never reads its T arg.  Calling the mock
  // 0-arg keeps `tsc --noEmit` clean under the generic signature; no
  // test in this file asserts call args on this mock.
  useRemoveFavourite: () => mockUseRemoveFavourite(),
}))
jest.mock('expo-router', () => ({
  useRouter:            () => mockUseRouter(),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  // Wave 6.3 (2026-05-30) — FavouritesScreen uses useFocusEffect
  // for blur-time flushPending wiring.  No-op mock keeps this
  // sort-invariant test focused on its assertion.
  useFocusEffect:       jest.fn(),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('@/design-system/motion/Toast', () => ({ emitToast: jest.fn() }))

import { FavouritesScreen } from '../screens/FavouritesScreen'

function makeVoucher(id: string, priorityBucket: 1|2|3|4|5|6|7, title: string): FavouriteVoucherItem {
  return {
    id, title,
    type: 'BOGO',
    estimatedSaving: 0,
    description: null,
    expiresAt: null,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    isRedeemedInCurrentCycle: false,
    merchant: { id: `m-${id}`, businessName: `Co ${id}`, logoUrl: null, status: 'ACTIVE' },
    favouritedAt: '2026-05-29T10:00:00.000Z',
    isUnavailable: false,
    priorityBucket,
  }
}

beforeEach(() => {
  mockUseFavouriteBranches.mockReturnValue({
    data: { pages: [{ items: [], total: 0, page: 1, limit: 20 }] },
    isLoading: false, isRefetching: false, isFetchingNextPage: false,
    hasNextPage: false, fetchNextPage: jest.fn(), refetch: jest.fn(),
  })
})

describe('FavouritesScreen — server-sort invariant (spec §9.3)', () => {
  it('renders Vouchers FlatList in the server-returned order even when the order is non-priority', () => {
    // Deliberately put bucket 7 (Expired) FIRST and bucket 1 (Urgent)
    // LAST.  If the client re-sorted by priorityBucket asc this test
    // would assert the wrong order — the failing diff is the
    // regression signal.
    const page: FavouriteVouchersResponse = {
      items: [
        makeVoucher('v-EXPIRED',  7, 'Expired voucher'),
        makeVoucher('v-COOLDOWN', 3, 'Cooldown voucher'),
        makeVoucher('v-ACTIVE',   2, 'Active voucher'),
        makeVoucher('v-URGENT',   1, 'Urgent voucher'),
      ],
      total: 4, page: 1, limit: 20,
    }
    mockUseFavouriteVouchers.mockReturnValue({
      data: { pages: [page] },
      isLoading: false, isRefetching: false, isFetchingNextPage: false,
      hasNextPage: false, fetchNextPage: jest.fn(), refetch: jest.fn(),
    })

    const { getAllByTestId } = render(<FavouritesScreen />)
    // Anchor the regex to end-of-id so the inner Remove button
    // (`voucher-card-<id>-remove`, added in Device-QA R1 Wave 2) doesn't
    // bleed into the match set.  The bare card testID is the only thing
    // whose locked order matters for the spec §9.3 server-sort
    // invariant.
    const cards = getAllByTestId(/^voucher-card-v-[A-Z]+$/)
    const orderedIds = cards.map(node => (node.props.testID as string).replace('voucher-card-', ''))

    expect(orderedIds).toEqual(['v-EXPIRED', 'v-COOLDOWN', 'v-ACTIVE', 'v-URGENT'])
  })
})
