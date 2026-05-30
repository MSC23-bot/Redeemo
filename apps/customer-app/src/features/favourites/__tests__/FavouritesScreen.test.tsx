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
jest.mock('expo-router', () => ({
  useRouter:            () => ({ push: mockPush, setParams: mockSetParams, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}))
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
    voucherCount:       0,
    maxEstimatedSaving: 0,
    avgRating:          null,
    reviewCount:        0,
    isOpen:             true,
    isUnavailable:      false,
    favouritedAt:       '2026-05-29T10:00:00.000Z',
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
    remove: jest.fn(), undo: jest.fn(), isPending: false, error: null, clearError: jest.fn(),
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
