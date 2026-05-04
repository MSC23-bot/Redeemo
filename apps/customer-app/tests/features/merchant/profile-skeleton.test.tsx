import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the sub-components — they each have their own visual tests; here we
// only verify the screen composes them correctly and gates behaviour
// (loading / error / free-user voucher gate).
jest.mock('@/features/merchant/components/HeroSection', () => ({
  HeroSection: ({ isFavourited }: { isFavourited: boolean }) => {
    const { Text } = require('react-native')
    return <Text>HERO_FAV={String(isFavourited)}</Text>
  },
}))
jest.mock('@/features/merchant/components/MerchantDescriptor', () => ({
  MerchantDescriptor: ({ descriptor }: { descriptor: string | null }) => {
    const { Text } = require('react-native')
    return descriptor ? <Text>DESCRIPTOR={descriptor}</Text> : null
  },
}))

jest.mock('@/features/merchant/components/MetaRow', () => ({
  MetaRow: ({ avgRating, reviewCount }: { avgRating: number | null; reviewCount: number }) => {
    const { Text } = require('react-native')
    return (
      <>
        <Text>METAROW_RATING={avgRating ?? 'NULL'}</Text>
        <Text>METAROW_COUNT={reviewCount}</Text>
      </>
    )
  },
}))

jest.mock('@/features/merchant/components/ActionRow', () => ({
  ActionRow: ({ hasWebsite, onContact }: { hasWebsite: boolean; onContact: () => void }) => {
    const { Text, Pressable } = require('react-native')
    return (
      <>
        <Text>ACTIONROW_HASWEBSITE={String(hasWebsite)}</Text>
        <Pressable accessibilityLabel="open-contact" onPress={onContact}>
          <Text>OPEN_CONTACT</Text>
        </Pressable>
      </>
    )
  },
}))
// Real-shape TabBar mock so tab-switching tests can press individual tabs.
// The mock surfaces each tab's `count` so the Reviews-tab-count test (PR #33
// fix-up) can pin where the badge value comes from.
jest.mock('@/features/merchant/components/TabBar', () => ({
  TabBar: ({ tabs, activeTab, onTabPress }: any) => {
    const { Text, Pressable, View } = require('react-native')
    return (
      <View>
        {tabs.map((t: { id: string; label: string; count?: number }) => (
          <Pressable
            key={t.id}
            onPress={() => onTabPress(t.id)}
            accessibilityLabel={`tab-${t.id}`}
          >
            <Text>{t.label}({t.count ?? '-'}){t.id === activeTab ? '*' : ''}</Text>
          </Pressable>
        ))}
      </View>
    )
  },
}))
jest.mock('@/features/merchant/components/VouchersTab', () => ({
  VouchersTab: ({ onVoucherPress }: { onVoucherPress: (id: string) => void }) => {
    const { Text, Pressable } = require('react-native')
    return <Pressable onPress={() => onVoucherPress('v1')} accessibilityLabel="Tap voucher"><Text>VOUCHERS_TAB</Text></Pressable>
  },
}))
jest.mock('@/features/merchant/components/AboutTab',    () => ({
  AboutTab: () => { const { Text } = require('react-native'); return <Text>ABOUT_TAB</Text> },
}))
// BranchesTab mock surfaces `currentBranchId` so regression tests can pin
// which branch id is passed in as the "current" (excluded) branch.
// Task 13: nearestBranchId removed; replaced by currentBranchId + action handlers.
jest.mock('@/features/merchant/components/BranchesTab', () => ({
  BranchesTab: ({ currentBranchId }: { currentBranchId: string }) => {
    const { Text } = require('react-native')
    return <Text>BRANCHES_TAB|current={currentBranchId ?? 'NULL'}</Text>
  },
}))
jest.mock('@/features/merchant/components/ReviewsTab',  () => ({
  ReviewsTab: () => { const { Text } = require('react-native'); return <Text>REVIEWS_TAB</Text> },
}))
jest.mock('@/features/merchant/components/ContactSheet',     () => ({
  ContactSheet: ({ visible }: { visible: boolean }) => {
    const { Text } = require('react-native')
    return visible ? <Text>CONTACT_SHEET_VISIBLE</Text> : null
  },
}))
jest.mock('@/features/merchant/components/DirectionsSheet',  () => ({ DirectionsSheet:  () => null }))
jest.mock('@/features/merchant/components/FreeUserGateModal', () => ({
  FreeUserGateModal: ({ visible }: { visible: boolean }) => {
    const { Text } = require('react-native')
    return visible ? <Text>GATE_VISIBLE</Text> : null
  },
}))
// P2.8 mocks — BranchChip / BranchPickerSheet / SuspendedBranchBanner /
// AllBranchesUnavailable each have dedicated unit tests; here we only
// verify the screen wires them up correctly.
jest.mock('@/features/merchant/components/BranchChip', () => ({
  BranchChip: ({ isMultiBranch, onPress }: { isMultiBranch: boolean; onPress: () => void }) => {
    const { Text, Pressable } = require('react-native')
    if (!isMultiBranch) return null
    return (
      <Pressable accessibilityLabel="branch-chip" onPress={onPress}>
        <Text>CHIP_MULTI={String(isMultiBranch)}</Text>
      </Pressable>
    )
  },
}))
jest.mock('@/features/merchant/components/BranchPickerSheet', () => ({
  BranchPickerSheet: ({ visible, branches, onPick }: { visible: boolean; branches: Array<{ id: string; name: string }>; onPick: (id: string) => void }) => {
    const { Text, Pressable } = require('react-native')
    if (!visible) return null
    return (
      <>
        <Text>PICKER_VISIBLE</Text>
        {branches.map(b => (
          <Pressable key={b.id} accessibilityLabel={`pick-${b.id}`} onPress={() => onPick(b.id)}>
            <Text>{b.name}</Text>
          </Pressable>
        ))}
      </>
    )
  },
}))
jest.mock('@/features/merchant/components/SuspendedBranchBanner', () => ({
  SuspendedBranchBanner: ({ visible }: { visible: boolean }) => {
    const { Text } = require('react-native')
    return visible ? <Text>BANNER_VISIBLE</Text> : null
  },
}))
jest.mock('@/features/merchant/components/AllBranchesUnavailable', () => ({
  AllBranchesUnavailable: ({ businessName }: { businessName: string }) => {
    const { Text } = require('react-native')
    return <Text>ALL_UNAVAILABLE_{businessName}</Text>
  },
}))

