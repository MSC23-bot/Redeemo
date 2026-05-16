// §O7 regression — voucher-tap inside the keepPreviousData refetch window.
//
// Bug: MerchantProfileScreen.handleVoucherPress used to read the branch id
// from `merchant.selectedBranch.id`. Under React Query's `keepPreviousData`
// in `useMerchantProfile`, that field reflects the PREVIOUS branch during
// the ~1s window between (a) `select(newBranchId)` flipping the URL and
// (b) the new fetch resolving. A user who taps a voucher inside that
// window would get the previous branch baked into the voucher URL —
// wrong attribution.
//
// Fix (PR #40 round 23): read the branch id from the URL via
// `useBranchSelection().branchId` instead. The URL reflects user intent
// the instant they tap. Fall back to `merchant.selectedBranch.id` only
// when the URL has no branch (cold-open before reconcile fires).
//
// This file pins both halves of the contract so the bug can't silently
// regress.

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

// Lean component mocks — the test only needs the VouchersTab fire path
// + a way to assert router.push was called with the right URL.
jest.mock('@/features/merchant/components/HeroSection', () => ({
  HeroBackdrop: () => null,
  HeroNav:      () => null,
  HeroBannerSpacer: () => null,
  HERO_HEIGHT:  256,
}))
jest.mock('@/features/merchant/components/CollapsedHeader',  () => ({ CollapsedHeader:  () => null }))
jest.mock('@/features/merchant/components/MerchantHeadline', () => ({ MerchantHeadline: () => null }))
jest.mock('@/features/merchant/components/MerchantDescriptor', () => ({ MerchantDescriptor: () => null }))
jest.mock('@/features/merchant/components/MetaRow',          () => ({ MetaRow:          () => null }))
jest.mock('@/features/merchant/components/ActionRow',        () => ({ ActionRow:        () => null }))
jest.mock('@/features/merchant/components/BranchContextBand', () => ({
  BranchContextBand: ({ children }: any) => {
    const { View } = require('react-native')
    return <View>{children}</View>
  },
}))
jest.mock('@/features/merchant/components/TabBar', () => ({
  TabBar: () => null,
}))
jest.mock('@/features/merchant/components/VouchersTab', () => ({
  VouchersTab: ({ onVoucherPress }: { onVoucherPress: (id: string) => void }) => {
    const { Pressable, Text } = require('react-native')
    return (
      <Pressable accessibilityLabel="tap-voucher" onPress={() => onVoucherPress('v1')}>
        <Text>VOUCHERS_TAB</Text>
      </Pressable>
    )
  },
}))
jest.mock('@/features/merchant/components/AboutTab',    () => ({ AboutTab:    () => null }))
jest.mock('@/features/merchant/components/BranchesTab', () => ({ BranchesTab: () => null }))
jest.mock('@/features/merchant/components/ReviewsTab',  () => ({ ReviewsTab:  () => null }))
jest.mock('@/features/merchant/components/ContactSheet',     () => ({ ContactSheet:     () => null }))
jest.mock('@/features/merchant/components/DirectionsSheet',  () => ({ DirectionsSheet:  () => null }))
jest.mock('@/features/merchant/components/SuspendedBranchBanner', () => ({ SuspendedBranchBanner: () => null }))
jest.mock('@/features/merchant/components/AllBranchesUnavailable', () => ({ AllBranchesUnavailable: () => null }))
jest.mock('@/features/merchant/components/HoursPreviewSheet', () => ({ HoursPreviewSheet: () => null }))
jest.mock('@/features/merchant/components/BranchSwitchToast', () => ({ BranchSwitchToast: () => null }))

jest.mock('@/hooks/useFavourite', () => ({
  useFavourite: () => ({ isFavourited: false, toggle: jest.fn(), isLoading: false }),
}))
jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ status: 'idle', location: null, requestPermission: jest.fn() }),
}))
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ isSubscribed: true, isSubLoading: false, subscription: null }),
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: (s: any) => any) => sel({ status: 'authed', user: { id: 'u1' } })),
}))

let mockBranchParam: string | undefined = undefined
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: () => ({ branch: mockBranchParam }),
    // §BD-2 — MerchantProfileScreen calls useFocusEffect to reset
    // the active tab when the URL has no `?tab=` param. Fire it
    // after commit via useEffect (focus-on-mount semantics).
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        try { return effect() } catch { /* defensive */ return undefined }
      }, [])
    },
  }
})

import { MerchantProfileScreen } from '@/features/merchant/screens/MerchantProfileScreen'
import { merchantApi } from '@/lib/api/merchant'
import { router } from 'expo-router'

const getProfileSpy = jest.spyOn(merchantApi, 'getProfile')

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  )
}

// Branch fixtures — note the IDs intentionally diverge in the race tests
// so the assertion can prove WHICH branch fed the URL build.
function makeBranch(id: string, name: string) {
  return {
    id, name,
    isMainBranch: false, isActive: true,
    addressLine1: null, addressLine2: null,
    city: null, postcode: null, country: 'GB',
    latitude: null, longitude: null,
    phone: null, email: null, websiteUrl: null,
    logoUrl: null, bannerUrl: null, about: null,
    openingHours: [],
    photos: [], amenities: [],
    distance: 1500, isOpenNow: true,
    avgRating: 4.5, reviewCount: 12,
    myReview: null,
  }
}

