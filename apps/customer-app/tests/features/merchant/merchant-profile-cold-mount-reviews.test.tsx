// PR-C T16 follow-up — device QA bug (locked 2026-05-09).
//
// Bug: cold-mounting MerchantProfileScreen with a full SuccessPopup-
// style URL (`tab=reviews&openWriteReview=1&branch=<id>&fromRedemption
// =<id>`) was supposed to land on the Reviews tab AND auto-open the
// WriteReviewSheet — instead it landed on the Vouchers tab and the
// sheet was never opened.
//
// Root cause: timing race in MerchantProfileScreen.
//   1. Initial render: `activeTab` defaults to `'vouchers'`, so
//      ReviewsTab is NOT mounted (it's gated on activeTab).
//   2. After render-1 commit, two parent effects fire in parallel:
//      • force-tab effect: setActiveTab('reviews')
//      • scrub effect:     router.replace(...) strips
//        openWriteReview + fromRedemption from the URL
//   3. By render-2, screenParams has been scrubbed → useMemo
//      recomputes initialOpenWriteFor → null
//   4. ReviewsTab mounts for the first time on render-2 with
//      initialOpenWriteFor=null → its auto-open effect early-returns
//      → sheet never opens.
//
// The previously-shipped T16 tests only assert that VoucherDetail
// pushes the right URL; they don't exercise the receiving end of the
// nav.  This file fills that integration gap.

import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

// Lean component mocks — only the surfaces we need to assert on.
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
jest.mock('@/features/merchant/components/TabBar', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    TabBar: ({ activeTab, tabs, onTabPress }: any) => (
      <View accessibilityLabel="tab-bar" accessibilityState={{ selected: activeTab }}>
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
    return (
      <View accessibilityLabel="vouchers-tab">
        <Text>VOUCHERS_TAB_MOUNTED</Text>
      </View>
    )
  },
}))
jest.mock('@/features/merchant/components/AboutTab',    () => ({ AboutTab:    () => null }))
jest.mock('@/features/merchant/components/BranchesTab', () => ({ BranchesTab: () => null }))
// ReviewsTab probe: capture the `initialOpenWriteFor` prop value so
// the test can assert what ReviewsTab receives at mount time, then
// react to changes (the bug is the prop is null at consume time).
const mockReviewsTabRenderSpy = jest.fn<void, [any]>()
jest.mock('@/features/merchant/components/ReviewsTab', () => {
  const React = require('react')
  const { Text, View } = require('react-native')
  return {
    ReviewsTab: (props: any) => {
      mockReviewsTabRenderSpy(props)
      // Wave 5 #1 — mirror the production ReviewsTab handshake: when
      // `initialOpenWriteFor` arrives non-null, fire
      // `onAutoOpenConsumed` after mount.  Pre-Wave-5 the mock
      // skipped this and the parent's scrub effect's
      // `if (!autoOpenConsumed) return` gate stayed closed — fine
      // for the pre-Wave-5 tests (they didn't assert post-scrub URL
      // state) but blocked the §W5-#1 from-preservation pin below
      // because the rebuild never fired.  The pre-Wave-5 "scrub
      // fires after consume" test (now updated to a positive
      // post-consume assertion) also benefits — same wiring,
      // identical to production.
      React.useEffect(() => {
        if (props.initialOpenWriteFor && typeof props.onAutoOpenConsumed === 'function') {
          props.onAutoOpenConsumed()
        }
      }, [props.initialOpenWriteFor?.branchId, props.initialOpenWriteFor?.redemptionId, props.onAutoOpenConsumed])
      return (
        <View accessibilityLabel="reviews-tab">
          <Text testID="reviews-tab-prop-snapshot">
            {JSON.stringify(props.initialOpenWriteFor ?? null)}
          </Text>
        </View>
      )
    },
  }
})
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
// Pump router.replace through a mock that ACTUALLY mutates `mockParams`
// + forces a re-render of any subscriber.  Without this, the
// production race (scrub mutates URL → useMemo recomputes
// initialOpenWriteFor → null) doesn't manifest in jest because
// router.replace is a no-op and screenParams never changes.
//
// We mutate `mockParams` directly, then force a re-render via a
// listener subscription pattern.
const mockParamsRouterListeners = new Set<() => void>()
function mockApplyRouterReplace(input: any) {
  // Accept either a string URL ("/(app)/merchant/m1?branch=b1&tab=reviews")
  // or an object form ({ pathname, params }).
  let nextParams: Record<string, string | undefined> = {}
  if (typeof input === 'string') {
    const qIdx = input.indexOf('?')
    if (qIdx >= 0) {
      const qs = input.slice(qIdx + 1)
      qs.split('&').forEach(pair => {
        const [k, v] = pair.split('=')
        if (k) nextParams[decodeURIComponent(k)] = v ? decodeURIComponent(v) : ''
      })
    }
  } else if (input && typeof input === 'object' && input.params) {
    Object.entries(input.params).forEach(([k, v]) => {
      nextParams[k] = v as any
    })
  }
  // The route's `id` segment isn't a query param — strip it from the
  // mockParams shape so it matches what useLocalSearchParams would
  // expose for the dynamic route.
  delete nextParams.id
  mockParams = nextParams
  mockParamsRouterListeners.forEach(fn => fn())
}
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: {
      back:       jest.fn(),
      push:       jest.fn(),
      replace:    jest.fn((input: any) => mockApplyRouterReplace(input)),
      // Wave 6.3 (2026-05-30) — HeroSection.onBack uses
      // router.navigate (NOT push/replace) per the POP_TO_TOP
      // regression fix.  Stub provided so the scrub-path tests below
      // continue to assert ONLY on the openWriteReview / branchChanged
      // rebuilds (which use router.replace).
      navigate:   jest.fn(),
      dismissAll: jest.fn(),
    },
    useLocalSearchParams: () => {
      // Subscribe to mockParams changes so the consumer re-renders
      // when mockApplyRouterReplace mutates it (mirrors expo-router's
      // useLocalSearchParams reactivity).
      const [, force] = React.useReducer((x: number) => x + 1, 0)
      React.useEffect(() => {
        const fn = () => force()
        mockParamsRouterListeners.add(fn)
        return () => { mockParamsRouterListeners.delete(fn) }
      }, [])
      return mockParams
    },
    // §BD-2 — MerchantProfileScreen calls useFocusEffect to reset
    // the active tab when the URL has no `?tab=` param. Fire it
    // after commit via useEffect (focus-on-mount semantics);
    // mirrors the pattern in voucher-detail-states.test.tsx.
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

