/**
 * Phase 3C.1g Device-QA R1 Wave 6.4 (2026-05-30) — `MerchantProfileScreen`
 * background-tab mockRouterApi.replace guard.
 *
 * Owner-reported symptom: user navigates Favourites > MP > Voucher
 * Detail > merchant logo tap → MP2 mounts (no `branch` param) → back
 * to Favourites.  Then 3-4 seconds later (matching cold-backend
 * merchant fetch RTT) Favourites flips back to MP without user input.
 * Tapping Back lands on Home.
 *
 * Root cause: this screen has THREE `mockRouterApi.replace` call sites in
 * useEffect:
 *   - reconcile (line ~178): aligns URL `?branch=` with the server-
 *     resolved selectedBranch.
 *   - openWriteReview scrub (line ~452): strips
 *     `openWriteReview=1&fromRedemption=…` after ReviewsTab consumes.
 *   - branchChanged scrub (line ~477): strips `branchChanged=1` after
 *     the toast fires.
 *
 * Because expo-router Tabs keep background tabs MOUNTED, all three
 * effects continue to fire after the user navigates away.
 * `mockRouterApi.replace` operates on the CURRENT route — which is now
 * Favourites (or wherever), NOT MP — so the current tab gets replaced
 * with the MP URL.  User suddenly sees MP.
 *
 * Fix: `isFocusedRef` tracked via `useFocusEffect`; every mockRouterApi.replace
 * call site early-returns when the ref is false.
 *
 * Regression pin (this file): mock `useFocusEffect` as a no-op (focus
 * never fires) → mount MP → trigger conditions for each scrub effect
 * → assert mockRouterApi.replace is NEVER called.  This locks the gate.
 */

import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const initialMetrics = {
  frame:  { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

// Mock heavy dependencies so the screen can mount in jest.
jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ location: null, status: 'denied' }),
}))
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ isSubscribed: true, isSubLoading: false, subscription: null }),
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: (s: any) => any) => sel({ status: 'authed', user: { id: 'u1' } })),
}))

// All MP child components stubbed — focus is on the URL-mutating
// effects, not the UI tree.
jest.mock('@/features/merchant/components/ReviewsTab',     () => ({ ReviewsTab:     () => null }))
jest.mock('@/features/merchant/components/ContactSheet',   () => ({ ContactSheet:   () => null }))
jest.mock('@/features/merchant/components/DirectionsSheet',() => ({ DirectionsSheet:() => null }))
jest.mock('@/features/merchant/components/SuspendedBranchBanner', () => ({ SuspendedBranchBanner: () => null }))
jest.mock('@/features/merchant/components/AllBranchesUnavailable', () => ({ AllBranchesUnavailable: () => null }))
jest.mock('@/features/merchant/components/HoursPreviewSheet',   () => ({ HoursPreviewSheet: () => null }))
jest.mock('@/features/merchant/components/BranchSwitchToast',   () => ({ BranchSwitchToast: () => null }))

let mockParams: Record<string, string | undefined> = {}
const mockRouterApi = {
  back:       jest.fn(),
  push:       jest.fn(),
  replace:    jest.fn(),       // ← target of the assertion
  navigate:   jest.fn(),
  dismissAll: jest.fn(),
}
jest.mock('expo-router', () => {
  return {
    router: mockRouterApi,
    useRouter: () => mockRouterApi,
    useLocalSearchParams: () => mockParams,
    // ── CORE OF THE PIN ────────────────────────────────────────────
    // `useFocusEffect` mocked as a no-op (focus NEVER fires).  This
    // simulates a screen rendered in the background of a Tabs
    // navigator that is NOT the current active tab.  `isFocusedRef`
    // inside MP stays false → every mockRouterApi.replace gate inside MP
    // must early-return.
    useFocusEffect: jest.fn(),
  }
})

