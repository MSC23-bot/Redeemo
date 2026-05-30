/**
 * Phase 3C.1g M2.5 — `<FavouritesScreen>` integration pins.
 *
 * Covers the spec §7.5 contract for the screen orchestrator:
 *   - URL ?tab=places|vouchers drives the active tab.
 *   - Default tab is 'places' when ?tab= is absent or invalid.
 *   - Tab switch calls router.setParams({ tab }) — URL is the source
 *     of truth (deep-linkable + cold-reload resumes).
 *   - Empty list renders <FavouritesEmptyState>; loading state
 *     renders <FavouritesSkeleton>.
 *   - Branch tap routes to /(app)/merchant/[id]?branch=<id>&from=favourites
 *     (locked branch-attribution per spec §4).
 *   - Voucher tap routes to /(app)/voucher/[id]?from=favourites.
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import type { FavouriteBranchItem, FavouriteVoucherItem, FavouriteBranchesResponse, FavouriteVouchersResponse } from '@/lib/api/favourites'

const mockUseFavouriteBranches = jest.fn()
const mockUseFavouriteVouchers = jest.fn()
const mockUseRemoveFavourite   = jest.fn()
const mockSetParams = jest.fn()
const mockPush      = jest.fn()
const mockUseLocalSearchParams = jest.fn()

jest.mock('../hooks/useFavouriteBranches', () => ({
  useFavouriteBranches: (...args: unknown[]) => mockUseFavouriteBranches(...args),
}))
jest.mock('../hooks/useFavouriteVouchers', () => ({
  useFavouriteVouchers: (...args: unknown[]) => mockUseFavouriteVouchers(...args),
}))
jest.mock('../hooks/useRemoveFavourite', () => ({
  useRemoveFavourite: (...args: unknown[]) => mockUseRemoveFavourite(...args),
}))
jest.mock('expo-router', () => {
  // Inline `require('react')` so the mock factory has no out-of-scope
  // identifier complaints from jest's hoist-safety rule.
  const ReactInner = require('react') as typeof import('react')
  return {
    useRouter:            () => ({ push: mockPush, setParams: mockSetParams, replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
    useLocalSearchParams: () => mockUseLocalSearchParams(),
    // Wave 6.3 (2026-05-30) — FavouritesScreen calls
    // useFocusEffect to wire blur-time flush of pending DELETEs.
    // Mock fires the effect synchronously on mount + invokes the
    // returned cleanup on unmount (mirrors production focus/blur
    // semantics for jest).
    useFocusEffect: (cb: () => undefined | (() => void)) => {
      ReactInner.useEffect(() => cb(), [cb])
    },
  }
})
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))
jest.mock('@/design-system/motion/Toast', () => ({ emitToast: jest.fn() }))

import { FavouritesScreen } from '../screens/FavouritesScreen'

function makeBranch(id: string, overrides: Partial<FavouriteBranchItem> = {}): FavouriteBranchItem {
  return {
    id,
    name:               `Branch ${id}`,
    isMainBranch:       true,
    addressLine1:       null,
    addressLine2:       null,
    city:               'Testtown',
    postcode:           'T1 1TT',
    latitude:           null,
    longitude:          null,
    locationConfidence: 'MANUALLY_CONFIRMED',
    merchant: {
      id:              `m-${id}`,
      businessName:    `Merchant ${id}`,
      tradingName:     null,
      logoUrl:         null,
      bannerUrl:       null,
      status:          'ACTIVE',
      primaryCategory: null,
    },
    voucherCount:        0,
    maxEstimatedSaving:  0,
    totalEstimatedSaving: 0,  // Wave 4 #3 — additive field on FavouriteBranchItem
    avgRating:           null,
    reviewCount:         0,
    isOpen:              true,
    isUnavailable:       false,
    favouritedAt:        '2026-05-29T10:00:00.000Z',
    ...overrides,
  }
}

function makeVoucher(id: string, overrides: Partial<FavouriteVoucherItem> = {}): FavouriteVoucherItem {
  return {
    id,
    title:                    `Voucher ${id}`,
    type:                     'BOGO',
    estimatedSaving:          0,
    description:              null,
    expiresAt:                null,
    status:                   'ACTIVE',
    approvalStatus:           'APPROVED',
    isRedeemedInCurrentCycle: false,
    merchant: { id: `m-${id}`, businessName: `Co ${id}`, logoUrl: null, status: 'ACTIVE' },
    favouritedAt:             '2026-05-29T10:00:00.000Z',
    isUnavailable:            false,
    priorityBucket:           2,
    ...overrides,
  }
}

function mountWithData({
  branches = [] as FavouriteBranchItem[],
  vouchers = [] as FavouriteVoucherItem[],
  branchesLoading = false,
  vouchersLoading = false,
  tab = 'places',
}: {
  branches?: FavouriteBranchItem[]
  vouchers?: FavouriteVoucherItem[]
  branchesLoading?: boolean
  vouchersLoading?: boolean
  tab?: string
} = {}) {
  const branchesPage: FavouriteBranchesResponse = { items: branches, total: branches.length, page: 1, limit: 20 }
  const vouchersPage: FavouriteVouchersResponse = { items: vouchers, total: vouchers.length, page: 1, limit: 20 }

  mockUseFavouriteBranches.mockReturnValue({
    data: { pages: [branchesPage] },
    isLoading: branchesLoading, isRefetching: false, isFetchingNextPage: false,
    hasNextPage: false, fetchNextPage: jest.fn(), refetch: jest.fn(),
  })
  mockUseFavouriteVouchers.mockReturnValue({
    data: { pages: [vouchersPage] },
    isLoading: vouchersLoading, isRefetching: false, isFetchingNextPage: false,
    hasNextPage: false, fetchNextPage: jest.fn(), refetch: jest.fn(),
  })
  mockUseRemoveFavourite.mockReturnValue({
    remove: jest.fn(),
    undo: jest.fn(),
    // Wave 6.3 (2026-05-30) — FavouritesScreen useFocusEffect
    // cleanup calls flushPending() on both branches + vouchers
    // hooks.  Mock returns a resolved Promise so the cleanup
    // doesn't dangle.
    flushPending: jest.fn(() => Promise.resolve()),
    isPending: false, error: null, clearError: jest.fn(),
  })
  mockUseLocalSearchParams.mockReturnValue({ tab })

  return render(<FavouritesScreen />)
}

beforeEach(() => {
  mockUseFavouriteBranches.mockReset()
  mockUseFavouriteVouchers.mockReset()
  mockUseRemoveFavourite.mockReset()
  mockSetParams.mockReset()
  mockPush.mockReset()
  mockUseLocalSearchParams.mockReset()
})

describe('FavouritesScreen — tab routing', () => {
  it("defaults to 'places' when ?tab= is absent", () => {
    const { getByTestId, queryByTestId } = mountWithData({ tab: '' })
    expect(getByTestId('favourites-places-list')).toBeTruthy()
    expect(queryByTestId('favourites-vouchers-list')).toBeNull()
  })

  it("renders Vouchers list when ?tab=vouchers", () => {
    const { getByTestId, queryByTestId } = mountWithData({ tab: 'vouchers' })
    expect(getByTestId('favourites-vouchers-list')).toBeTruthy()
    expect(queryByTestId('favourites-places-list')).toBeNull()
  })

  it("normalises an unknown ?tab= value back to 'places'", () => {
    const { getByTestId } = mountWithData({ tab: 'whatever' })
    expect(getByTestId('favourites-places-list')).toBeTruthy()
  })

  it("tap on Vouchers tab calls router.setParams({ tab: 'vouchers' })", () => {
    const { getByTestId } = mountWithData({ tab: 'places' })
    fireEvent.press(getByTestId('favourites-tab-vouchers'))
    expect(mockSetParams).toHaveBeenCalledWith({ tab: 'vouchers' })
  })
})

describe('FavouritesScreen — header counts', () => {
  it('header shows "Merchants · N" + "Vouchers · M" labels driven by `total`', () => {
    // Device-QA R1 (2026-05-30): user-facing copy reads "Merchants",
    // not the spec §8 "Places".  Internal tab key stays 'places' for
    // URL / cache stability.
    const { getByLabelText } = mountWithData({
      branches: [makeBranch('b-1'), makeBranch('b-2')],
      vouchers: [makeVoucher('v-1')],
      tab: 'places',
    })
    expect(getByLabelText('Merchants · 2')).toBeTruthy()
    expect(getByLabelText('Vouchers · 1')).toBeTruthy()
  })
})

describe('FavouritesScreen — empty + loading states', () => {
  it('shows the Places skeleton when branchesQuery.isLoading', () => {
    const { getByTestId } = mountWithData({ branchesLoading: true, tab: 'places' })
    expect(getByTestId('favourites-skeleton')).toBeTruthy()
  })

  it('shows the Vouchers skeleton when vouchersQuery.isLoading + tab=vouchers', () => {
    const { getByTestId } = mountWithData({ vouchersLoading: true, tab: 'vouchers' })
    expect(getByTestId('favourites-skeleton')).toBeTruthy()
  })

  it('shows the Places empty state when no rows and not loading', () => {
    const { getByTestId } = mountWithData({ tab: 'places' })
    expect(getByTestId('favourites-empty-places')).toBeTruthy()
  })

  it('shows the Vouchers empty state when no rows and not loading', () => {
    const { getByTestId } = mountWithData({ tab: 'vouchers' })
    expect(getByTestId('favourites-empty-vouchers')).toBeTruthy()
  })
})

describe('FavouritesScreen — row tap routing (locked branch-attribution per spec §4)', () => {
  it("branch tap → /(app)/merchant/<merchantId>?branch=<branchId>&from=favourites", () => {
    const { getByTestId } = mountWithData({
      branches: [makeBranch('br-A')],
      tab: 'places',
    })
    fireEvent.press(getByTestId('branch-card-br-A'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/merchant/m-br-A?branch=br-A&from=favourites')
  })

  it("voucher tap → /(app)/voucher/<id>?from=favourites", () => {
    const { getByTestId } = mountWithData({
      vouchers: [makeVoucher('v-7')],
      tab: 'vouchers',
    })
    fireEvent.press(getByTestId('voucher-card-v-7'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/voucher/v-7?from=favourites')
  })
})

// ── §W6.3 (2026-05-30) — blur-time flushPending wiring ───────────────
//
// Owner-reported symptom: user removes the last favourited merchant +
// immediately taps "Discover merchants" → Home shows the still-
// favourited heart because the 4s undo-window timer hasn't fired yet.
// Fix: FavouritesScreen calls `useRemoveFavourite.flushPending()` on
// useFocusEffect cleanup so blur (navigation away from the screen)
// deterministically flushes any pending DELETEs.
describe('FavouritesScreen — §W6.3 flushPending on blur', () => {
  it('calls flushPending on BOTH branches + vouchers hooks when the screen unmounts (blur)', () => {
    const flushBranches = jest.fn(() => Promise.resolve())
    const flushVouchers = jest.fn(() => Promise.resolve())
    // useRemoveFavourite is called with 'branch' first, then 'voucher'
    // in FavouritesScreen.  We can't trivially branch the mock by
    // call args without more harness, so we make the mock return
    // different stubs in call order.
    let call = 0
    mockUseRemoveFavourite.mockImplementation(() => {
      call += 1
      const flush = call === 1 ? flushBranches : flushVouchers
      return { remove: jest.fn(), undo: jest.fn(), flushPending: flush, isPending: false, error: null, clearError: jest.fn() }
    })
    mockUseFavouriteBranches.mockReturnValue({
      data: { pages: [{ items: [], total: 0, page: 1, limit: 20 }] },
      isLoading: false, isRefetching: false, isFetchingNextPage: false,
      hasNextPage: false, fetchNextPage: jest.fn(), refetch: jest.fn(),
    })
    mockUseFavouriteVouchers.mockReturnValue({
      data: { pages: [{ items: [], total: 0, page: 1, limit: 20 }] },
      isLoading: false, isRefetching: false, isFetchingNextPage: false,
      hasNextPage: false, fetchNextPage: jest.fn(), refetch: jest.fn(),
    })
    mockUseLocalSearchParams.mockReturnValue({ tab: 'places' })

    const { unmount } = render(<FavouritesScreen />)
    // Trigger blur — in our mocked useFocusEffect, the cleanup fires
    // on unmount.
    unmount()

    expect(flushBranches).toHaveBeenCalledTimes(1)
    expect(flushVouchers).toHaveBeenCalledTimes(1)
  })

  // ── §W6.4-D (2026-05-30) — useFocusEffect deps stability ────────────
  //
  // Owner-reported symptom on Wave 6.3 ship: undo countdown bar
  // disappears in ~1 second instead of the 4-second window — the
  // remove fires too quickly and the user can't read or undo.
  //
  // Root cause: pre-Wave-6.4-D the FavouritesScreen useFocusEffect
  // deps were `[removeBranch, removeVoucher]`.  Those are the
  // objects returned by `useRemoveFavourite()` — which builds a
  // fresh object on every render.  So the deps changed on every
  // re-render, useFocusEffect treated each as a blur+focus cycle,
  // and `flushPending()` fired immediately on the optimistic-splice
  // re-render (long before the 4s timer).
  //
  // Fix: stash `flushPending` callbacks in refs, pass EMPTY deps
  // to useFocusEffect so it only fires on real focus/blur.
  it('§W6.4-D — useFocusEffect cleanup fires ONLY on unmount, NOT on every render', () => {
    const flushBranches = jest.fn(() => Promise.resolve())
    const flushVouchers = jest.fn(() => Promise.resolve())
    let call = 0
    mockUseRemoveFavourite.mockImplementation(() => {
      call += 1
      const flush = call % 2 === 1 ? flushBranches : flushVouchers
      // Fresh object identity on every call — same as the real
      // hook.  Pre-Wave-6.4-D this would trigger the cleanup
      // every render.
      return { remove: jest.fn(), undo: jest.fn(), flushPending: flush, isPending: false, error: null, clearError: jest.fn() }
    })
    mockUseFavouriteBranches.mockReturnValue({
      data: { pages: [{ items: [], total: 0, page: 1, limit: 20 }] },
      isLoading: false, isRefetching: false, isFetchingNextPage: false,
      hasNextPage: false, fetchNextPage: jest.fn(), refetch: jest.fn(),
    })
    mockUseFavouriteVouchers.mockReturnValue({
      data: { pages: [{ items: [], total: 0, page: 1, limit: 20 }] },
      isLoading: false, isRefetching: false, isFetchingNextPage: false,
      hasNextPage: false, fetchNextPage: jest.fn(), refetch: jest.fn(),
    })
    mockUseLocalSearchParams.mockReturnValue({ tab: 'places' })

    const { rerender, unmount } = render(<FavouritesScreen />)
    // Force several re-renders — none should trigger the cleanup
    // (flushPending).  Pre-Wave-6.4-D this would fire 3+ times.
    rerender(<FavouritesScreen />)
    rerender(<FavouritesScreen />)
    rerender(<FavouritesScreen />)
    expect(flushBranches).not.toHaveBeenCalled()
    expect(flushVouchers).not.toHaveBeenCalled()

    // Now unmount — cleanup fires exactly once.
    unmount()
    expect(flushBranches).toHaveBeenCalledTimes(1)
    expect(flushVouchers).toHaveBeenCalledTimes(1)
  })
})
