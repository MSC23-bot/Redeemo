// §BD-2 — P1 product decision (locked 2026-05-16): reset Merchant
// Profile to the default tab on every fresh focus when the URL has
// no explicit `?tab=`.
//
// Trigger: device QA 2026-05-16 — open Karaara → tap Reviews → back
// to Discovery → reopen Karaara → Reviews still active instead of
// Vouchers. Root cause: expo-router reuses the screen instance
// across visits, so the lazy useState initialiser only fires on the
// first mount; subsequent focuses keep the last-tapped activeTab.
//
// The reset MUST NOT break the existing URL-driven flows:
//   - PR #40 / #41 / #46 SuccessPopup Rate & Review pushes
//     `?tab=reviews&openWriteReview=1&fromRedemption=<id>` and
//     opens Reviews + WriteReviewSheet.
//   - Tab-only deep links via `?tab=reviews` open Reviews.
//   - TabBar taps during the same session stick (no URL change →
//     focus doesn't change → reset doesn't fire).

import React from 'react'
import { act, render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const initialMetrics = {
  frame:  { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

// ─── Component mocks (mirror profile-skeleton.test.tsx) ──────────────────────

jest.mock('@/features/merchant/components/HeroSection', () => ({
  HeroBackdrop:     () => null,
  HeroNav:          () => null,
  HeroBannerSpacer: () => null,
  HERO_HEIGHT:      256,
}))
jest.mock('@/features/merchant/components/CollapsedHeader',  () => ({ CollapsedHeader:  () => null }))
jest.mock('@/features/merchant/components/MerchantDescriptor', () => ({ MerchantDescriptor: () => null }))
jest.mock('@/features/merchant/components/MetaRow',          () => ({ MetaRow:          () => null }))
jest.mock('@/features/merchant/components/ActionRow',        () => ({ ActionRow:        () => null }))
jest.mock('@/features/merchant/components/MerchantHeadline', () => ({ MerchantHeadline: () => null }))
jest.mock('@/features/merchant/components/BranchContextBand', () => ({
  BranchContextBand: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native')
    return <View>{children}</View>
  },
}))

// TabBar mock surfaces the active tab so tests can assert + press.
jest.mock('@/features/merchant/components/TabBar', () => ({
  TabBar: ({ tabs, activeTab, onTabPress }: any) => {
    const { Text, Pressable, View } = require('react-native')
    return (
      <View>
        {tabs.map((t: { id: string; label: string }) => (
          <Pressable
            key={t.id}
            onPress={() => onTabPress(t.id)}
            accessibilityLabel={`tab-${t.id}`}
          >
            <Text>{t.label}{t.id === activeTab ? '*' : ''}</Text>
          </Pressable>
        ))}
      </View>
    )
  },
}))

jest.mock('@/features/merchant/components/VouchersTab', () => ({
  VouchersTab: () => { const { Text } = require('react-native'); return <Text>VOUCHERS_TAB</Text> },
}))
jest.mock('@/features/merchant/components/AboutTab',    () => ({
  AboutTab: () => { const { Text } = require('react-native'); return <Text>ABOUT_TAB</Text> },
}))
jest.mock('@/features/merchant/components/BranchesTab', () => ({
  BranchesTab: () => { const { Text } = require('react-native'); return <Text>BRANCHES_TAB</Text> },
}))
// ReviewsTab surfaces a marker for active-state assertions AND a flag
// for the openWriteReview auto-open contract (PR #40 / PR-C T11).
// `initialOpenWriteFor` is the prop the screen computes from
// ?openWriteReview + ?fromRedemption.
jest.mock('@/features/merchant/components/ReviewsTab', () => ({
  ReviewsTab: ({ initialOpenWriteFor }: { initialOpenWriteFor: any }) => {
    const { Text } = require('react-native')
    return (
      <>
        <Text>REVIEWS_TAB</Text>
        <Text>OPEN_WRITE_FOR={initialOpenWriteFor ? initialOpenWriteFor.branchId : 'null'}</Text>
      </>
    )
  },
}))

jest.mock('@/features/merchant/components/ContactSheet',           () => ({ ContactSheet:           () => null }))
jest.mock('@/features/merchant/components/DirectionsSheet',        () => ({ DirectionsSheet:        () => null }))
jest.mock('@/features/merchant/components/SuspendedBranchBanner',  () => ({ SuspendedBranchBanner:  () => null }))
jest.mock('@/features/merchant/components/AllBranchesUnavailable', () => ({ AllBranchesUnavailable: () => null }))

// ─── Hook mocks ──────────────────────────────────────────────────────────────

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
  useAuthStore: jest.fn((sel: (s: any) => any) =>
    sel({ status: 'authed', user: { id: 'u1' } })
  ),
}))

