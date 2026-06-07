// §HSH.7(b) — Merchant Profile sticky tab-strip fix (fallback F).
//
// The tab strip used to be a worklet-positioned "fake sticky" — an absolute
// sibling repositioned every frame from scrollY (translateY: Math.max(...,
// identityZoneEnd - scrollY)) which lagged the native scroll and visibly
// wiggled. Fix: an in-flow real TabBar (scrolls natively, zero lag) plus a
// constant-position pinned clone (worklet OPACITY only, never a scroll-driven
// translateY), with a single `tabPinned` flag gating exactly ONE live +
// accessible strip at a time.
//
// These are STRUCTURAL pins (the wiggle itself + the pinned-state a11y mirror
// are device-QA-only because reanimated's useAnimatedStyle / useAnimatedReaction
// are jest no-ops). Harness copied from merchant-profile-cold-mount-reviews.

import React from 'react'
import { StyleSheet } from 'react-native'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

jest.mock('@/features/merchant/components/HeroSection', () => ({
  HeroBackdrop: () => null,
  HeroNav:      () => null,
  HeroBannerSpacer: () => null,
  HERO_HEIGHT:  256,
}))
jest.mock('@/features/merchant/components/CollapsedHeader', () => ({
  CollapsedHeader: () => null,
  COMPACT_BAR_HEIGHT: 52,
}))
jest.mock('@/features/merchant/components/MerchantHeadline', () => ({ MerchantHeadline: () => null }))
jest.mock('@/features/merchant/components/MerchantDescriptor', () => ({ MerchantDescriptor: () => null }))
jest.mock('@/features/merchant/components/MetaRow',          () => ({ MetaRow:          () => null }))
jest.mock('@/features/merchant/components/ActionRow',        () => ({ ActionRow:        () => null }))
jest.mock('@/features/merchant/components/BranchContextBand', () => ({
  BranchContextBand: (p: any) => {
    const { View } = require('react-native')
    return <View>{p.children}</View>
  },
}))
jest.mock('@/features/merchant/components/TabBar', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    TabBar: ({ activeTab, tabs, onTabPress }: any) => (
      <View accessibilityLabel="tab-bar">
        {tabs.map((t: any) => (
          <Pressable
            key={t.id}
            accessibilityLabel={`tabbar-${t.id}`}
            accessibilityState={{ selected: activeTab === t.id }}
            onPress={() => onTabPress(t.id)}
          >
            <Text>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  }
})
jest.mock('@/features/merchant/components/VouchersTab', () => ({
  VouchersTab: () => {
    const { Text, View } = require('react-native')
    return <View accessibilityLabel="vouchers-tab"><Text>VOUCHERS_TAB_MOUNTED</Text></View>
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

let mockParams: Record<string, string | undefined> = {}
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: {
      back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissAll: jest.fn(),
    },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => { try { return effect() } catch { return undefined } }, [])
    },
  }
})

import { MerchantProfileScreen } from '@/features/merchant/screens/MerchantProfileScreen'
import { merchantApi } from '@/lib/api/merchant'

const getProfileSpy = jest.spyOn(merchantApi, 'getProfile')

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  )
}

function makeBranch(id: string, name: string) {
  return {
    id, name, isMainBranch: id === 'b1', isActive: true,
    addressLine1: null, addressLine2: null, city: null, postcode: null, country: 'GB',
    latitude: null, longitude: null, phone: null, email: null, websiteUrl: null,
    logoUrl: null, bannerUrl: null, about: null, openingHours: [], photos: [], amenities: [],
    distance: 1500, isOpenNow: true, avgRating: 4.5, reviewCount: 12, myReview: null,
  }
}
function makeMerchant(selectedBranchId = 'b1') {
  return {
    id: 'm1', businessName: 'Covelum', tradingName: null, status: 'ACTIVE',
    logoUrl: null, bannerUrl: null, description: null, websiteUrl: null,
    primaryCategoryId: null, primaryCategory: null, primaryDescriptorTag: null,
    subcategory: null, descriptor: 'Restaurant', highlights: [],
    vouchers: [], about: null, avgRating: null, reviewCount: 0, isFavourited: false,
    distance: null, nearestBranch: null, isOpenNow: true, openingHours: [], amenities: [], photos: [],
    branches: [makeBranch('b1', 'Brightlingsea')],
    selectedBranch: makeBranch(selectedBranchId, 'Brightlingsea'),
    selectedBranchFallbackReason: 'used-candidate' as const,
  }
}

