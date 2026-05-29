import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
  VoucherDetailScreen,
  buildReturnUrl,
} from '@/features/voucher/screens/VoucherDetailScreen'

// PR #40 round 5 — back-navigation contract tests.
//
// What this pins (round-5 plan §1):
//   • When pushed from MerchantProfileScreen, Voucher Detail receives
//     `from=merchant&returnMerchantId=<id>&tab=vouchers&branch=<id>`
//     URL params. handleBack uses these EXCLUSIVELY — it does NOT
//     read voucher.merchant.id, so back navigation works even when
//     the voucher query is still loading or has errored.
//   • Cold links / push-notification flows without these params fall
//     through to router.back() (when canGoBack) and finally to
//     router.replace('/(app)/') as a last-resort Discovery default.
//
// pure-function `buildReturnUrl` is unit-tested first, then the
// integration is exercised via the rendered screen + simulated tap.

// ── Pure-function unit tests ─────────────────────────────────────────

describe('buildReturnUrl — pure URL construction', () => {
  it('returns the merchant URL when from=merchant + returnMerchantId + branch are all present', () => {
    expect(
      buildReturnUrl({
        from: 'merchant',
        returnMerchantId: 'm1',
        branch: 'b1',
        tab: 'vouchers',
      }),
    ).toBe('/(app)/merchant/m1?branch=b1&tab=vouchers')
  })

  it('defaults tab to "vouchers" when tab param is absent', () => {
    expect(
      buildReturnUrl({
        from: 'merchant',
        returnMerchantId: 'm1',
        branch: 'b1',
      }),
    ).toBe('/(app)/merchant/m1?branch=b1&tab=vouchers')
  })

  it('encodeURIComponents the merchantId, branchId, and tab', () => {
    expect(
      buildReturnUrl({
        from: 'merchant',
        returnMerchantId: 'm 1/special',
        branch: 'b&1',
        tab: 'vou chers',
      }),
    ).toBe('/(app)/merchant/m%201%2Fspecial?branch=b%261&tab=vou%20chers')
  })

  it('returns null when from is missing', () => {
    expect(buildReturnUrl({ returnMerchantId: 'm1', branch: 'b1' })).toBeNull()
  })

  it('returns null when returnMerchantId is missing', () => {
    expect(buildReturnUrl({ from: 'merchant', branch: 'b1' })).toBeNull()
  })

  it('returns null when branch is missing (cold-open case — no GPS+isMainBranch fallback was hit on the push side)', () => {
    expect(buildReturnUrl({ from: 'merchant', returnMerchantId: 'm1' })).toBeNull()
  })

  it('returns null when from is not "merchant" (defends against future origin tokens)', () => {
    expect(
      buildReturnUrl({ from: 'discovery', returnMerchantId: 'm1', branch: 'b1' }),
    ).toBeNull()
  })

  it('returns null for an empty params object', () => {
    expect(buildReturnUrl({})).toBeNull()
  })
})

// ── Integration tests — screen + handleBack wiring ────────────────────

let mockParams: Record<string, string | undefined> = { id: 'v1' }
const mockReplace = jest.fn()
const mockBack    = jest.fn()
const mockPush    = jest.fn()
const mockCanGoBack = jest.fn(() => true)

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({
      replace: mockReplace,
      push:    mockPush,
      back:    mockBack,
      canGoBack: mockCanGoBack,
    }),
    // Defer the effect to commit phase (via useEffect) so it can
    // call setState without triggering a render-phase loop.
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        try { return effect() } catch { /* defensive */ return undefined }
      }, [])
    },
  }
})

let mockVoucherData: any   = null
let mockVoucherLoading     = false
let mockVoucherError       = false
jest.mock('@/features/voucher/hooks/useCustomerVoucher', () => ({
  useCustomerVoucher: () => ({
    data:      mockVoucherData,
    isLoading: mockVoucherLoading,
    isError:   mockVoucherError,
  }),
}))

jest.mock('@/features/voucher/hooks/useRedeem', () => ({
  useRedeem: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    reset: jest.fn(),
  }),
}))

;(globalThis as any).__voucherProfileMock__ = {
  data: null as any,
  isLoading: false,
  isError: false,
  spy: jest.fn(),
}
jest.mock('@/features/merchant/hooks/useMerchantProfile', () => ({
  useMerchantProfile: (id: string | undefined, opts: any) => {
    const m = (globalThis as any).__voucherProfileMock__
    m.spy(id, opts)
    return { data: m.data, isLoading: m.isLoading, isError: m.isError }
  },
}))

let mockSubscribed = true
let mockSubLoading = false
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    isSubscribed: mockSubscribed,
    isSubLoading: mockSubLoading,
    subscription: null,
  }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ status: 'idle', location: null, requestPermission: jest.fn() }),
}))