function makeMerchant(selectedBranchId: string) {
  return {
    id: 'm1', businessName: 'The Coffee House', tradingName: null, status: 'ACTIVE',
    logoUrl: null, bannerUrl: null, description: null, websiteUrl: null,
    primaryCategoryId: null, primaryCategory: null, primaryDescriptorTag: null,
    subcategory: null, descriptor: 'Cafe', highlights: [],
    vouchers: [{
      id: 'v1', title: 'BOGO', type: 'BOGO', description: null, terms: null,
      imageUrl: null, estimatedSaving: 4.5, expiryDate: null,
    }],
    about: null, avgRating: null, reviewCount: 0, isFavourited: false,
    distance: null, nearestBranch: null,
    isOpenNow: true, openingHours: [], amenities: [], photos: [],
    branches: [makeBranch('b1', 'Brightlingsea'), makeBranch('b2', 'Colchester')],
    selectedBranch: makeBranch(selectedBranchId, selectedBranchId === 'b1' ? 'Brightlingsea' : 'Colchester'),
    selectedBranchFallbackReason: 'used-candidate' as const,
  }
}

beforeEach(() => {
  ;(router.push as jest.Mock).mockClear()
  ;(router.replace as jest.Mock).mockClear()
  ;(router.back as jest.Mock).mockClear()
  getProfileSpy.mockReset()
  mockBranchParam = undefined
})

describe('handleVoucherPress branch-race contract (§O7)', () => {
  it('URL branch=B2 + stale merchant.selectedBranch=B1 → push uses branch=B2 (the URL wins)', async () => {
    // Simulate the keepPreviousData refetch window: user just switched to
    // B2, URL flipped instantly, but the merchant query is mid-refetch and
    // still returning the previous branch's data (selectedBranch.id=B1).
    mockBranchParam = 'b2'
    getProfileSpy.mockResolvedValue(makeMerchant('b1') as any)

    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    const tap = await findByLabelText('tap-voucher')
    fireEvent.press(tap)

    expect(router.push).toHaveBeenCalledTimes(1)
    const [pushedUrl] = (router.push as jest.Mock).mock.calls[0]
    expect(pushedUrl).toMatch(/branch=b2/)
    expect(pushedUrl).not.toMatch(/branch=b1/)
  })

  it('URL branch=B2 + matching merchant.selectedBranch=B2 → push uses branch=B2 (steady state)', async () => {
    // Once the refetch resolves, URL and merchant data agree. Same outcome
    // — pinned so the fix doesn't quietly diverge from steady state.
    mockBranchParam = 'b2'
    getProfileSpy.mockResolvedValue(makeMerchant('b2') as any)

    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    const tap = await findByLabelText('tap-voucher')
    fireEvent.press(tap)

    expect(router.push).toHaveBeenCalledTimes(1)
    const [pushedUrl] = (router.push as jest.Mock).mock.calls[0]
    expect(pushedUrl).toMatch(/branch=b2/)
  })

  it('No URL branch (cold-open) + merchant.selectedBranch=B1 → push falls back to B1', async () => {
    // Cold-open: user tapped through Discovery / search without a branch
    // hint. URL has no `?branch=` yet (the `reconcile` effect runs on the
    // FIRST data tick; this test exercises the window where the user could
    // tap a voucher before reconcile fires). Fallback must keep working —
    // dropping `branch=` entirely would lose attribution.
    mockBranchParam = undefined
    getProfileSpy.mockResolvedValue(makeMerchant('b1') as any)

    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    const tap = await findByLabelText('tap-voucher')
    fireEvent.press(tap)

    expect(router.push).toHaveBeenCalledTimes(1)
    const [pushedUrl] = (router.push as jest.Mock).mock.calls[0]
    expect(pushedUrl).toMatch(/branch=b1/)
  })

  it('preserves return-context params (from / returnMerchantId / tab) in the pushed URL', async () => {
    // The §O7 fix only touches the branch-id source. Other return-context
    // params must remain wired so Voucher Detail's back button can deter-
    // ministically route back to this merchant + Vouchers tab. Pinned to
    // catch any accidental drop during a future refactor.
    mockBranchParam = 'b2'
    getProfileSpy.mockResolvedValue(makeMerchant('b2') as any)

    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    const tap = await findByLabelText('tap-voucher')
    fireEvent.press(tap)

    const [pushedUrl] = (router.push as jest.Mock).mock.calls[0]
    expect(pushedUrl).toMatch(/^\/voucher\/v1\?/)
    expect(pushedUrl).toMatch(/from=merchant/)
    expect(pushedUrl).toMatch(/returnMerchantId=m1/)
    expect(pushedUrl).toMatch(/tab=vouchers/)
  })
})
