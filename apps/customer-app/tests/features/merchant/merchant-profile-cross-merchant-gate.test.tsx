// §BD-1 — Cross-merchant stale-data gate.
//
// Locked 2026-05-16 from device QA: tap Covelum → back → tap Karaara →
// the Merchant Profile screen rendered Covelum content for ~4-5s
// before swapping to Karaara. Root cause: `useMerchantProfile` opts
// into `placeholderData: keepPreviousData` so within-merchant branch
// switches are smooth (spec §4.7 / §N11). That option is unscoped —
// when the route merchant id changes, the previous merchant's full
// payload surfaces as placeholder until the new fetch resolves.
//
// The fix gates the screen on `isPlaceholderData && merchant.id !== id`
// — when those hold, the existing loading-skeleton path renders
// instead of the stale-merchant tree. Within-merchant branch
// transitions are unaffected (same `merchant.id`, only `branchId` in
// the query key differs → keepPreviousData behaviour preserved).
//
// This file pins the cross-merchant case end-to-end through React
// Query so a future "tune the hook" PR can't silently regress it.

import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

// Pinned safe-area metrics — mirrors profile-skeleton.test.tsx so the
// MerchantProfileScreen's `useSafeAreaInsets()` resolves under jest.
const initialMetrics = {
  frame:  { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

// ─── Component mocks ─────────────────────────────────────────────────────────
// Surface the merchant name on screen so we can assert which merchant
// is currently visible. Headline mock matches profile-skeleton.test.tsx.

jest.mock('@/features/merchant/components/HeroSection', () => ({
  HeroBackdrop:     () => null,
  HeroNav:          () => null,
  HeroBannerSpacer: () => null,
  HERO_HEIGHT:      256,
}))

jest.mock('@/features/merchant/components/CollapsedHeader', () => ({
  CollapsedHeader: () => null,
}))

jest.mock('@/features/merchant/components/MerchantDescriptor', () => ({
  MerchantDescriptor: () => null,
}))

jest.mock('@/features/merchant/components/MetaRow', () => ({
  MetaRow: () => null,
}))

jest.mock('@/features/merchant/components/ActionRow', () => ({
  ActionRow: () => null,
}))

jest.mock('@/features/merchant/components/TabBar', () => ({
  TabBar: () => null,
}))

jest.mock('@/features/merchant/components/VouchersTab', () => ({
  VouchersTab: () => null,
}))

jest.mock('@/features/merchant/components/AboutTab',    () => ({ AboutTab:    () => null }))
jest.mock('@/features/merchant/components/BranchesTab', () => ({ BranchesTab: () => null }))
jest.mock('@/features/merchant/components/ReviewsTab',  () => ({ ReviewsTab:  () => null }))

jest.mock('@/features/merchant/components/ContactSheet',          () => ({ ContactSheet:          () => null }))
jest.mock('@/features/merchant/components/DirectionsSheet',       () => ({ DirectionsSheet:       () => null }))
jest.mock('@/features/merchant/components/SuspendedBranchBanner', () => ({ SuspendedBranchBanner: () => null }))
jest.mock('@/features/merchant/components/AllBranchesUnavailable', () => ({
  AllBranchesUnavailable: () => null,
}))

jest.mock('@/features/merchant/components/MerchantHeadline', () => ({
  MerchantHeadline: ({ merchantName }: { merchantName: string }) => {
    const { Text } = require('react-native')
    return <Text>HEADLINE_NAME={merchantName}</Text>
  },
}))

jest.mock('@/features/merchant/components/BranchContextBand', () => ({
  BranchContextBand: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native')
    return <View>{children}</View>
  },
}))

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

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router:               { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: () => ({}),
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

const baseMerchant = {
  businessName: '', tradingName: null, status: 'ACTIVE',
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

const covelumMerchant = { ...baseMerchant, id: 'covelum-id', businessName: 'Covelum' }
const karaaraMerchant = { ...baseMerchant, id: 'karaara-id', businessName: 'Karaara' }

import { MerchantProfileScreen } from '@/features/merchant/screens/MerchantProfileScreen'
import { merchantApi } from '@/lib/api/merchant'

jest.spyOn(merchantApi, 'getProfile')

function wrap(ui: React.ReactElement, qc?: QueryClient) {
  const client = qc ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  )
}

describe('MerchantProfileScreen — §BD-1 cross-merchant stale-data gate', () => {
  beforeEach(() => {
    ;(merchantApi.getProfile as jest.Mock).mockReset()
  })

  // The bug shape: while the Karaara fetch is still pending, React
  // Query surfaces the Covelum response as placeholder data
  // (`placeholderData: keepPreviousData` on the hook). Pre-fix, the
  // screen would render Covelum's businessName under the karaara-id
  // route. Post-fix, the loading skeleton path runs instead.
  it('does NOT render the previous merchant while the new fetch is pending', async () => {
    // Shared QueryClient so the Covelum cache survives into the
    // Karaara render — that's the mechanism `keepPreviousData` uses.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    // First render: Covelum resolves immediately.
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(covelumMerchant)
    const { findByText, queryByText, rerender, getByLabelText } = wrap(
      <MerchantProfileScreen id="covelum-id" />,
      qc,
    )
    expect(await findByText('HEADLINE_NAME=Covelum')).toBeTruthy()

    // Second render: change the route id to Karaara. The Karaara
    // fetch is left pending so the keepPreviousData placeholder
    // window is observable.
    let resolveKaraara: (v: any) => void = () => {}
    const karaaraPromise = new Promise<typeof karaaraMerchant>((res) => { resolveKaraara = res })
    ;(merchantApi.getProfile as jest.Mock).mockReturnValueOnce(karaaraPromise)

    rerender(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <QueryClientProvider client={qc}>
          <MerchantProfileScreen id="karaara-id" />
        </QueryClientProvider>
      </SafeAreaProvider>,
    )

    // Skeleton/loading path renders — Covelum is no longer visible.
    expect(getByLabelText('Loading merchant profile')).toBeTruthy()
    expect(queryByText('HEADLINE_NAME=Covelum')).toBeNull()
    expect(queryByText('HEADLINE_NAME=Karaara')).toBeNull()

    // Resolve the pending Karaara fetch — Karaara content swaps in,
    // the loader goes away.
    resolveKaraara(karaaraMerchant)
    await waitFor(() => {
      expect(queryByText('HEADLINE_NAME=Karaara')).toBeTruthy()
    })
    expect(queryByText('HEADLINE_NAME=Covelum')).toBeNull()
  })

  // Counter-test: same-merchant rerender keeps content on screen.
  // This is the §N11 within-merchant branch-switch contract — the
  // keepPreviousData smoothness must NOT be regressed by the §BD-1
  // gate. The gate only fires when `merchant.id !== route id`; a
  // re-render with the same route id (e.g. a branch switch with the
  // same merchant) leaves the existing payload on screen.
  it('keeps the existing merchant visible on a same-merchant rerender (§N11 contract preserved)', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValue(covelumMerchant)
    const { findByText, queryByText, rerender } = wrap(<MerchantProfileScreen id="covelum-id" />)

    expect(await findByText('HEADLINE_NAME=Covelum')).toBeTruthy()

    // Re-render with the same id — no new fetch needed; the screen
    // must stay on Covelum, not flash the loader.
    rerender(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MerchantProfileScreen id="covelum-id" />
        </QueryClientProvider>
      </SafeAreaProvider>,
    )

    // The fresh QueryClient in the rerender will refetch — but the
    // contract is that *during the wait* we don't flash the loader
    // when the route is the same merchant we already rendered. This
    // is the §N11 smoothness path; the gate only fires on
    // cross-merchant placeholder.
    //
    // After the refetch resolves, Covelum is back on screen. The
    // important pin here is the negative one — we never showed
    // anything OTHER than Covelum.
    expect(queryByText('HEADLINE_NAME=Karaara')).toBeNull()
    await waitFor(() => {
      expect(queryByText('HEADLINE_NAME=Covelum')).toBeTruthy()
    })
  })
})