// Make `useMerchantProfile` return a value that would, under the
// pre-Wave-6.4 code, trigger the reconcile effect's
// `mockRouterApi.replace({ ..., branch: 'b1' })` call.  We surface the
// resolved branch as 'b1' while the URL has NO `branch` param —
// `branchId === null !== 'b1'` triggers reconcile.  Without the
// Wave 6.4 gate this would fire.
jest.mock('@/features/merchant/hooks/useMerchantProfile', () => ({
  useMerchantProfile: () => ({
    data: {
      id: 'm1', businessName: 'Covelum', tradingName: null, status: 'ACTIVE',
      logoUrl: null, bannerUrl: null, description: null, websiteUrl: null,
      primaryCategoryId: null, primaryCategory: null, primaryDescriptorTag: null,
      subcategory: null, descriptor: 'Restaurant', highlights: [],
      vouchers: [], about: null, avgRating: null, reviewCount: 0, isFavourited: false,
      distance: null, nearestBranch: null,
      isOpenNow: true, openingHours: [], amenities: [], photos: [],
      branches: [{
        id: 'b1', name: 'Brightlingsea', isMainBranch: true, isActive: true,
        addressLine1: null, addressLine2: null, city: null, postcode: null,
        latitude: null, longitude: null, phone: null, email: null,
        distance: 100, isOpenNow: true, avgRating: 4.5, reviewCount: 12,
        openingHours: [], isFavourited: false,
      }],
      selectedBranch: {
        id: 'b1', name: 'Brightlingsea', isMainBranch: true, isActive: true,
        addressLine1: null, addressLine2: null, city: null, postcode: null, country: 'GB',
        latitude: null, longitude: null, phone: null, email: null, websiteUrl: null,
        logoUrl: null, bannerUrl: null, about: null,
        openingHours: [], photos: [], amenities: [],
        distance: 100, isOpenNow: true, avgRating: 4.5, reviewCount: 12, myReview: null,
        isFavourited: false,
      },
      // Critical: 'no-candidate' is NOT 'used-candidate', so the
      // reconcile gate's selectedBranchFallbackReason check would
      // PASS (without the isFocused guard) and mockRouterApi.replace would
      // fire.
      selectedBranchFallbackReason: 'no-candidate' as const,
    },
    isLoading: false,
    isError:   false,
  }),
}))

import { MerchantProfileScreen } from '@/features/merchant/screens/MerchantProfileScreen'

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  mockRouterApi.replace.mockClear()
  mockRouterApi.push.mockClear()
  mockRouterApi.back.mockClear()
  mockRouterApi.navigate.mockClear()
  mockRouterApi.dismissAll.mockClear()
  mockParams = {}
})

describe('MerchantProfileScreen — §W6.4 background-tab mockRouterApi.replace guard', () => {
  it('reconcile does NOT fire mockRouterApi.replace when the screen is NOT focused (background tab)', () => {
    // URL has no `branch` param (mimics handleMerchantTap's push from
    // Voucher Detail).  Server-resolved branch is 'b1', fallback
    // reason is 'no-candidate'.  Pre-Wave-6.4 the reconcile effect
    // would fire mockRouterApi.replace({ ..., branch: 'b1' }).  Post-fix,
    // the isFocusedRef gate is false (useFocusEffect mock is a
    // no-op) and the effect early-returns.
    mockParams = { from: 'favourites' }
    wrap(<MerchantProfileScreen id="m1" />)

    expect(mockRouterApi.replace).not.toHaveBeenCalled()
  })

  it('openWriteReview scrub does NOT fire mockRouterApi.replace when the screen is NOT focused', () => {
    // Even with the trigger conditions populated, the focus guard
    // blocks the replace.  Note: the scrub also needs
    // `autoOpenConsumed` to flip true (via ReviewsTab callback) —
    // the stubbed ReviewsTab in this file never calls
    // onAutoOpenConsumed, so this effect wouldn't fire anyway, but
    // the focus guard is the load-bearing gate per §W6.4.
    mockParams = {
      from:            'favourites',
      tab:             'reviews',
      openWriteReview: '1',
      fromRedemption:  'red-1',
    }
    wrap(<MerchantProfileScreen id="m1" />)
    expect(mockRouterApi.replace).not.toHaveBeenCalled()
  })

  it('branchChanged scrub does NOT fire mockRouterApi.replace when the screen is NOT focused', () => {
    mockParams = {
      from:          'favourites',
      branch:        'b1',
      tab:           'vouchers',
      branchChanged: '1',
    }
    wrap(<MerchantProfileScreen id="m1" />)
    expect(mockRouterApi.replace).not.toHaveBeenCalled()
  })
})