jest.mock('@/features/merchant/components/MerchantHeadline', () => ({
  MerchantHeadline: ({ merchantName, branchLine }: { merchantName: string; branchLine: string | null }) => {
    const { Text } = require('react-native')
    return (
      <>
        <Text>HEADLINE_NAME={merchantName}</Text>
        {branchLine ? <Text testID="merchant-branch-line">{branchLine}</Text> : null}
      </>
    )
  },
}))

jest.mock('@/hooks/useFavourite', () => ({
  useFavourite: () => ({ isFavourited: false, toggle: jest.fn(), isLoading: false }),
}))
// MerchantProfileScreen now reads GPS via useUserLocation so the server can
// compute distance + nearestBranch. Stub it idle so these tests don't touch
// expo-location's native module (which throws at module-load in jest).
jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ status: 'idle', location: null, requestPermission: jest.fn() }),
}))
let mockSubscribed = true
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ isSubscribed: mockSubscribed, isSubLoading: false, subscription: null }),
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: (s: any) => any) => sel({ status: 'authed', user: { id: 'u1' } })),
}))
// P2.8 — useBranchSelection reads `?branch=` via useLocalSearchParams and
// drives URL changes via router.replace. Mock both. `mockBranchParam` lets
// tests simulate "URL already has branch=X" if needed.
let mockBranchParam: string | undefined = undefined
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ branch: mockBranchParam }),
}))

import { MerchantProfileScreen } from '@/features/merchant/screens/MerchantProfileScreen'
import { merchantApi } from '@/lib/api/merchant'
import { router } from 'expo-router'

jest.spyOn(merchantApi, 'getProfile')

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