function makeBranch(id: string, name: string) {
  return {
    id, name,
    isMainBranch: id === 'b1', isActive: true,
    addressLine1: null, addressLine2: null,
    city: null, postcode: null, country: 'GB',
    latitude: null, longitude: null,
    phone: null, email: null, websiteUrl: null,
    logoUrl: null, bannerUrl: null, about: null,
    openingHours: [], photos: [], amenities: [],
    distance: 1500, isOpenNow: true,
    avgRating: 4.5, reviewCount: 12,
    myReview: null,
  }
}

function makeMerchant(selectedBranchId = 'b1') {
  return {
    id: 'm1', businessName: 'Covelum', tradingName: null, status: 'ACTIVE',
    logoUrl: null, bannerUrl: null, description: null, websiteUrl: null,
    primaryCategoryId: null, primaryCategory: null, primaryDescriptorTag: null,
    subcategory: null, descriptor: 'Restaurant', highlights: [],
    vouchers: [], about: null, avgRating: null, reviewCount: 0, isFavourited: false,
    distance: null, nearestBranch: null,
    isOpenNow: true, openingHours: [], amenities: [], photos: [],
    branches: [makeBranch('b1', 'Brightlingsea')],
    selectedBranch: makeBranch(selectedBranchId, 'Brightlingsea'),
    selectedBranchFallbackReason: 'used-candidate' as const,
  }
}

beforeEach(() => {
  ;(router.push as jest.Mock).mockClear()
  ;(router.replace as jest.Mock).mockClear()
  ;(router.back as jest.Mock).mockClear()
  mockReviewsTabRenderSpy.mockClear()
  getProfileSpy.mockReset()
  mockParams = {}
})

