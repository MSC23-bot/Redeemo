import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { VoucherDetailScreen } from '@/features/voucher/screens/VoucherDetailScreen'

// PR #40 round 15 — Voucher Detail free-user state contract.
//
// Spec: docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md
//   §4  (Screen 2 — Voucher Detail Free User)
//   §11 ("Free user taps voucher → Sees Screen 2")
//
// Locked behaviour the tests pin:
//   • Free user can BROWSE the voucher (coupon header + body + merchant
//     row + terms + fair use). Same layout as Screen 1 minus How It Works.
//   • No "How It Works" section (user can't redeem yet).
//   • Sticky CTA: navy background, "Subscribe to Redeem · £6.99/mo".
//   • Tapping the CTA navigates to /(auth)/subscription-prompt.
//   • No PIN entry, no redeem mutation path.

// ── Stable router mock so we can assert push calls ────────────────────

let mockParams: Record<string, string | undefined> = { id: 'v1' }
const mockPush    = jest.fn()
const mockReplace = jest.fn()
const mockBack    = jest.fn()

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push:    mockPush,
    replace: mockReplace,
    back:    mockBack,
    canGoBack: () => true,
  }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    try { effect() } catch { /* defensive */ }
  },
}))

// Voucher / merchant / subscription / location mocks ────────────────────

let mockVoucherData: any = null
let mockVoucherLoading = false
let mockVoucherError = false
jest.mock('@/features/voucher/hooks/useCustomerVoucher', () => ({
  useCustomerVoucher: () => ({
    data:      mockVoucherData,
    isLoading: mockVoucherLoading,
    isError:   mockVoucherError,
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

let mockSubscribed = false
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
  title: 'Free Filter Coffee with Any Thali',
  type: 'FREEBIE' as const,
  description: 'Order any thali plate and get a complimentary South Indian filter coffee.',
  terms: 'In-house only. Cannot be combined with other offers. Once per cycle.',
  imageUrl: null,
  estimatedSaving: 2.5,
  expiryDate: null,
  code: null,
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  merchant: { id: 'm1', businessName: 'Covelum Restaurant', tradingName: null, logoUrl: null, status: 'ACTIVE' },
  isRedeemedThisCycle: false,
  isFavourited: false,
})

const baseMerchant = () => ({
  id: 'm1',
  businessName: 'Covelum Restaurant',
  branches: [
    {
      id: 'b1', name: 'Covelum — Brightlingsea',
      isMainBranch: true, isActive: true,
      addressLine1: null, addressLine2: null, city: 'Brightlingsea',
      postcode: null, latitude: null, longitude: null,
      phone: null, email: null,
      distance: 100, isOpenNow: true,
      avgRating: 4.6, reviewCount: 12, openingHours: [],
    },
  ],
  selectedBranch: {
    id: 'b1', name: 'Covelum — Brightlingsea',
    isMainBranch: true, isActive: true,
    addressLine1: null, addressLine2: null, city: 'Brightlingsea',
    postcode: null, country: 'GB',
    latitude: null, longitude: null,
    phone: null, email: null, websiteUrl: null,
    logoUrl: null, bannerUrl: null, about: null,
    openingHours: [],
    photos: [], amenities: [],
    distance: 100, isOpenNow: true,
    avgRating: 4.6, reviewCount: 12,
    myReview: null,
  },
  selectedBranchFallbackReason: 'used-candidate' as const,
  descriptor: 'Indian Restaurant',
})

const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function wrap(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>)
}

beforeEach(() => {
  mockParams = { id: 'v1' }
  mockVoucherData    = baseVoucher()
  mockVoucherLoading = false
  mockVoucherError   = false
  mockSubscribed     = false   // FREE USER for this whole file
  mockSubLoading     = false
  mockPush.mockClear()
  mockReplace.mockClear()
  mockBack.mockClear()
  ;(globalThis as any).__voucherProfileMock__.data       = baseMerchant()
  ;(globalThis as any).__voucherProfileMock__.isLoading  = false
  ;(globalThis as any).__voucherProfileMock__.isError    = false
})

// ── State + chrome contracts ─────────────────────────────────────────

describe('Voucher Detail — free-user state (Screen 2 per spec §4)', () => {
  it('renders the free-user state when isSubscribed=false', () => {
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-free-user')).toBeTruthy()
  })

  it('still renders the coupon (header + body) so the user can browse the voucher', () => {
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('coupon-header')).toBeTruthy()
    expect(getByTestId('coupon-top-card')).toBeTruthy()
    expect(getByTestId('coupon-body')).toBeTruthy()
  })

  it('still renders the merchant row + REDEEM AT branch attribution panel', () => {
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('merchant-row')).toBeTruthy()
    expect(getByTestId('redeem-at-line')).toBeTruthy()
  })
})

// ── No How It Works on free-user state ───────────────────────────────

describe('Voucher Detail — free-user state hides How It Works (spec §4)', () => {
  it('does NOT render the How It Works section for a free user', () => {
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('how-it-works')).toBeNull()
  })

  it('DOES render How It Works for a subscribed user (regression check — only free-user state hides it)', () => {
    mockSubscribed = true
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('how-it-works')).toBeTruthy()
  })
})

// ── Subscribe CTA contract ───────────────────────────────────────────

describe('Voucher Detail — free-user CTA routes to subscription-prompt', () => {
  it('renders the subscribe CTA testID (no redeem CTA)', () => {
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('redeem-cta-subscribe')).toBeTruthy()
    // Active redeem path must NOT be rendered for free users.
    expect(queryByTestId('redeem-cta-active')).toBeNull()
    expect(queryByTestId('redeem-cta-redeemed')).toBeNull()
    expect(queryByTestId('redeem-cta-expired')).toBeNull()
  })

  it('tapping the subscribe CTA navigates to /(auth)/subscription-prompt', () => {
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-subscribe'))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/subscription-prompt')
  })
})