// ─── expo-router mock with controllable URL params + focus effect ────────────
//
// `mockParams` is mutated per test to simulate different URL shapes.
// `latestFocusEffect` holds the most recently registered focus
// callback so tests can fire it manually to simulate a re-focus
// (e.g. user navigates away and back to the SAME merchant — the
// instance is retained, lazy initialiser doesn't re-run, but the
// focus effect does).

let mockParams: {
  branch?:           string
  tab?:              string
  openWriteReview?:  string
  fromRedemption?:   string
  branchChanged?:    string
} = {}

let latestFocusEffect: (() => void | (() => void)) | null = null

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router:               { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: () => mockParams,
    // Match the established pattern in the voucher-detail test files:
    // fire the effect AFTER commit via useEffect (focus-on-mount
    // semantics). Also capture the latest callback so tests can
    // fire it on demand to simulate re-focus.
    useFocusEffect: (effect: () => void | (() => void)) => {
      latestFocusEffect = effect
      React.useEffect(() => {
        try { return effect() } catch { /* defensive */ return undefined }
      }, [])
    },
  }
})

// ─── Fixtures ────────────────────────────────────────────────────────────────

const selectedBranchFixture = {
  id: 'b1', name: 'Main', isMainBranch: true, isActive: true,
  addressLine1: '1 High St', addressLine2: null,
  city: 'Town', postcode: 'AB1 2CD', country: 'GB',
  latitude: 51.5, longitude: -0.1,
  phone: null, email: null, websiteUrl: null,
  logoUrl: null, bannerUrl: null, about: null,
  openingHours: [],
  photos: [], amenities: [],
  distance: 1500, isOpenNow: true,
  avgRating: null, reviewCount: 0,
  myReview: null,
}

const merchant = {
  id: 'karaara-id', businessName: 'Karaara', tradingName: null, status: 'ACTIVE',
  logoUrl: null, bannerUrl: null, description: null, websiteUrl: null,
  primaryCategoryId: null, primaryCategory: null, primaryDescriptorTag: null,
  subcategory: null, descriptor: null, highlights: [],
  vouchers: [],
  about: null, avgRating: null, reviewCount: 0, isFavourited: false,
  distance: null, nearestBranch: null,
  isOpenNow: true, openingHours: [], amenities: [], photos: [], branches: [],
  selectedBranch: selectedBranchFixture,
  selectedBranchFallbackReason: 'used-candidate' as const,
}

import { MerchantProfileScreen } from '@/features/merchant/screens/MerchantProfileScreen'
import { merchantApi } from '@/lib/api/merchant'

jest.spyOn(merchantApi, 'getProfile')

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  )
}