beforeEach(() => {
  getProfileSpy.mockReset()
  mockParams = { branch: 'b1' }
})

describe('Merchant Profile — §HSH.7(b) sticky tab strip', () => {
  // The pinned clone is intentionally a11y-HIDDEN at the top (tabPinned=false),
  // so RTL's default queries skip it — that hidden state is itself part of the
  // contract. Query it with { includeHiddenElements: true } to inspect it.
  const SHOW_HIDDEN = { includeHiddenElements: true } as const

  it('renders DISTINCT in-flow + pinned tab strips and NO worklet fake-sticky spacer', async () => {
    getProfileSpy.mockResolvedValue(makeMerchant() as any)
    const { findByTestId, queryByTestId } = wrap(<MerchantProfileScreen id="m1" />)
    await findByTestId('merchant-tabbar-inline')
    // The old worklet "fake sticky" reserved its space with this spacer; it is gone.
    expect(queryByTestId('tab-bar-spacer', SHOW_HIDDEN)).toBeNull()
    // Two strips with DISTINCT testIDs (never a shared one).
    expect(queryByTestId('merchant-tabbar-inline')).toBeTruthy()
    expect(queryByTestId('merchant-tabbar-pinned', SHOW_HIDDEN)).toBeTruthy()
  })

  it('the pinned strip has NO scroll-driven translateY (constant top + opacity only)', async () => {
    getProfileSpy.mockResolvedValue(makeMerchant() as any)
    const { findByTestId, getByTestId } = wrap(<MerchantProfileScreen id="m1" />)
    await findByTestId('merchant-tabbar-inline')
    const pinned = getByTestId('merchant-tabbar-pinned', SHOW_HIDDEN)
    const flat = StyleSheet.flatten(pinned.props.style)
    expect(flat.position).toBe('absolute')
    expect(typeof flat.top).toBe('number')   // CONSTANT pin point, not scroll-driven
    expect(flat.transform).toBeUndefined()    // NO translateY fake-sticky (the wiggle cause)
  })

  it('at the top, only the in-flow strip is accessible/interactive (no duplicate SR tab controls)', async () => {
    getProfileSpy.mockResolvedValue(makeMerchant() as any)
    const { findByTestId, getByTestId } = wrap(<MerchantProfileScreen id="m1" />)
    await findByTestId('merchant-tabbar-inline')
    const inline = getByTestId('merchant-tabbar-inline')
    const pinned = getByTestId('merchant-tabbar-pinned', SHOW_HIDDEN)
    // tabPinned starts false (not scrolled) → pinned clone hidden + non-interactive.
    expect(pinned.props.accessibilityElementsHidden).toBe(true)
    expect(pinned.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(pinned.props.pointerEvents).toBe('none')
    // ...and the in-flow strip is the live one.
    expect(inline.props.accessibilityElementsHidden).toBe(false)
  })

  it('the two strips are mutually exclusive for a11y (opposite hidden flags from one tabPinned source)', async () => {
    // The mirror is driven by a single `tabPinned` flag, so the two wrappers
    // read OPPOSITE accessibilityElementsHidden by construction. The pinned-state
    // (inline hidden / pinned live) is device-QA-verified because useAnimatedReaction
    // is a jest no-op — we pin the STATIC opposite-by-construction contract here.
    getProfileSpy.mockResolvedValue(makeMerchant() as any)
    const { findByTestId, getByTestId } = wrap(<MerchantProfileScreen id="m1" />)
    await findByTestId('merchant-tabbar-inline')
    const inline = getByTestId('merchant-tabbar-inline')
    const pinned = getByTestId('merchant-tabbar-pinned', SHOW_HIDDEN)
    expect(inline.props.accessibilityElementsHidden)
      .not.toBe(pinned.props.accessibilityElementsHidden)
  })
})