const baseVoucher = () => ({
  id: 'v1',
  title: 'BOGO Coffee',
  type: 'BOGO' as const,
  description: 'Buy one, get one free.',
  terms: null,
  imageUrl: null,
  estimatedSaving: 4.5,
  expiryDate: '2030-12-31T23:59:59.000Z',
  code: null,
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  merchant: { id: 'm1', businessName: 'The Coffee House', tradingName: null, logoUrl: null, status: 'ACTIVE' },
  isRedeemedThisCycle: false,
  isFavourited: false,
})

const baseMerchant = () => ({
  id: 'm1',
  businessName: 'The Coffee House',
  branches: [
    { id: 'b1', name: 'CorrectSB', isMainBranch: true, isActive: true,
      addressLine1: null, addressLine2: null, city: null, postcode: null,
      latitude: null, longitude: null, phone: null, email: null,
      distance: 100, isOpenNow: true,
      avgRating: 4.5, reviewCount: 12, openingHours: [] },
  ],
  selectedBranch: {
    id: 'b1', name: 'CorrectSB', isMainBranch: true, isActive: true,
    addressLine1: null, addressLine2: null, city: null,
    postcode: null, country: 'GB',
    latitude: null, longitude: null,
    phone: null, email: null, websiteUrl: null,
    logoUrl: null, bannerUrl: null, about: null,
    openingHours: [],
    photos: [], amenities: [],
    distance: 100, isOpenNow: true,
    avgRating: 4.5, reviewCount: 12,
    myReview: null,
  },
  selectedBranchFallbackReason: 'used-candidate' as const,
})

const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function wrap(ui: React.ReactElement) {
  // Phase 3C.1g M2.10 — QueryClientProvider added so CouponHeader's
  // embedded `<FavouriteHeart>` can call `useFavourite()`.
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  mockParams = { id: 'v1' }
  mockVoucherData    = baseVoucher()
  mockVoucherLoading = false
  mockVoucherError   = false
  mockSubscribed     = true
  mockSubLoading     = false
  mockReplace.mockClear()
  mockBack.mockClear()
  mockPush.mockClear()
  mockCanGoBack.mockReset().mockReturnValue(true)
  ;(globalThis as any).__voucherProfileMock__.data       = baseMerchant()
  ;(globalThis as any).__voucherProfileMock__.isLoading  = false
  ;(globalThis as any).__voucherProfileMock__.isError    = false
})

describe('VoucherDetailScreen — handleBack via URL params', () => {
  it('1. with full return params + voucher LOADED → router.replace to merchant + branch + vouchers tab', () => {
    mockParams = {
      id: 'v1',
      from: 'merchant',
      returnMerchantId: 'm1',
      branch: 'b1',
      tab: 'vouchers',
    }
    const { getAllByLabelText } = wrap(<VoucherDetailScreen />)
    // Two "Go back" buttons exist: hero NavRow + CollapsedHeader.
    // Tap the hero one (first match) — both are wired to handleBack.
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockReplace).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&tab=vouchers')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('2. with full return params + voucher STILL LOADING → router.replace still works (back must NOT depend on voucher load)', () => {
    mockParams = {
      id: 'v1',
      from: 'merchant',
      returnMerchantId: 'm1',
      branch: 'b1',
    }
    mockVoucherLoading = true
    mockVoucherData    = null
    const { getByTestId, getAllByLabelText } = wrap(<VoucherDetailScreen />)
    // Loading state renders FallbackNav (one back button).
    expect(getByTestId('voucher-detail-loading')).toBeTruthy()
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockReplace).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&tab=vouchers')
  })

  it('3. with full return params + voucher ERRORED → router.replace still works', () => {
    mockParams = {
      id: 'v1',
      from: 'merchant',
      returnMerchantId: 'm1',
      branch: 'b1',
    }
    mockVoucherError = true
    mockVoucherData  = null
    const { getByTestId, getAllByLabelText } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-error')).toBeTruthy()
    // Error state has TWO "Go back" elements: the FallbackNav at top
    // AND the in-body errorBack pressable. Both wired to the same
    // handleBack — tap the first (top-nav) to mirror the user's
    // primary back tap.
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockReplace).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&tab=vouchers')
  })

  it('4. without return params + canGoBack=true → router.back() is used', () => {
    mockParams = { id: 'v1' }
    mockCanGoBack.mockReturnValue(true)
    const { getAllByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockBack).toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('5. without return params + canGoBack=false → router.replace to Discovery as last-resort fallback', () => {
    mockParams = { id: 'v1' }
    mockCanGoBack.mockReturnValue(false)
    const { getAllByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockReplace).toHaveBeenCalledWith('/(app)/')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('6. tab param defaults to "vouchers" when absent on the URL', () => {
    mockParams = {
      id: 'v1',
      from: 'merchant',
      returnMerchantId: 'm1',
      branch: 'b1',
      // tab intentionally absent
    }
    const { getAllByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockReplace).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&tab=vouchers')
  })
})