describe('MerchantProfileScreen — §BD-2 tab reset on focus (P1)', () => {
  beforeEach(() => {
    ;(merchantApi.getProfile as jest.Mock).mockReset()
    mockParams           = {}
    latestFocusEffect    = null
  })

  // Pin 1: cold mount with no URL `?tab=` lands on Vouchers (the
  // default). Confirms the focus effect's reset path doesn't break
  // the existing default-tab contract.
  it('cold mount with no URL ?tab= lands on Vouchers', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    mockParams = {}
    const { findByText } = wrap(<MerchantProfileScreen id="karaara-id" />)
    expect(await findByText('VOUCHERS_TAB')).toBeTruthy()
    expect(await findByText('Vouchers*')).toBeTruthy()
  })

  // Pin 2: explicit `?tab=reviews` deep link is honoured by the
  // lazy initialiser. The focus effect's `!screenParams.tab` guard
  // means the reset does NOT fire — Reviews stays active.
  it('explicit ?tab=reviews deep link is honoured (focus reset does not override)', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    mockParams = { tab: 'reviews' }
    const { findByText } = wrap(<MerchantProfileScreen id="karaara-id" />)
    expect(await findByText('REVIEWS_TAB')).toBeTruthy()
    expect(await findByText('Reviews*')).toBeTruthy()
  })

  // Pin 3: PR #40 / PR-C T11 — `?tab=reviews&openWriteReview=1&
  // fromRedemption=<id>` opens Reviews AND surfaces the write-review
  // attribution. The focus reset must not interfere with either part.
  it('PR #40 openWriteReview + fromRedemption flow lands on Reviews and surfaces the attribution', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    mockParams = {
      branch:          'b1',
      tab:             'reviews',
      openWriteReview: '1',
      fromRedemption:  'red-123',
    }
    const { findByText } = wrap(<MerchantProfileScreen id="karaara-id" />)
    expect(await findByText('REVIEWS_TAB')).toBeTruthy()
    expect(await findByText('Reviews*')).toBeTruthy()
    // ReviewsTab receives the branchId attribution so it can auto-open
    // the WriteReviewSheet on the redeemed branch.
    expect(await findByText('OPEN_WRITE_FOR=b1')).toBeTruthy()
  })

  // Pin 4 (the load-bearing §BD-2 pin): user opens the merchant
  // fresh, taps Reviews via TabBar (local state only, URL stays
  // empty), then simulates expo-router reusing the instance and
  // firing the focus effect again (e.g. back-nav from Discovery →
  // re-tap Karaara). The reset must put activeTab back to Vouchers
  // because there's no explicit URL `?tab=`.
  it('§BD-2: tab resets to Vouchers when focus fires again with no URL ?tab=', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValue(merchant)
    mockParams = {}
    const { findByText, findByLabelText } = wrap(<MerchantProfileScreen id="karaara-id" />)
    // Start: cold mount, Vouchers active.
    expect(await findByText('VOUCHERS_TAB')).toBeTruthy()
    // User taps Reviews — local state only, URL stays empty.
    fireEvent.press(await findByLabelText('tab-reviews'))
    expect(await findByText('REVIEWS_TAB')).toBeTruthy()
    expect(await findByText('Reviews*')).toBeTruthy()
    // Simulate expo-router instance-retained re-focus (Discovery
    // back → re-tap same merchant). URL still has no `?tab=`.
    expect(latestFocusEffect).not.toBeNull()
    act(() => {
      latestFocusEffect?.()
    })
    // Reset has fired — back to Vouchers.
    expect(await findByText('VOUCHERS_TAB')).toBeTruthy()
    expect(await findByText('Vouchers*')).toBeTruthy()
  })

  // Pin 5: counter-test for Pin 4. When the URL DOES carry
  // `?tab=reviews`, a re-focus event must NOT reset to Vouchers.
  // Covers the case where a user followed a deep link to Reviews
  // and the URL hasn't been scrubbed.
  it('§BD-2: tab stays on Reviews when focus fires again with URL ?tab=reviews', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValue(merchant)
    mockParams = { tab: 'reviews' }
    const { findByText } = wrap(<MerchantProfileScreen id="karaara-id" />)
    expect(await findByText('REVIEWS_TAB')).toBeTruthy()
    expect(latestFocusEffect).not.toBeNull()
    act(() => {
      latestFocusEffect?.()
    })
    // Reviews still active — focus reset gated on `!screenParams.tab`.
    expect(await findByText('REVIEWS_TAB')).toBeTruthy()
    expect(await findByText('Reviews*')).toBeTruthy()
  })
})