// P2.8 — selectedBranch fixture mirrors the rich branch shape returned by
// the backend resolver (P1). The screen now reads branch-scoped data from
// here, NOT from the legacy top-level merchant.{openingHours,photos,…}
// fields (which are still served for R1 dual-write but ignored by UI).
const selectedBranchFixture = {
  id: 'b1', name: 'Brightlingsea',
  isMainBranch: true, isActive: true,
  addressLine1: '1 High St', addressLine2: null,
  city: 'Brightlingsea', postcode: 'CO7 0AA', country: 'GB',
  latitude: 51.81, longitude: 1.02,
  phone: null, email: null, websiteUrl: null,
  logoUrl: null, bannerUrl: null, about: null,
  openingHours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false }],
  photos: [], amenities: [],
  distance: 1500, isOpenNow: true,
  avgRating: 4.5, reviewCount: 12,
  myReview: null,
}

const merchant = {
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
  isOpenNow: true, openingHours: [], amenities: [], photos: [], branches: [],
  selectedBranch: selectedBranchFixture,
  selectedBranchFallbackReason: 'used-candidate' as const,
}

describe('MerchantProfileScreen (M2)', () => {
  beforeEach(() => {
    ;(merchantApi.getProfile as jest.Mock).mockReset()
    mockSubscribed = true
    mockBranchParam = undefined
    ;(router.push as jest.Mock).mockClear()
    ;(router.replace as jest.Mock).mockClear()
  })

  it('renders the missing-id error block when id is undefined', () => {
    const { getByText } = wrap(<MerchantProfileScreen id={undefined} />)
    expect(getByText('No merchant id')).toBeTruthy()
  })

  it('shows a loading indicator while the query is pending', () => {
    ;(merchantApi.getProfile as jest.Mock).mockReturnValueOnce(new Promise(() => {}))
    const { getByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(getByLabelText('Loading merchant profile')).toBeTruthy()
  })

  it('composes Hero + Headline with the merchant data on success', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('HEADLINE_NAME=The Coffee House')).toBeTruthy()
    expect(await findByText('HERO_FAV=false')).toBeTruthy()
  })

  // Regression for the on-device "descriptor too generic" bug: the screen
  // must pass the server-computed `descriptor` field (Plan 1.5 §3.6 — e.g.
  // "Indian Restaurant" for Covelum) into MerchantDescriptor as `descriptor`,
  // NOT the raw `primaryCategory.name` (which would render just
  // "Restaurant"). See plan §8.1.
  it('passes merchant.descriptor (NOT primaryCategory.name) to MerchantDescriptor', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      descriptor: 'Indian Restaurant',
      primaryCategory: {
        id: 'cat-restaurant', name: 'Restaurant',
        pinColour: null, pinIcon: null, descriptorSuffix: null, parentId: 'cat-food',
      },
    })
    const { findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('DESCRIPTOR=Indian Restaurant')).toBeTruthy()
    // The bug shape must NOT be rendered.
    expect(queryByText('DESCRIPTOR=Restaurant')).toBeNull()
  })

  it('renders nothing for descriptor when descriptor is empty', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({ ...merchant, descriptor: '' })
    const { findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    // MerchantDescriptor renders null when empty — HEADLINE still renders.
    expect(await findByText('HEADLINE_NAME=The Coffee House')).toBeTruthy()
    expect(queryByText(/^DESCRIPTOR=/)).toBeNull()
  })

  it('renders the error block on fetch failure', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText("Couldn't load merchant")).toBeTruthy()
    expect(await findByText('boom')).toBeTruthy()
  })

  it('subscribed user: tapping a voucher routes to /voucher/[id]', async () => {
    mockSubscribed = true
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('Tap voucher'))
    expect(router.push).toHaveBeenCalledWith('/voucher/v1')
  })

  it('free user: tapping a voucher shows the free-user gate, no nav', async () => {
    mockSubscribed = false
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByLabelText, findByText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('Tap voucher'))
    expect(await findByText('GATE_VISIBLE')).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
  })

  // ── Tab switching (plan §12 "all 4 tab switches") ────────────────────────────
  it('renders the Vouchers tab content by default', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('VOUCHERS_TAB')).toBeTruthy()
  })

  it('switches to About when the About tab is pressed', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByLabelText, findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('tab-about'))
    expect(await findByText('ABOUT_TAB')).toBeTruthy()
    expect(queryByText('VOUCHERS_TAB')).toBeNull()
  })

  it('hides the Branches tab on a single-branch merchant (intended UX)', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      branches: [{ id: 'b1', name: 'Only', isMainBranch: true, isActive: true,
        addressLine1: null, addressLine2: null,
        city: null, postcode: null, latitude: null, longitude: null,
        phone: null, email: null, distance: null, isOpenNow: true,
        avgRating: null, reviewCount: 0, openingHours: [] }],
    })
    const { queryByLabelText, findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByLabelText('tab-vouchers')).toBeTruthy()
    expect(queryByLabelText('tab-branches')).toBeNull()
  })

  it('shows the Branches tab and switches to it on a multi-branch merchant', async () => {
    const branchA = { id: 'b1', name: 'A', isMainBranch: true, isActive: true,
      addressLine1: null, addressLine2: null,
      city: null, postcode: null, latitude: null, longitude: null,
      phone: null, email: null, distance: 1000, isOpenNow: true,
      avgRating: null, reviewCount: 0, openingHours: [] }
    const branchB = { ...branchA, id: 'b2', name: 'B', isMainBranch: false, distance: 500 }
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({ ...merchant, branches: [branchA, branchB] })
    const { findByLabelText, findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('tab-branches'))
    expect(await findByText(/^BRANCHES_TAB/)).toBeTruthy()
    expect(queryByText('VOUCHERS_TAB')).toBeNull()
  })

  it('switches to Reviews tab', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByLabelText, findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('tab-reviews'))
    expect(await findByText('REVIEWS_TAB')).toBeTruthy()
    expect(queryByText('VOUCHERS_TAB')).toBeNull()
  })

  // PR #33 fix-up: Reviews tab badge must reflect the *selected branch's*
  // review count, not the merchant-wide aggregate. Caught in 2026-05-03 QA
  // — page showed "8" reviews on the tab while the branch had 1. Fixture
  // has selectedBranch.reviewCount=12 vs merchant.reviewCount=0; if the
  // pre-fix code path runs the badge would show "Reviews(0)".
  it('Reviews tab badge uses selectedBranch.reviewCount, not merchant.reviewCount', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText(/Reviews\(12\)/)).toBeTruthy()
    expect(queryByText(/Reviews\(0\)/)).toBeNull()
  })

  // ── P2.8 — branch chip / picker / banner / all-suspended wiring ───────────────
  it('renders the BranchChip on a multi-branch merchant', async () => {
    const branchA = { ...selectedBranchFixture, id: 'b1' }
    const branchB = { ...selectedBranchFixture, id: 'b2', name: 'Colchester', isMainBranch: false }
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      branches: [branchA, branchB],
    })
    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByLabelText('branch-chip')).toBeTruthy()
  })

  it('renders the SuspendedBranchBanner when fallbackReason=candidate-inactive', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      selectedBranchFallbackReason: 'candidate-inactive' as const,
    })
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('BANNER_VISIBLE')).toBeTruthy()
  })

  it('renders AllBranchesUnavailable when selectedBranch is null', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      selectedBranch: null,
      selectedBranchFallbackReason: 'all-suspended' as const,
    })
    const { findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('ALL_UNAVAILABLE_The Coffee House')).toBeTruthy()
    // Early return — none of the regular surfaces render.
    expect(queryByText('VOUCHERS_TAB')).toBeNull()
    expect(queryByText(/CHIP_NAME=/)).toBeNull()
  })

  it('switching branch via the picker calls router.replace', async () => {
    const branchA = { id: 'b1', name: 'A', isMainBranch: true, isActive: true,
      addressLine1: null, addressLine2: null,
      city: null, postcode: null, latitude: null, longitude: null,
      phone: null, email: null, distance: 1000, isOpenNow: true,
      avgRating: null, reviewCount: 0, openingHours: [] }
    const branchB = { ...branchA, id: 'b2', name: 'B', isMainBranch: false, distance: 500 }
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      branches: [branchA, branchB],
    })
    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('branch-chip'))
    fireEvent.press(await findByLabelText('pick-b2'))
    // useBranchSelection.select() → router.replace({ pathname, params: { id, branch } })
    expect(router.replace).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/(app)/merchant/[id]',
      params: expect.objectContaining({ id: 'm1', branch: 'b2' }),
    }))
  })

  // ── P2.8 review fix-up regressions ──────────────────────────────────────────
  // Sticky-header pin: Task 8 explodes MetaSection into 3 components
  // (MerchantDescriptor + MetaRow + ActionRow) and moves BranchChip up.
  // ScrollView children are now:
  // [0] SuspendedBranchBanner, [1] HeroSection, [2] MerchantHeadline,
  // [3] BranchChip, [4] MerchantDescriptor, [5] MetaRow, [6] ActionRow,
  // [7] TabBar ← sticky. Assert the prop directly.
  it('pins TabBar sticky via stickyHeaderIndices=[7]', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByTestId } = wrap(<MerchantProfileScreen id="m1" />)
    const scroll = await findByTestId('merchant-profile-scroll')
    expect(scroll.props.stickyHeaderIndices).toEqual([7])
  })

  // Spec §4.7 — switching branch must close any open sheets (state-preservation
  // contract). The active tab is preserved (not asserted here), but contact /
  // directions / picker / gate / banner-dismiss state is reset on branchId
  // change. We simulate the URL flip by mutating mockBranchParam (which
  // useLocalSearchParams reads) and rerendering — that's the cheapest way to
  // trigger the useEffect([branchId]) without coupling to expo-router internals.
  it('closes ContactSheet when the user switches branches', async () => {
    const branchA = { id: 'b1', name: 'A', isMainBranch: true, isActive: true,
      addressLine1: null, addressLine2: null,
      city: null, postcode: null, latitude: null, longitude: null,
      phone: null, email: null, distance: 1000, isOpenNow: true,
      avgRating: null, reviewCount: 0, openingHours: [] }
    const branchB = { ...branchA, id: 'b2', name: 'B', isMainBranch: false, distance: 500 }
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValue({
      ...merchant,
      branches: [branchA, branchB],
    })
    mockBranchParam = 'b1'
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { findByLabelText, findByText, queryByText, rerender } = render(
      <QueryClientProvider client={qc}><MerchantProfileScreen id="m1" /></QueryClientProvider>
    )
    // Open contact sheet via ActionRow's onContact callback.
    fireEvent.press(await findByLabelText('open-contact'))
    expect(await findByText('CONTACT_SHEET_VISIBLE')).toBeTruthy()
    // Simulate a URL flip from ?branch=b1 to ?branch=b2 (what useBranchSelection.select
    // would trigger via router.replace, then the route reading new search params).
    mockBranchParam = 'b2'
    rerender(
      <QueryClientProvider client={qc}><MerchantProfileScreen id="m1" /></QueryClientProvider>
    )
    expect(queryByText('CONTACT_SHEET_VISIBLE')).toBeNull()
  })

  // ── PR #33 fix-up #3 regressions (2026-05-03 QA) ──────────────────────────────

  // #1 (BLOCKER) — keepPreviousData / reconcile race: when the user picks a
  // new branch via the chip, the URL flips immediately but `merchant` keeps
  // the prior fetch's data on screen for a frame (selectedBranch.id=prev,
  // fallbackReason='used-candidate'). The reconcile effect must NOT fire
  // router.replace in that state — otherwise the URL is silently undone and
  // the user has to tap the same branch twice. The gate is fallbackReason
  // !== 'used-candidate'. We construct the bug condition directly: API
  // response says selectedBranch=b1 + used-candidate, URL says b2.
  it('does NOT undo the URL when fallbackReason=used-candidate (keepPreviousData race fix)', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      selectedBranch: { ...selectedBranchFixture, id: 'b1', name: 'Brightlingsea' },
      selectedBranchFallbackReason: 'used-candidate' as const,
    })
    mockBranchParam = 'b2'
    ;(router.replace as jest.Mock).mockClear()
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    // Wait for the fetch + effects to settle before asserting.
    await findByText('HEADLINE_NAME=The Coffee House')
    expect(router.replace).not.toHaveBeenCalled()
  })

  // Counter-test: when the server actually fell back from an invalid candidate
  // (used-candidate is FALSE), reconcile must run so the URL is replaced with
  // the resolved branch. Otherwise the URL stays at ?branch=invalid forever.
  it('DOES reconcile the URL when fallbackReason !== used-candidate (server fallback path)', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      selectedBranch: { ...selectedBranchFixture, id: 'b-fallback', name: 'Fallback' },
      selectedBranchFallbackReason: 'candidate-not-found' as const,
    })
    mockBranchParam = 'invalid'
    ;(router.replace as jest.Mock).mockClear()
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    await findByText('HEADLINE_NAME=The Coffee House')
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/merchant/[id]',
        params: expect.objectContaining({ branch: 'b-fallback' }),
      }),
    )
  })

  // Task 13 — currentBranchId correctness: the Other Locations tab must receive
  // the SELECTED branch id (sb.id) as `currentBranchId` so that branch is
  // excluded from the "Other Locations" list. The selected branch changes when
  // the user picks a branch via the chip — the prop must track that selection.
  it('Other Locations tab receives sb.id as currentBranchId (Task 13)', async () => {
    const branchA = { id: 'b1', name: 'Brightlingsea', isMainBranch: true, isActive: true,
      addressLine1: null, addressLine2: null,
      city: null, postcode: null, latitude: null, longitude: null,
      phone: null, email: null, distance: 1000, isOpenNow: true,
      avgRating: null, reviewCount: 0, openingHours: [] }
    const branchB = { ...branchA, id: 'b2', name: 'Colchester', isMainBranch: false, distance: 5000 }
    // selectedBranch is b2 (user picked it). The mock asserts sb.id flows in.
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      branches: [branchA, branchB],
      selectedBranch: { ...selectedBranchFixture, id: 'b2', name: 'Colchester' },
    })
    const { findByLabelText, findByText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('tab-branches'))
    // BranchesTab mock surfaces currentBranchId — assert it's b2 (the selected branch).
    expect(await findByText('BRANCHES_TAB|current=b2')).toBeTruthy()
  })

  // Companion: when the default selectedBranch is b1, currentBranchId must be b1.
  it('Other Locations tab receives currentBranchId=b1 when selectedBranch=b1', async () => {
    const branchA = { id: 'b1', name: 'A', isMainBranch: true, isActive: true,
      addressLine1: null, addressLine2: null,
      city: null, postcode: null, latitude: null, longitude: null,
      phone: null, email: null, distance: null, isOpenNow: true,
      avgRating: null, reviewCount: 0, openingHours: [] }
    const branchB = { ...branchA, id: 'b2', name: 'B', isMainBranch: false }
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      branches: [branchA, branchB],
      selectedBranch: { ...selectedBranchFixture, id: 'b1' },
    })
    const { findByLabelText, findByText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('tab-branches'))
    expect(await findByText('BRANCHES_TAB|current=b1')).toBeTruthy()
  })

  // ── MerchantHeadline wiring (Task 6 — §6.1) ─────────────────────────────────

  it('renders the MerchantHeadline with branch line on multi-branch', async () => {
    const branchA = { ...selectedBranchFixture, id: 'b1' }
    const branchB = { ...selectedBranchFixture, id: 'b2', name: 'Colchester', city: 'Colchester', isMainBranch: false }
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      branches: [branchA, branchB],
    })
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('HEADLINE_NAME=The Coffee House')).toBeTruthy()
    // selectedBranchFixture.city is "Brightlingsea" so the branch line shows it
    expect(await findByText('Brightlingsea')).toBeTruthy()
  })

  it('hides the branch line on single-branch merchants', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      branches: [{
        id: 'b1', name: 'Only', isMainBranch: true, isActive: true,
        addressLine1: null, addressLine2: null, city: null, postcode: null,
        latitude: null, longitude: null, phone: null, email: null,
        distance: null, isOpenNow: true, avgRating: null, reviewCount: 0,
        openingHours: [],
      }],
    })
    const { findByText, queryByTestId } = wrap(<MerchantProfileScreen id="m1" />)
    await findByText('HEADLINE_NAME=The Coffee House')
    expect(queryByTestId('merchant-branch-line')).toBeNull()
  })
})
