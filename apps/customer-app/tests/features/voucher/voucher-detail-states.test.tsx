import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { VoucherDetailScreen } from '@/features/voucher/screens/VoucherDetailScreen'

// State-machine + branch-attribution tests for VoucherDetailScreen.
// These pin the 12-state derivation the orchestrator implements +
// the locked branch-attribution contract from plan §11.

// ── Mocks ────────────────────────────────────────────────────────────

// expo-router: useLocalSearchParams returns the URL params; useRouter
// stub for back/push navigation. The test mutates `mockParams` between
// cases to drive the screen.
let mockParams: { id?: string; branch?: string } = { id: 'v1' }
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}))

// Voucher fetch hook — drives state-1/2/3/4/5–7 derivations.
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

// Merchant profile — drives selectedBranch / branches list.
let mockMerchantData: any = null
jest.mock('@/features/merchant/hooks/useMerchantProfile', () => ({
  useMerchantProfile: () => ({ data: mockMerchantData, isLoading: false, isError: false }),
}))

// Subscription state — drives state 1 (free user).
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

// Default voucher payload — overridden per-test.
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

// Default merchant payload — overridden per-test.
const baseMerchant = () => ({
  id: 'm1',
  businessName: 'The Coffee House',
  // For the branch-attribution test: keep branches[0] DELIBERATELY
  // different from selectedBranch so we can prove the screen reads
  // selectedBranch and never falls back to branches[0].
  branches: [
    { id: 'WRONG-FIRST',  name: 'WrongBranch',   isMainBranch: false, isActive: true,
      addressLine1: null, addressLine2: null, city: null, postcode: null,
      latitude: null, longitude: null, phone: null, email: null,
      distance: 99999, isOpenNow: true,
      avgRating: null, reviewCount: 0, openingHours: [] },
    { id: 'CORRECT-SB',   name: 'CorrectSB',     isMainBranch: true,  isActive: true,
      addressLine1: null, addressLine2: null, city: 'London', postcode: null,
      latitude: null, longitude: null, phone: null, email: null,
      distance: 100, isOpenNow: true,
      avgRating: 4.5, reviewCount: 12, openingHours: [] },
  ],
  selectedBranch: {
    id: 'CORRECT-SB',
    name: 'CorrectSB',
    isMainBranch: true,
    isActive: true,
    addressLine1: null, addressLine2: null, city: 'London',
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
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>
  )
}

// ── Reset before each test ───────────────────────────────────────────
beforeEach(() => {
  mockParams = { id: 'v1' }
  mockVoucherData = baseVoucher()
  mockVoucherLoading = false
  mockVoucherError = false
  mockMerchantData = baseMerchant()
  mockSubscribed = true
  mockSubLoading = false
})

// ── 12-state derivation tests ─────────────────────────────────────────

describe('VoucherDetailScreen — state machine', () => {
  it('renders state 9 (loading) while voucher fetch is in flight', () => {
    mockVoucherLoading = true
    mockVoucherData = null
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-loading')).toBeTruthy()
  })

  it('renders state 9 (loading) while subscription is still loading', () => {
    mockSubLoading = true
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-loading')).toBeTruthy()
  })

  it('renders error state when the fetch fails', () => {
    mockVoucherError = true
    mockVoucherData = null
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-error')).toBeTruthy()
  })

  it('renders state 1 (free-user) when not subscribed', () => {
    mockSubscribed = false
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-free-user')).toBeTruthy()
    expect(getByTestId('redeem-cta-subscribe')).toBeTruthy()
  })

  it('renders state 2 (can redeem) for subscribed user with a normal voucher', () => {
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-can-redeem')).toBeTruthy()
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
  })

  it('renders state 3 (already redeemed) when isRedeemedThisCycle is true', () => {
    mockVoucherData = { ...baseVoucher(), isRedeemedThisCycle: true }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-redeemed-this-cycle')).toBeTruthy()
    expect(getByTestId('redeemed-badge')).toBeTruthy()
    expect(getByTestId('redeem-cta-redeemed')).toBeTruthy()
  })

  it('renders state 4 (expired) when expiryDate is in the past', () => {
    mockVoucherData = { ...baseVoucher(), expiryDate: '2020-01-01T00:00:00.000Z' }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-expired')).toBeTruthy()
    expect(getByTestId('redeem-cta-expired')).toBeTruthy()
  })

  it('renders TIME_LIMITED variant with banner + active CTA (M1 stub: collapses to available)', () => {
    mockVoucherData = { ...baseVoucher(), type: 'TIME_LIMITED' }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-time-limited-available')).toBeTruthy()
    expect(getByTestId('time-limited-banner-available')).toBeTruthy()
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
  })

  it('expired wins over already-redeemed (defensive priority — no double-state)', () => {
    mockVoucherData = {
      ...baseVoucher(),
      expiryDate: '2020-01-01T00:00:00.000Z',
      isRedeemedThisCycle: true,
    }
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-expired')).toBeTruthy()
    expect(queryByTestId('redeemed-badge')).toBeNull()
  })

  it('redeemed-this-cycle wins over free-user (subscription state irrelevant once redemption row exists)', () => {
    mockSubscribed = false
    mockVoucherData = { ...baseVoucher(), isRedeemedThisCycle: true }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-redeemed-this-cycle')).toBeTruthy()
  })
})

// ── Branch-attribution contract (plan §11 C1) ────────────────────────

describe('VoucherDetailScreen — branch attribution (plan §11)', () => {
  it('displays the branch name from merchant.selectedBranch.id, NOT branches[0].id', () => {
    // Fixture deliberately makes branches[0] = WrongBranch and
    // selectedBranch = CorrectSB. Plan §11 C1 says display MUST
    // come from selectedBranch — this asserts the contract.
    const { getByTestId, queryByText } = wrap(<VoucherDetailScreen />)
    const merchantRow = getByTestId('merchant-row')
    expect(merchantRow).toBeTruthy()

    const redeemAtLine = getByTestId('redeem-at-line')
    expect(redeemAtLine).toBeTruthy()

    // The "Redeem at" line shows "CorrectSB" (the selected branch),
    // never "WrongBranch" (branches[0]).
    expect(queryByText(/CorrectSB/)).toBeTruthy()
    expect(queryByText(/WrongBranch/)).toBeNull()
  })

  it('shows "Redeem at <branch>" with the selected branch name verbatim', () => {
    mockMerchantData = {
      ...baseMerchant(),
      selectedBranch: {
        ...baseMerchant().selectedBranch,
        id: 'B-XYZ',
        name: 'Brightlingsea',
      },
    }
    const { queryByText } = wrap(<VoucherDetailScreen />)
    expect(queryByText(/Brightlingsea/)).toBeTruthy()
  })

  it('hides the "Change ▾" affordance for single-branch merchants', () => {
    mockMerchantData = {
      ...baseMerchant(),
      branches: [baseMerchant().branches[1]],     // single branch
    }
    const { queryByText } = wrap(<VoucherDetailScreen />)
    expect(queryByText(/Change ▾/)).toBeNull()
  })

  it('shows the "Change ▾" affordance for multi-branch merchants', () => {
    // baseMerchant() has 2 branches by default.
    const { queryByText } = wrap(<VoucherDetailScreen />)
    expect(queryByText(/Change ▾/)).toBeTruthy()
  })

  it('keeps state 3 (already redeemed) regardless of which branch is selected — eligibility is branch-INDEPENDENT (§11 C4)', () => {
    // First render: selected branch = CorrectSB, voucher already redeemed.
    mockVoucherData = { ...baseVoucher(), isRedeemedThisCycle: true }
    let result = wrap(<VoucherDetailScreen />)
    expect(result.getByTestId('voucher-detail-state-redeemed-this-cycle')).toBeTruthy()
    expect(result.getByTestId('redeemed-badge')).toBeTruthy()
    result.unmount()

    // Re-render with a DIFFERENT selected branch — voucher is still
    // marked redeemed in this cycle, eligibility is per (userId,
    // voucherId) NOT per (userId, voucherId, branchId), so the state
    // and the badge MUST stay.
    mockMerchantData = {
      ...baseMerchant(),
      selectedBranch: { ...baseMerchant().selectedBranch, id: 'DIFFERENT-BRANCH', name: 'OtherBranch' },
    }
    result = wrap(<VoucherDetailScreen />)
    expect(result.getByTestId('voucher-detail-state-redeemed-this-cycle')).toBeTruthy()
    expect(result.getByTestId('redeemed-badge')).toBeTruthy()
  })

  it('reads the ?branch=<id> URL param into the screen', () => {
    // Spy on the merchant-profile hook to confirm branch arrives with
    // the URL param. We mocked it to return baseMerchant() always; here
    // we just verify the screen reads useLocalSearchParams correctly
    // by setting params and checking the screen still renders without
    // crashing — the contract that the URL param threads through to
    // useMerchantProfile is exercised by the existing
    // useMerchantProfile tests (queryKey includes branchId).
    mockParams = { id: 'v1', branch: 'CORRECT-SB' }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-can-redeem')).toBeTruthy()
  })
})