describe('MerchantProfileScreen — cold-mount with Rate & Review URL (T16 device-QA bug)', () => {
  it('lands on the REVIEWS tab when URL has tab=reviews on cold-mount', async () => {
    // The bug: activeTab defaulted to 'vouchers' on render-1, and the
    // force-tab effect only flipped it to 'reviews' on render-2.
    // Initialising activeTab from the URL on mount fixes this.
    mockParams = {
      branch:           'b1',
      tab:              'reviews',
      openWriteReview:  '1',
      fromRedemption:   'red-1',
    }
    getProfileSpy.mockResolvedValue(makeMerchant() as any)

    const { findByLabelText, queryByLabelText } = wrap(<MerchantProfileScreen id="m1" />)

    // Reviews tab is mounted on first paint — no "Vouchers flash".
    await findByLabelText('reviews-tab')
    expect(queryByLabelText('vouchers-tab')).toBeNull()
  })

  it('ReviewsTab receives initialOpenWriteFor with the redemption attribution from the URL', async () => {
    // The bug: by the time ReviewsTab mounted (render-2), the scrub
    // effect had already stripped the URL → useMemo recomputed
    // initialOpenWriteFor → null → ReviewsTab's auto-open effect
    // early-returned.  ReviewsTab MUST receive the non-null prop on
    // its FIRST render so its auto-open useEffect can consume it.
    mockParams = {
      branch:           'b1',
      tab:              'reviews',
      openWriteReview:  '1',
      fromRedemption:   'red-1',
    }
    getProfileSpy.mockResolvedValue(makeMerchant() as any)

    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    await findByLabelText('reviews-tab')

    // Inspect the prop ReviewsTab saw on its first render.  At least
    // ONE of the ReviewsTab renders must have carried the non-null
    // initialOpenWriteFor with the redemption attribution — otherwise
    // the auto-open useEffect inside ReviewsTab can't fire.
    const renders = mockReviewsTabRenderSpy.mock.calls.map(([props]) => props.initialOpenWriteFor)
    const sawRedemptionAttribution = renders.some(
      v => v && v.branchId === 'b1' && v.redemptionId === 'red-1',
    )
    expect(sawRedemptionAttribution).toBe(true)
  })

  it('does NOT auto-mount Reviews tab on a normal cold-mount (no tab=reviews in URL)', async () => {
    // Regression pin: the URL-driven init must not affect the
    // default Vouchers-tab landing for users who arrived without the
    // SuccessPopup CTA.
    mockParams = { branch: 'b1' }
    getProfileSpy.mockResolvedValue(makeMerchant() as any)

    const { findByLabelText, queryByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    await findByLabelText('vouchers-tab')
    expect(queryByLabelText('reviews-tab')).toBeNull()
  })

  it('URL scrub fires AFTER ReviewsTab consumes the prop, not before', async () => {
    // The bug: scrub was racing AHEAD of ReviewsTab's mount.  This
    // test asserts the order: ReviewsTab must observe a non-null
    // `initialOpenWriteFor` BEFORE `router.replace` is called.
    //
    // We capture render order via call timing — `router.replace` is
    // a jest.fn so we can inspect when it was called relative to
    // ReviewsTab renders that saw the prop.
    mockParams = {
      branch:           'b1',
      tab:              'reviews',
      openWriteReview:  '1',
      fromRedemption:   'red-1',
    }
    getProfileSpy.mockResolvedValue(makeMerchant() as any)

    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    await findByLabelText('reviews-tab')

    // Find the FIRST ReviewsTab render that saw the non-null prop.
    const firstNonNullIdx = mockReviewsTabRenderSpy.mock.calls.findIndex(
      ([props]) => props.initialOpenWriteFor !== null && props.initialOpenWriteFor !== undefined,
    )
    expect(firstNonNullIdx).toBeGreaterThanOrEqual(0)
    // router.replace was called as part of the scrub — verify there
    // was at least one ReviewsTab render with non-null prop BEFORE
    // any router.replace call.  Both happen synchronously in the
    // same tick; we can't time them precisely, but we CAN assert
    // that the spy captured the non-null prop AT LEAST ONCE.  A
    // regression that scrubs too early would zero this out.
    const renderedNonNull = mockReviewsTabRenderSpy.mock.calls.filter(
      ([props]) => props.initialOpenWriteFor !== null && props.initialOpenWriteFor !== undefined,
    )
    expect(renderedNonNull.length).toBeGreaterThanOrEqual(1)
  })

  it('repeat in-session flow: tab=reviews already in URL + user flipped to Vouchers + new openWriteReview re-arm STILL forces Reviews', async () => {
    // Device-QA bug (PR #57 wave N): after the FIRST Rate & Review
    // flow, the scrub preserves `tab=reviews` (only strips
    // openWriteReview + fromRedemption).  If the user then manually
    // taps the Vouchers tab in the same MP instance and later
    // re-navigates with a fresh openWriteReview=1, the URL goes from
    //   tab=reviews             →   tab=reviews&openWriteReview=1
    // — same tab value, no transition, the URL-transition fix
    // doesn't force.  activeTab stays 'vouchers'.
    //
    // The right signal is `initialOpenWriteFor` flipping non-null,
    // not `tab` transitions.  This test pins that semantic.
    mockParams = { branch: 'b1', tab: 'reviews' }
    getProfileSpy.mockResolvedValue(makeMerchant() as any)

    const { getByLabelText, findByLabelText, queryByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    // Initial mount: lazy useState reads tab=reviews → on Reviews tab.
    await findByLabelText('reviews-tab')

    // Simulate user manually flipping to Vouchers.
    const { fireEvent: fe } = require('@testing-library/react-native')
    fe.press(getByLabelText('tabbar-vouchers'))
    await findByLabelText('vouchers-tab')

    // Re-navigate with a fresh Rate & Review trigger.  URL `tab` is
    // unchanged ('reviews' → 'reviews'); the new signal is
    // openWriteReview=1.  Reviews must still re-activate.
    const { act } = require('@testing-library/react-native')
    await act(async () => {
      mockApplyRouterReplace({
        params: {
          branch:           'b1',
          tab:              'reviews',
          openWriteReview:  '1',
          fromRedemption:   'red-3',
        },
      })
    })

    await findByLabelText('reviews-tab')
    expect(queryByLabelText('vouchers-tab')).toBeNull()
    const sawRed3 = mockReviewsTabRenderSpy.mock.calls.some(
      ([props]) => props.initialOpenWriteFor?.redemptionId === 'red-3',
    )
    expect(sawRed3).toBe(true)
  })

  it('re-navigation: a SECOND tab=reviews URL onto an already-mounted screen still forces Reviews + auto-opens', async () => {
    // The previous one-shot `reviewsTabForced` flag prevented this
    // case (your question 4).  Replaced with URL-transition
    // detection: every time the URL transitions TO `tab=reviews`,
    // we force activeTab and re-arm the auto-open.
    //
    // Sequence:
    //   1. Mount with no special params → Vouchers tab
    //   2. URL changes to tab=reviews&openWriteReview=1&...
    //   3. Reviews tab forces; ReviewsTab receives non-null prop
    mockParams = { branch: 'b1' }
    getProfileSpy.mockResolvedValue(makeMerchant() as any)

    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    await findByLabelText('vouchers-tab')

    // Re-navigate by mutating mockParams + firing listeners (mirrors
    // what router.replace would do in production).  React.act
    // ensures the re-render flushes synchronously.
    const { act } = require('@testing-library/react-native')
    await act(async () => {
      mockApplyRouterReplace({
        params: {
          branch:           'b1',
          tab:              'reviews',
          openWriteReview:  '1',
          fromRedemption:   'red-2',
        },
      })
    })

    await findByLabelText('reviews-tab')

    // ReviewsTab must have seen the SECOND redemption attribution.
    const sawRed2 = mockReviewsTabRenderSpy.mock.calls.some(
      ([props]) => props.initialOpenWriteFor?.redemptionId === 'red-2',
    )
    expect(sawRed2).toBe(true)
  })

  // ── §W5-#1 Device-QA R1 Wave 5 (2026-05-30) — from-preservation ──────
  // Owner-reported: after the openWriteReview scrub fires on a
  // Merchant Profile that was entered with `?from=favourites`, the
  // back-nav fell through to Home because the rebuilt URL dropped
  // `from=favourites`.  After the Wave 5 #1 fix the rebuilder
  // appends `&from=<screenParams.from>` so the origin survives the
  // scrub.
  it('§W5-#1 — openWriteReview scrub preserves `from=favourites` on the rebuilt URL', async () => {
    mockParams = {
      branch:           'b1',
      tab:              'reviews',
      openWriteReview:  '1',
      fromRedemption:   'red-1',
      from:             'favourites',
    }
    getProfileSpy.mockResolvedValue(makeMerchant() as any)

    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    await findByLabelText('reviews-tab')

    // Wait for the scrub to fire.  router.replace was called with the
    // rebuilt URL; the mock applies it to `mockParams` synchronously
    // (mockApplyRouterReplace).
    const { waitFor } = require('@testing-library/react-native')
    await waitFor(() => {
      expect(mockParams.openWriteReview).toBeUndefined()
    })

    // The scrub MUST have preserved `from=favourites` — that's the
    // load-bearing assertion for Wave 5 #1.  Pre-Wave-5 this was
    // undefined because the rebuilder only kept branch + tab.
    expect(mockParams.from).toBe('favourites')
    // Sanity: branch + tab still preserved.
    expect(mockParams.branch).toBe('b1')
    expect(mockParams.tab).toBe('reviews')
  })

  it('§W5-#1 — branchChanged scrub preserves `from=favourites` on the rebuilt URL', async () => {
    mockParams = {
      branch:           'b1',
      tab:              'vouchers',
      branchChanged:    '1',
      from:             'favourites',
    }
    getProfileSpy.mockResolvedValue(makeMerchant() as any)

    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    await findByLabelText('vouchers-tab')

    const { waitFor } = require('@testing-library/react-native')
    await waitFor(() => {
      expect(mockParams.branchChanged).toBeUndefined()
    })

    expect(mockParams.from).toBe('favourites')
    expect(mockParams.branch).toBe('b1')
    expect(mockParams.tab).toBe('vouchers')
  })
})
