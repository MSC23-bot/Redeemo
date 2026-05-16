// §BD-3 — Within-merchant branch-switch stale-data gate.
//
// Locked 2026-05-17 from device QA: when a user taps Switch on a
// branch card inside the Merchant Profile (e.g. Covelum Brightlingsea
// → Colchester), the previous branch's name / address / details
// stayed visible for ~1-2s while the new branch fetch was in flight.
// Owner direction: branch identity is load-bearing, so the user
// should NEVER see the old branch's details under a new branch URL.
//
// The fix: extend the existing §BD-1 cross-merchant gate with a
// within-merchant analogue. When the URL has explicitly demanded a
// specific `?branch=` AND the cached merchant payload's
// `selectedBranch.id` still belongs to the previous branch AND React
// Query is surfacing it as placeholder data, fall through to the
// MerchantProfileSkeleton instead of rendering the screen body.
//
// Counter-pins guard the §N11 contract intentionally: cold-open (no
// `?branch=`) flows through the legitimate `isLoading` branch, and
// the once-resolved state where `merchant.selectedBranch.id ===
// branchId` renders normally (no skeleton flash on every keepPrev
// boundary).

import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const initialMetrics = {
  frame:  { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

// ─── Component mocks ─────────────────────────────────────────────────────────

jest.mock('@/features/merchant/components/HeroSection', () => ({
  HeroBackdrop:     () => null,
  HeroNav:          () => null,
  HeroBannerSpacer: () => null,
  HERO_HEIGHT:      256,
}))
jest.mock('@/features/merchant/components/CollapsedHeader',  () => ({ CollapsedHeader: () => null, COMPACT_BAR_HEIGHT: 52 }))
jest.mock('@/features/merchant/components/MerchantDescriptor', () => ({ MerchantDescriptor: () => null }))
jest.mock('@/features/merchant/components/MetaRow',          () => ({ MetaRow: () => null }))
jest.mock('@/features/merchant/components/ActionRow',        () => ({ ActionRow: () => null }))
jest.mock('@/features/merchant/components/TabBar',           () => ({ TabBar: () => null }))
jest.mock('@/features/merchant/components/VouchersTab',      () => ({ VouchersTab: () => null }))
jest.mock('@/features/merchant/components/AboutTab',         () => ({ AboutTab: () => null }))
jest.mock('@/features/merchant/components/BranchesTab',      () => ({ BranchesTab: () => null }))
jest.mock('@/features/merchant/components/ReviewsTab',       () => ({ ReviewsTab: () => null }))
jest.mock('@/features/merchant/components/ContactSheet',     () => ({ ContactSheet: () => null }))
jest.mock('@/features/merchant/components/DirectionsSheet',  () => ({ DirectionsSheet: () => null }))
jest.mock('@/features/merchant/components/SuspendedBranchBanner', () => ({ SuspendedBranchBanner: () => null }))
jest.mock('@/features/merchant/components/AllBranchesUnavailable', () => ({ AllBranchesUnavailable: () => null }))

jest.mock('@/features/merchant/components/MerchantHeadline', () => ({
  MerchantHeadline: ({ merchantName }: { merchantName: string }) => {
    const { Text } = require('react-native')
    return <Text>HEADLINE_NAME={merchantName}</Text>
  },
}))

jest.mock('@/features/merchant/components/BranchContextBand', () => ({
  BranchContextBand: ({ branchLine, children }: { branchLine: string | null; children: React.ReactNode }) => {
    const { View, Text } = require('react-native')
    return (
      <View>
        {branchLine ? <Text testID="merchant-branch-line">{branchLine}</Text> : null}
        {children}
      </View>
    )
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

let mockBranchParam: string | undefined = undefined
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: () => ({ branch: mockBranchParam }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        try { return effect() } catch { /* defensive */ return undefined }
      }, [])
    },
  }
})

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeBranch(id: string, name: string) {
  return {
    id, name,
    isMainBranch: id === 'b1', isActive: true,
    addressLine1: `${name} High St`, addressLine2: null,
    city: name, postcode: 'AB1 2CD', country: 'GB',
    latitude: 51.5, longitude: -0.1,
    phone: null, email: null, websiteUrl: null,
    logoUrl: null, bannerUrl: null, about: null,
    openingHours: [],
    photos: [], amenities: [],
    distance: 1500, isOpenNow: true,
    avgRating: null, reviewCount: 0,
    myReview: null,
  }
}

const baseMerchant = {
  id: 'covelum-id', businessName: 'Covelum',
  tradingName: null, status: 'ACTIVE',
  logoUrl: null, bannerUrl: null, description: null, websiteUrl: null,
  primaryCategoryId: null, primaryCategory: null, primaryDescriptorTag: null,
  subcategory: null, descriptor: null, highlights: [],
  vouchers: [],
  about: null, avgRating: null, reviewCount: 0, isFavourited: false,
  distance: null, nearestBranch: null,
  isOpenNow: true, openingHours: [], amenities: [], photos: [],
  branches: [makeBranch('b1', 'Brightlingsea'), makeBranch('b2', 'Colchester')],
  selectedBranch: makeBranch('b1', 'Brightlingsea'),
  selectedBranchFallbackReason: 'used-candidate' as const,
}

const colchesterMerchant = {
  ...baseMerchant,
  selectedBranch: makeBranch('b2', 'Colchester'),
}

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

describe('MerchantProfileScreen — §BD-3 branch-switch stale-data gate', () => {
  beforeEach(() => {
    ;(merchantApi.getProfile as jest.Mock).mockReset()
    mockBranchParam = undefined
  })

  // Load-bearing pin: when the URL flips to a new ?branch= while the
  // previous branch's payload is still surfaced as React Query
  // placeholder data, the screen must render the skeleton — NOT the
  // previous branch's identity. Mirrors the device QA report
  // (Covelum Brightlingsea → Colchester showing Brightlingsea for
  // ~1-2s pre-§BD-3).
  it('hides Brightlingsea details while the Colchester fetch is pending after a branch switch', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    // First render: URL has ?branch=b1, Brightlingsea resolves.
    mockBranchParam = 'b1'
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(baseMerchant)
    const { findByText, queryByText, rerender, getByTestId } = wrap(
      <MerchantProfileScreen id="covelum-id" />,
      qc,
    )
    expect(await findByText('HEADLINE_NAME=Covelum')).toBeTruthy()
    // Brightlingsea's branch line is visible in the resolved state.
    expect(queryByText('Brightlingsea')).toBeTruthy()

    // User taps Switch → URL flips to ?branch=b2.  The Colchester
    // fetch is left pending so the keepPreviousData window is
    // observable.
    let resolveColchester: (v: any) => void = () => {}
    const colchesterPromise = new Promise<typeof colchesterMerchant>((res) => { resolveColchester = res })
    ;(merchantApi.getProfile as jest.Mock).mockReturnValueOnce(colchesterPromise)
    mockBranchParam = 'b2'

    rerender(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <QueryClientProvider client={qc}>
          <MerchantProfileScreen id="covelum-id" />
        </QueryClientProvider>
      </SafeAreaProvider>,
    )

    // The skeleton is mounted during the placeholder window — the
    // previous branch's name MUST NOT remain visible under the new
    // URL.
    expect(getByTestId('merchant-profile-skeleton')).toBeTruthy()
    expect(queryByText('Brightlingsea')).toBeNull()
    expect(queryByText('HEADLINE_NAME=Covelum')).toBeNull()

    // Resolve the Colchester fetch → screen swaps to the new branch.
    resolveColchester(colchesterMerchant)
    await waitFor(() => {
      expect(queryByText('HEADLINE_NAME=Covelum')).toBeTruthy()
      expect(queryByText('Colchester')).toBeTruthy()
    })
    expect(queryByText('Brightlingsea')).toBeNull()
  })

  // Counter-pin: cold-open (no URL ?branch=) must NOT hit the new
  // branch-switch gate. The legitimate isLoading branch handles the
  // first fetch. Without the `!!branchId` guard inside
  // `isBranchSwitchStale`, the gate would fire on every cold-open
  // because `merchant?.selectedBranch?.id !== null/undefined` is
  // trivially true.
  it('cold-open (no ?branch=) flows through the regular loading branch, not the branch-switch gate', async () => {
    mockBranchParam = undefined
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(baseMerchant)
    const { findByText, getByTestId, queryByTestId } = wrap(<MerchantProfileScreen id="covelum-id" />)

    // The screen starts in skeleton state (isLoading=true) — that's
    // legitimate cold-open behaviour.
    expect(getByTestId('merchant-profile-skeleton')).toBeTruthy()

    // Once the fetch resolves, the skeleton clears and the screen
    // body renders.
    await findByText('HEADLINE_NAME=Covelum')
    expect(queryByTestId('merchant-profile-skeleton')).toBeNull()
  })

  // Counter-pin: in the steady state (URL `?branch=b1` matches the
  // cached payload's `selectedBranch.id`), the branch-switch gate must
  // NOT fire on innocent re-renders. Otherwise we'd skeleton-flash on
  // every parent re-render that happens during the placeholderData
  // boundary.
  it('does not skeleton-flash when the resolved branch already matches the URL', async () => {
    mockBranchParam = 'b1'
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValue(baseMerchant)
    const { findByText, queryByTestId } = wrap(<MerchantProfileScreen id="covelum-id" />)
    await findByText('HEADLINE_NAME=Covelum')
    expect(queryByTestId('merchant-profile-skeleton')).toBeNull()
  })
})
