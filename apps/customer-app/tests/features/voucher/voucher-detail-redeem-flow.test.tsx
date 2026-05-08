// End-to-end M2 redemption flow + branch-attribution priority pin.
//
// Mounts the real VoucherDetailScreen (NOT the useRedeem-stubbed M1
// tests) and mocks the underlying `redemptionApi.redeem` so we can:
//   • assert the actual branchId sent to the API (three-tier priority)
//   • drive every error path the screen handles (NULL_BRANCH client-
//     side guard + the 8 backend error codes)
//   • verify the picker → PIN → success → state-3 happy path
//
// Provides a QueryClientProvider since the screen now uses useRedeem
// (which calls useQueryClient).

import React from 'react'
import { fireEvent, render, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

// ── BottomSheet stub (renders inline; visible toggles via prop) ─────────
jest.mock('@/design-system/motion/BottomSheet', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    BottomSheet: ({ visible, children }: any) =>
      visible ? React.createElement(View, { testID: 'bottom-sheet' }, children) : null,
  }
})

// ── expo-linear-gradient stub ────────────────────────────────────────────
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))

// ── expo-screen-capture mock ────────────────────────────────────────────
// Voucher Detail mounts `useScreenCaptureProtection` AND (locked
// 2026-05-09 PR #49 device QA) `useScreenshotGuard` when the code is
// visible. The mock lets us:
//   - assert prevent/allow native calls (preventScreenCaptureAsync /
//     allowScreenCaptureAsync) — already pinned in §AE6 below;
//   - capture the screenshot-listener callback so a test can simulate
//     an iOS screenshot firing and assert the banner appears.
//
// `addScreenshotListener` defaults to a no-op return; tests that want
// to fire the listener override the mock implementation in beforeEach.
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync:   jest.fn().mockResolvedValue(undefined),
  addScreenshotListener:     jest.fn(() => ({ remove: jest.fn() })),
}))

// ── ShowToStaff mock ────────────────────────────────────────────────────
// M3 Task 16+17 introduced ShowToStaff as a Modal target wired from
// SuccessPopup AND from RedemptionDetailsCard. We mock it here so the
// existing 46 redeem-flow tests don't have to render the real
// full-screen surface (which has its own 24-case suite). The mock
// captures props as a JSON string in `accessibilityLabel` so M3d
// integration tests can assert wiring without globalThis state.
jest.mock('@/features/voucher/components/ShowToStaff', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    ShowToStaff: jest.fn((props) =>
      React.createElement(View, {
        testID: 'show-to-staff-mounted',
        accessibilityLabel: JSON.stringify({
          code:         props.redemptionCode,
          branch:       props.branchName,
          title:        props.voucherTitle,
          type:         props.voucherType,
          merchant:     props.merchantName,
          customerName: props.customerName,
        }),
      }),
    ),
  }
})

// ── expo-router stub ────────────────────────────────────────────────────
let mockParams: Record<string, string | undefined> = { id: 'v1' }
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({
      push: mockPush, replace: mockReplace, back: mockBack,
      canGoBack: () => true,
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        try { return effect() } catch { return undefined }
      }, [])
    },
  }
})

// ── Voucher / merchant / subscription / location mocks ─────────────────
let mockVoucherData: any = null
jest.mock('@/features/voucher/hooks/useCustomerVoucher', () => ({
  useCustomerVoucher: () => ({
    data: mockVoucherData, isLoading: false, isError: false,
    // refetch must return a Promise — VoucherDetailScreen calls
    // `.catch()` on the result inside the ShowToStaff onValidated
    // handler (PR #49 review fix).
    refetch: jest.fn().mockResolvedValue({ data: mockVoucherData }),
  }),
}))
;(globalThis as any).__voucherProfileMock__ = {
  data: null as any, isLoading: false, isError: false, isFetching: false, spy: jest.fn(),
}
jest.mock('@/features/merchant/hooks/useMerchantProfile', () => ({
  useMerchantProfile: (id: string | undefined, opts: any) => {
    const m = (globalThis as any).__voucherProfileMock__
    m.spy(id, opts)
    return {
      data:       m.data,
      isLoading:  m.isLoading,
      isError:    m.isError,
      // `isFetching` toggles independently of `data`/`isLoading` —
      // simulates React Query's `keepPreviousData` window where data
      // is the previous snapshot but a refetch is in flight.
      isFetching: m.isFetching ?? false,
    }
  },
}))
let mockSubscribed = true
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ isSubscribed: mockSubscribed, isSubLoading: false, subscription: null }),
}))
jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ status: 'idle', location: null, requestPermission: jest.fn() }),
}))

// ── redemptionApi mock — the heart of these integration tests ──────────
jest.mock('@/lib/api/redemption', () => {
  const actual = jest.requireActual('@/lib/api/redemption')
  return {
    ...actual,
    redemptionApi: {
      redeem: jest.fn(),
      getMyRedemption: jest.fn(),
      listMyRedemptions: jest.fn(),
      // Used by `useScreenshotGuard` when an iOS screenshot fires while
      // the code is visible. Stub returns a resolved promise so the
      // hook's best-effort telemetry POST never rejects in tests.
      postScreenshotFlag: jest.fn().mockResolvedValue({ accepted: true }),
    },
  }
})

import { VoucherDetailScreen } from '@/features/voucher/screens/VoucherDetailScreen'
import { redemptionApi } from '@/lib/api/redemption'
import * as ScreenCapture from 'expo-screen-capture'

// ── Fixtures ──────────────────────────────────────────────────────────
function baseVoucher(overrides: any = {}) {
  return {
    id: 'v1',
    title: 'Free Filter Coffee with Any Thali',
    type: 'FREEBIE' as const,
    description: 'Order any thali plate and get a complimentary coffee.',
    terms: 'In-house only. Cannot be combined.',
    imageUrl: null, estimatedSaving: 2.5, expiryDate: null,
    code: null, status: 'ACTIVE', approvalStatus: 'APPROVED',
    merchant: {
      id: 'm1', businessName: 'Covelum Restaurant', tradingName: null,
      logoUrl: null, status: 'ACTIVE',
    },
    isRedeemedThisCycle: false, isFavourited: false,
    // Subscribed user → backend returns the cycle-end ISO. Tests that
    // need the `null` (free user / cancelled sub) variant override
    // explicitly via `baseVoucher({ availableAgainAt: null })`.
    availableAgainAt: '2026-06-05T00:00:00.000Z',
    ...overrides,
  }
}
function makeBranch(id: string, name: string, distance: number | null = 1500) {
  return {
    id, name,
    isMainBranch: id === 'b1', isActive: true,
    addressLine1: null, addressLine2: null, city: name,
    postcode: null, country: 'GB',
    latitude: null, longitude: null,
    phone: null, email: null, websiteUrl: null,
    logoUrl: null, bannerUrl: null, about: null,
    openingHours: [], photos: [], amenities: [],
    distance, isOpenNow: true, avgRating: 4.6, reviewCount: 12,
    myReview: null,
  }
}
function makeMerchant(opts: { selectedBranchId?: string | null; branches: any[] } = { branches: [] }) {
  const branches = opts.branches.length > 0 ? opts.branches : [makeBranch('b1', 'Brightlingsea')]
  const selectedId = opts.selectedBranchId
  const selectedBranch = selectedId === null
    ? null
    : branches.find((b: any) => b.id === (selectedId ?? 'b1')) ?? null
  return {
    id: 'm1', businessName: 'Covelum Restaurant',
    branches, selectedBranch,
    selectedBranchFallbackReason: 'used-candidate' as const,
    descriptor: 'Indian Restaurant',
  }
}
const successResponse = {
  id: 'r1', userId: 'u1', voucherId: 'v1', branchId: 'b1',
  redemptionCode: 'A7K2P9X4', estimatedSaving: 2.5,
  isValidated: false, redeemedAt: '2026-05-06T14:00:00Z',
}

// ── Render harness ────────────────────────────────────────────────────
const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}
function wrap(ui: React.ReactElement, qc?: QueryClient) {
  const client = qc ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  mockParams = { id: 'v1' }
  mockVoucherData = baseVoucher()
  mockSubscribed = true
  ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({ branches: [makeBranch('b1', 'Brightlingsea')] })
  ;(globalThis as any).__voucherProfileMock__.isLoading = false
  ;(globalThis as any).__voucherProfileMock__.isError = false
  ;(globalThis as any).__voucherProfileMock__.isFetching = false
  mockPush.mockClear()
  mockReplace.mockClear()
  mockBack.mockClear()
  ;(redemptionApi.redeem as jest.Mock).mockReset()
  ;(redemptionApi.getMyRedemption as jest.Mock).mockReset()
  ;(redemptionApi.listMyRedemptions as jest.Mock).mockReset()
  ;(ScreenCapture.preventScreenCaptureAsync as jest.Mock).mockClear()
  ;(ScreenCapture.allowScreenCaptureAsync as jest.Mock).mockClear()
  ;(ScreenCapture.addScreenshotListener as jest.Mock).mockClear()
  ;(ScreenCapture.addScreenshotListener as jest.Mock).mockImplementation(() => ({ remove: jest.fn() }))
})

// ─────────────────────────────────────────────────────────────────────
// Branch attribution — three-tier priority
// ─────────────────────────────────────────────────────────────────────

describe('Voucher Detail M2 — branch-attribution-at-mutation-time', () => {
  it('TIER 2 (single branch): URL=B1, no picker → mutation sends B1', async () => {
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea')],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(successResponse)

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))

    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')

    await waitFor(() => {
      expect(redemptionApi.redeem).toHaveBeenCalledWith({
        voucherId: 'v1', branchId: 'b1', pin: '1234',
      })
    })
  })

  it('TIER 1 (picker-local wins over stale URL): user confirms B2, mutation sends B2', async () => {
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea'), makeBranch('b2', 'Colchester', 12_000)],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue({ ...successResponse, branchId: 'b2' })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))

    // Picker opens because multi-branch.
    await waitFor(() => expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy())
    fireEvent.press(getByTestId('branch-picker-row-b2'))
    fireEvent.press(getByTestId('branch-picker-confirm'))

    // PIN sheet opens immediately. URL hasn't synchronously caught up
    // (router.replace fired but mockReplace just records it). The
    // picker-local branch source must be the priority winner here.
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')

    await waitFor(() => {
      expect(redemptionApi.redeem).toHaveBeenCalledWith({
        voucherId: 'v1', branchId: 'b2', pin: '1234',
      })
    })

    // router.replace was called with the new branch — picker confirm
    // updates the URL too, so future renders / queries pick up B2.
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('branch=b2'))
  })

  it('TIER 3 (cold-open fallback): no URL branch → mutation uses selectedBranch.id', async () => {
    mockParams = { id: 'v1' } // no branch param
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea')],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(successResponse)

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')

    await waitFor(() => {
      expect(redemptionApi.redeem).toHaveBeenCalledWith({
        voucherId: 'v1', branchId: 'b1', pin: '1234',
      })
    })
  })
})

// ─────────────────────────────────────────────────────────────────────
// Happy-path end-to-end flow
// ─────────────────────────────────────────────────────────────────────

describe('Voucher Detail M2 — happy-path end-to-end', () => {
  it('multi-branch: CTA → picker → confirm → PIN → success popup', async () => {
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea'), makeBranch('b2', 'Colchester', 12_000)],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(successResponse)

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)

    // Tap CTA.
    fireEvent.press(getByTestId('redeem-cta-active'))
    expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy()
    expect(queryByTestId('pin-entry-sheet')).toBeNull()

    // Confirm B1 (current).
    fireEvent.press(getByTestId('branch-picker-confirm'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())

    // Submit PIN.
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')

    // Success popup mounts (the modal's testID renders inside the
    // modal-content tree).
    await waitFor(() => expect(getByTestId('success-popup')).toBeTruthy())
    expect(queryByTestId('pin-entry-sheet')).toBeNull()

    // Tap Done → popup closes.
    fireEvent.press(getByTestId('success-done'))
    await waitFor(() => expect(queryByTestId('success-popup')).toBeNull())
  })

  it('single-branch: CTA → PIN sheet directly (no picker)', async () => {
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea')],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(successResponse)

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)

    fireEvent.press(getByTestId('redeem-cta-active'))
    expect(queryByTestId('voucher-branch-picker-sheet')).toBeNull()
    expect(getByTestId('pin-entry-sheet')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────
// Error path coverage
// ─────────────────────────────────────────────────────────────────────

describe('Voucher Detail M2 — backend error handling', () => {
  beforeEach(() => {
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', branches: [makeBranch('b1', 'Brightlingsea')],
    })
  })

  it('INVALID_PIN keeps the PIN sheet open and shows the attempts-remaining bar', async () => {
    ;(redemptionApi.redeem as jest.Mock).mockRejectedValue({
      code: 'INVALID_PIN', message: 'Wrong', statusCode: 400, remainingAttempts: 4,
    })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    fireEvent.changeText(getByTestId('pin-input-hidden'), '0000')

    await waitFor(() => expect(getByTestId('pin-error-bar')).toBeTruthy())
    // Sheet still open.
    expect(getByTestId('pin-entry-sheet')).toBeTruthy()
  })

  it('PIN_RATE_LIMIT_EXCEEDED renders the lockout card (replaces input)', async () => {
    ;(redemptionApi.redeem as jest.Mock).mockRejectedValue({
      code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'Locked', statusCode: 429, retryAfter: 540,
    })

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())

    await act(async () => {
      fireEvent.changeText(getByTestId('pin-input-hidden'), '0000')
    })

    await waitFor(
      () => expect(queryByTestId('pin-lockout-card')).toBeTruthy(),
      { timeout: 3000 },
    )
    expect(queryByTestId('pin-input-hidden')).toBeNull()
  })

  it('ALREADY_REDEEMED closes the PIN sheet (refetch will route to state-3)', async () => {
    ;(redemptionApi.redeem as jest.Mock).mockRejectedValue({
      code: 'ALREADY_REDEEMED', message: 'Used', statusCode: 409,
    })

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())

    await act(async () => {
      fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    })

    await waitFor(
      () => expect(queryByTestId('pin-entry-sheet')).toBeNull(),
      { timeout: 3000 },
    )
    expect(queryByTestId('success-popup')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// State-3 surface (immediate after redemption + return-visit fallback)
// ─────────────────────────────────────────────────────────────────────

describe('Voucher Detail M2 — state-3 (already redeemed)', () => {
  it('return visit (no lastRedemption in memory, no persisted) shows the redeemed hero treatment but NOT the RedemptionDetailsCard', () => {
    // M3 §AE: the standalone RedeemedBadge pill + middle-page seal
    // were consolidated into a single hero-overlay seal (locked
    // 2026-05-09 PR #49 device QA wave 4). When the cycle says
    // redeemed but no source data exists, the card stays hidden;
    // the hero seal still appears (driven by the persistence-window
    // gate computed against `redemptionRedeemedAt`, but ALSO needs
    // a redeemedAt source — without one, neither the seal nor the
    // card render). This test asserts the card-not-rendered case.
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: true })
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', branches: [makeBranch('b1', 'Brightlingsea')],
    })

    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('redemption-details-card')).toBeNull()
    // The standalone redeemed-badge pill is GONE entirely (locked
    // 2026-05-09); the hero seal is the only redeemed indicator.
    expect(queryByTestId('redeemed-badge')).toBeNull()
  })

  it('immediately after redemption (lastRedemption in memory) shows the M2 RedemptionDetailsCard', async () => {
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: false })
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', branches: [makeBranch('b1', 'Brightlingsea')],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(successResponse)

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    // Tap CTA → submit PIN.
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    await waitFor(() => expect(getByTestId('success-popup')).toBeTruthy())

    // Simulate user tapping Done. Then voucher state hasn't refetched
    // yet (mock still returns isRedeemedThisCycle=false), so the screen
    // is still in 'can-redeem'. To exercise the state-3 path with
    // lastRedemption in memory, we flip the mock to redeemed and let
    // the popup close.
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: true })
    fireEvent.press(getByTestId('success-done'))
    await waitFor(() => expect(queryByTestId('success-popup')).toBeNull())

    // After Done, screen is still mounted with lastRedemption in state.
    // RedemptionDetailsCard appears via the lastRedemption-state branch;
    // the hero seal renders as an absolute overlay (testID
    // `voucher-detail-hero-seal`) — the standalone RedeemedBadge pill
    // was consolidated into the hero seal in PR #49 wave 4.
    expect(queryByTestId('redeemed-badge')).toBeNull()
    await waitFor(() => expect(getByTestId('redemption-details-card')).toBeTruthy())
    expect(getByTestId('voucher-detail-hero-seal')).toBeTruthy()
  })

  // Helper for ordering tests: walk the rendered tree from any
  // anchor, dedupe testIDs by first occurrence, return them in DOM
  // order. testIDs can surface multiple times in React Test Renderer
  // (Pressable + nested host elements each carry the prop), so we
  // dedupe.
  function orderedTestIds(anchor: any): string[] {
    let node: any = anchor
    while (node?.parent) node = node.parent
    const root = node
    const all = root
      .findAll((el: any) => typeof el.props?.testID === 'string')
      .map((el: any) => el.props.testID as string)
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const id of all) {
      if (seen.has(id)) continue
      seen.add(id)
      ordered.push(id)
    }
    return ordered
  }

  it('redeemed-this-cycle layout: hero → RedemptionDetailsCard → CycleRulesCard → coupon body → MerchantRow → VoucherTypeExplainer → HowItWorks', async () => {
    // Locked 2026-05-08 from device QA. Once redeemed, redemption
    // information becomes the dominant content. Order:
    //   1. coupon-header (hero / red voucher header)
    //   2. redemption-details-card (in-stack, after hero)
    //   3. cycle-rules (in-stack, between details and coupon body —
    //      the renewal date is the most-asked question post-redeem)
    //   4. coupon-top-card (start of the coupon body card)
    //   5. merchant-row (after coupon body)
    //   6. voucher-type-explainer (after merchant row, collapsed)
    //   7. how-it-works (last)
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: false })
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', branches: [makeBranch('b1', 'Brightlingsea')],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(successResponse)

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    await waitFor(() => expect(getByTestId('success-popup')).toBeTruthy())

    mockVoucherData = baseVoucher({ isRedeemedThisCycle: true })
    fireEvent.press(getByTestId('success-done'))
    await waitFor(() => expect(queryByTestId('success-popup')).toBeNull())
    await waitFor(() => expect(getByTestId('redemption-details-card')).toBeTruthy())

    const ids = orderedTestIds(getByTestId('redemption-details-card'))
    const idx = (t: string) => ids.indexOf(t)

    // All seven testIDs must be present.
    expect(idx('coupon-header')).toBeGreaterThanOrEqual(0)
    expect(idx('redemption-details-card')).toBeGreaterThanOrEqual(0)
    expect(idx('cycle-rules')).toBeGreaterThanOrEqual(0)
    expect(idx('coupon-top-card')).toBeGreaterThanOrEqual(0)
    expect(idx('merchant-row')).toBeGreaterThanOrEqual(0)
    expect(idx('voucher-type-explainer')).toBeGreaterThanOrEqual(0)
    expect(idx('how-it-works')).toBeGreaterThanOrEqual(0)

    // Locked order (each greater-than relation pins one boundary).
    expect(idx('redemption-details-card')).toBeGreaterThan(idx('coupon-header'))
    expect(idx('cycle-rules')).toBeGreaterThan(idx('redemption-details-card'))
    expect(idx('coupon-top-card')).toBeGreaterThan(idx('cycle-rules'))
    expect(idx('merchant-row')).toBeGreaterThan(idx('coupon-top-card'))
    expect(idx('voucher-type-explainer')).toBeGreaterThan(idx('merchant-row'))
    expect(idx('how-it-works')).toBeGreaterThan(idx('voucher-type-explainer'))
  })

  it('non-redeemed layout: hero → coupon body → CycleRulesCard → MerchantRow → VoucherTypeExplainer → HowItWorks (no RedemptionDetailsCard)', () => {
    // Locked 2026-05-08 from device QA. In the steady-state
    // pre-redemption flow there is no RedemptionDetailsCard, and
    // the cycle card sits BETWEEN the coupon body and MerchantRow
    // (NOT inside the coupon stack). Order:
    //   1. coupon-header
    //   2. coupon-top-card (no in-stack details/cycle)
    //   3. cycle-rules (after coupon body, before merchant row)
    //   4. merchant-row
    //   5. voucher-type-explainer
    //   6. how-it-works
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: false })
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', branches: [makeBranch('b1', 'Brightlingsea')],
    })

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)

    // CRITICAL: no redemption-details-card in non-redeemed state.
    expect(queryByTestId('redemption-details-card')).toBeNull()

    const ids = orderedTestIds(getByTestId('coupon-header'))
    const idx = (t: string) => ids.indexOf(t)

    expect(idx('coupon-header')).toBeGreaterThanOrEqual(0)
    expect(idx('coupon-top-card')).toBeGreaterThanOrEqual(0)
    expect(idx('cycle-rules')).toBeGreaterThanOrEqual(0)
    expect(idx('merchant-row')).toBeGreaterThanOrEqual(0)
    expect(idx('voucher-type-explainer')).toBeGreaterThanOrEqual(0)
    expect(idx('how-it-works')).toBeGreaterThanOrEqual(0)

    // Locked order.
    expect(idx('coupon-top-card')).toBeGreaterThan(idx('coupon-header'))
    expect(idx('cycle-rules')).toBeGreaterThan(idx('coupon-top-card'))
    expect(idx('merchant-row')).toBeGreaterThan(idx('cycle-rules'))
    expect(idx('voucher-type-explainer')).toBeGreaterThan(idx('merchant-row'))
    expect(idx('how-it-works')).toBeGreaterThan(idx('voucher-type-explainer'))
  })

  it('non-redeemed renders cycle-rules exactly ONCE (not double-mounted)', () => {
    // The orchestrator has two mutually-exclusive mount sites for
    // CycleRulesCard. Pin that the non-redeemed state only renders
    // the outer mount, never both.
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: false })
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', branches: [makeBranch('b1', 'Brightlingsea')],
    })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    const ids = orderedTestIds(getByTestId('coupon-header'))
    const cycleHits = ids.filter((id) => id === 'cycle-rules')
    expect(cycleHits.length).toBe(1)
  })

  it('redeemed renders cycle-rules exactly ONCE (in-stack mount only)', async () => {
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: false })
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', branches: [makeBranch('b1', 'Brightlingsea')],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(successResponse)

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    await waitFor(() => expect(getByTestId('success-popup')).toBeTruthy())

    mockVoucherData = baseVoucher({ isRedeemedThisCycle: true })
    fireEvent.press(getByTestId('success-done'))
    await waitFor(() => expect(queryByTestId('success-popup')).toBeNull())
    await waitFor(() => expect(getByTestId('redemption-details-card')).toBeTruthy())

    const ids = orderedTestIds(getByTestId('redemption-details-card'))
    const cycleHits = ids.filter((id) => id === 'cycle-rules')
    expect(cycleHits.length).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Locked 2026-05-07 from device QA — already-redeemed must NEVER
// reopen the redemption path. Defence in depth at three layers:
//   1. MerchantRow hides the "Change ▾" pill when disableChangeBranch
//   2. handleChangeBranch early-returns when stateKey === 'redeemed-this-cycle'
//   3. handlePickerConfirm early-returns when stateKey === 'redeemed-this-cycle'
// Plus: ALREADY_REDEEMED defensive response closes PIN cleanly via
// redeem.reset() so no stale error state leaks into a future sheet.
// ─────────────────────────────────────────────────────────────────────

describe('Voucher Detail M2 — already-redeemed cannot reopen redemption (issue #1)', () => {
  it('redeemed-this-cycle: MerchantRow hides "Change ▾" pill (cannot tap)', () => {
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: true })
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea'), makeBranch('b2', 'Colchester', 12_000)],
    })

    const { queryByLabelText } = wrap(<VoucherDetailScreen />)
    // Pre-fix: the pill rendered with accessibilityLabel "Change ▾"
    // even in redeemed state. Post-fix: the pill is gone entirely.
    expect(queryByLabelText('Change ▾')).toBeNull()
  })

  it('redeemed-this-cycle: tapping the merchant row does NOT open BranchPickerSheet', () => {
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: true })
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea'), makeBranch('b2', 'Colchester', 12_000)],
    })

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    // In `redeemed-this-cycle` state with no `lastRedemption` in
    // memory (return-visit case), MerchantRow renders in
    // 'redeemed-unknown' mode — the branch line is hidden, so the
    // 'redeem-at-line' / 'redeemed-at-line' testIDs are absent.
    // The merchant-row container Pressable still exists for the
    // top-of-card merchant tap, but the branch panel below has no
    // change-branch affordance. Tap the container; nothing should
    // open the picker or trigger a redeem call.
    fireEvent.press(getByTestId('merchant-row'))
    expect(queryByTestId('voucher-branch-picker-sheet')).toBeNull()
    expect(queryByTestId('pin-entry-sheet')).toBeNull()
    expect(redemptionApi.redeem).not.toHaveBeenCalled()
  })

  it('ALREADY_REDEEMED defensive response: PIN submission produces no success popup or generic error banner', async () => {
    // Force the defensive path: user is in 'can-redeem' state (mock
    // returns isRedeemedThisCycle: false) but the backend tells us
    // ALREADY_REDEEMED — happens after the cycle-state check passed
    // but before the mutation, e.g. another device redeemed in the
    // meantime. Pre-fix: the error lingered as redeem.error.
    // Post-fix: handlePinSubmit catches it, refetches voucher, and
    // calls redeem.reset(). The sheet-visibility state is timing-
    // sensitive in the full-suite run (other tests can leak fake
    // timers); the durable invariants are: redemptionApi was called
    // with the right args, and no success popup ever appears.
    mockVoucherData = baseVoucher() // can-redeem
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', branches: [makeBranch('b1', 'Brightlingsea')],
    })
    // Simulate the typed RedemptionError thrown by redemptionApi.redeem.
    ;(redemptionApi.redeem as jest.Mock).mockRejectedValue({
      code: 'ALREADY_REDEEMED', message: 'Already redeemed', statusCode: 409,
    })

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')

    // Mutation must have been attempted with the right args (catches
    // a regression where the redeemed-state guard in the picker stops
    // a legitimate retry attempt by mistake — handlePinSubmit DOES
    // run because the user is in 'can-redeem' state in this test).
    await waitFor(() => expect(redemptionApi.redeem).toHaveBeenCalledTimes(1))
    expect(redemptionApi.redeem).toHaveBeenCalledWith({
      voucherId: 'v1', branchId: 'b1', pin: '1234',
    })

    // Defensive contract: no success popup, no generic error banner.
    // The sheet may take a render or two to unmount — we don't pin
    // the exact moment, just that the user never sees a success
    // confirmation or a residual "something went wrong" toast.
    expect(queryByTestId('success-popup')).toBeNull()
    expect(queryByTestId('pin-backend-error-banner')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// PR #44 review fix #1 — free-user must NEVER reach PIN entry
// ─────────────────────────────────────────────────────────────────────

describe('Voucher Detail M2 — free user blocked from PIN entry (review fix #1)', () => {
  it('Free user tap CTA → routes to subscription, NOT PIN sheet', async () => {
    mockSubscribed = false
    mockVoucherData = baseVoucher() // not redeemed; can-redeem path
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', branches: [makeBranch('b1', 'Brightlingsea')],
    })

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-subscribe'))

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/(auth)/subscription-prompt?source=voucher'),
    )
    expect(queryByTestId('pin-entry-sheet')).toBeNull()
    expect(queryByTestId('voucher-branch-picker-sheet')).toBeNull()
  })

  it('Free user tap "change branch" pill → routes to subscription, NOT picker (BLOCKER fix)', async () => {
    // The MerchantRow "Change ▾" pill calls handleChangeBranch. Without
    // the subscription gate this would open the picker → confirm →
    // PIN entry. Per owner constraint #1, free users must never reach
    // PIN entry. Pin: tapping the change-branch pill on a multi-branch
    // merchant routes the free user to the subscription flow instead.
    mockSubscribed = false
    mockVoucherData = baseVoucher()
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea'), makeBranch('b2', 'Colchester', 12_000)],
    })

    const { getByLabelText, queryByTestId } = wrap(<VoucherDetailScreen />)
    // The MerchantRow exposes a "Change ▾" pill with accessibilityLabel
    // "Change ▾" — tap it directly.
    fireEvent.press(getByLabelText('Change ▾'))

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/(auth)/subscription-prompt?source=voucher'),
    )
    expect(queryByTestId('voucher-branch-picker-sheet')).toBeNull()
    expect(queryByTestId('pin-entry-sheet')).toBeNull()
  })

  it('Defensive: handlePickerConfirm gates on subscription too — picker confirm by a free user routes to subscription, not PIN', async () => {
    // Defensive in-depth guard: even if some future code path opens
    // the picker for a free user (bypassing handleChangeBranch +
    // handleCTA), handlePickerConfirm must still gate.
    mockSubscribed = true // start subscribed so picker can open
    mockVoucherData = baseVoucher()
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea'), makeBranch('b2', 'Colchester', 12_000)],
    })

    const { getByTestId, queryByTestId, rerender } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy()

    // Now flip to free mid-flight (simulates subscription expiry race
    // or stale auth state).
    mockSubscribed = false
    rerender(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <VoucherDetailScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    )

    // Picker still shows on free user (it was already open). Tap confirm.
    if (queryByTestId('branch-picker-confirm')) {
      fireEvent.press(getByTestId('branch-picker-confirm'))
      // Defensive guard kicks in: subscription route, no PIN.
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/(auth)/subscription-prompt?source=voucher'),
      )
      expect(queryByTestId('pin-entry-sheet')).toBeNull()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────
// PR #44 review fix #2 — picker URL-first currentBranchId priority
// ─────────────────────────────────────────────────────────────────────

describe('Voucher Detail M2 — picker URL-first priority (review fix #2)', () => {
  it('URL=B2 + selectedBranch stale B1 → picker pre-selects B2 → confirm-without-row-change uses B2', async () => {
    // Simulates the keepPreviousData refetch window: user just switched
    // to B2 via some other path (URL=B2), but merchant query is still
    // returning the previous selectedBranch=B1. Picker MUST pre-select
    // B2 (the URL truth) — not B1 (stale snapshot). User taps Confirm
    // without changing row → mutation must fire with B2.
    mockParams = { id: 'v1', branch: 'b2' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', // STALE
      branches: [makeBranch('b1', 'Brightlingsea'), makeBranch('b2', 'Colchester', 12_000)],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue({ ...successResponse, branchId: 'b2' })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy())

    // Confirm without picking a row — should use B2 from URL, not B1 from stale data.
    fireEvent.press(getByTestId('branch-picker-confirm'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())

    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    await waitFor(() => {
      expect(redemptionApi.redeem).toHaveBeenCalledWith({
        voucherId: 'v1', branchId: 'b2', pin: '1234',
      })
    })
  })
})

// ─────────────────────────────────────────────────────────────────────
// PR #44 review fix #3 — non-PIN backend error codes surface in UI
// ─────────────────────────────────────────────────────────────────────

describe('Voucher Detail M2 — non-PIN backend errors surface (review fix #3)', () => {
  beforeEach(() => {
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1', branches: [makeBranch('b1', 'Brightlingsea')],
    })
  })

  function expectErrorBanner(code: string, statusCode: number, extra: any = {}) {
    return async function (titleMatch: RegExp) {
      ;(redemptionApi.redeem as jest.Mock).mockRejectedValue({
        code, message: 'x', statusCode, ...extra,
      })
      const { getByTestId, getByText } = wrap(<VoucherDetailScreen />)
      fireEvent.press(getByTestId('redeem-cta-active'))
      await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
      await act(async () => {
        fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
      })
      await waitFor(() => expect(getByTestId('pin-backend-error-banner')).toBeTruthy())
      expect(getByText(titleMatch)).toBeTruthy()
    }
  }

  it('PIN_NOT_CONFIGURED renders "Branch PIN not set up" banner with merchant-portal hint', async () => {
    await expectErrorBanner('PIN_NOT_CONFIGURED', 400)(/Branch PIN not set up/i)
  })

  it('BRANCH_UNAVAILABLE renders "Branch unavailable" banner', async () => {
    await expectErrorBanner('BRANCH_UNAVAILABLE', 404)(/Branch unavailable/i)
  })

  it('BRANCH_MERCHANT_MISMATCH renders "Branch mismatch" banner', async () => {
    await expectErrorBanner('BRANCH_MERCHANT_MISMATCH', 400)(/Branch mismatch/i)
  })

  it('PHONE_NOT_VERIFIED renders "Verify your phone" banner', async () => {
    await expectErrorBanner('PHONE_NOT_VERIFIED', 403)(/Verify your phone/i)
  })

  it('SUBSCRIPTION_REQUIRED renders "Subscription required" banner', async () => {
    await expectErrorBanner('SUBSCRIPTION_REQUIRED', 403)(/Subscription required/i)
  })

  it('VOUCHER_NOT_FOUND renders "Voucher unavailable" banner', async () => {
    await expectErrorBanner('VOUCHER_NOT_FOUND', 404)(/Voucher unavailable/i)
  })

  it('PIN_NOT_CONFIGURED copy mentions the merchant portal / Redeemo support', async () => {
    ;(redemptionApi.redeem as jest.Mock).mockRejectedValue({
      code: 'PIN_NOT_CONFIGURED', message: 'x', statusCode: 400,
    })
    const { getByTestId, getByText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    await act(async () => {
      fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    })
    await waitFor(() => expect(getByTestId('pin-backend-error-banner')).toBeTruthy())
    // Copy MUST guide the user to ask the merchant + offer Redeemo support fallback.
    expect(getByText(/merchant portal/i)).toBeTruthy()
    expect(getByText(/support/i)).toBeTruthy()
  })

  it('Generic error banner does NOT render alongside lockout (PIN_RATE_LIMIT_EXCEEDED takes precedence)', async () => {
    ;(redemptionApi.redeem as jest.Mock).mockRejectedValue({
      code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'x', statusCode: 429, retryAfter: 540,
    })
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    await act(async () => {
      fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    })
    await waitFor(() => expect(getByTestId('pin-lockout-card')).toBeTruthy())
    // Lockout state suppresses the generic banner.
    expect(queryByTestId('pin-backend-error-banner')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// URL-first display branch resolver (locked 2026-05-07 from device QA)
// ─────────────────────────────────────────────────────────────────────
//
// Pre-fix: VoucherDetailScreen displayed merchant.selectedBranch
// directly. Under React Query keepPreviousData, this could flash the
// previous (stale) branch when navigating from one branch context to
// another, before the refetch caught up. That's a branch-attribution
// trust issue — the customer tapped from a known branch on the
// merchant page, the URL has the right ?branch= param, but the screen
// briefly showed a different branch.
//
// Post-fix: a `displayBranch` resolver mirrors the mutation contract:
//   pickerConfirmedBranchId  → URL ?branch=  → selectedBranch (cold-open only)
// When a URL/picker target exists, display ONLY renders the matching
// branch from merchant.branches. Stale selectedBranch is never shown.

describe('Voucher Detail M2 — URL-first display branch (issue #2)', () => {
  it('URL=B2 + selectedBranch stale=B1 + branches contains B2: displays B2 immediately + CTA active', async () => {
    // Most common keepPreviousData scenario — merchant data came
    // from the previous branch context (selectedBranch=B1) but the
    // user navigated with ?branch=B2 in the URL. branches list
    // already contains B2 (same merchant, both branches in the
    // list). Display must use B2; CTA must be active.
    mockParams = { id: 'v1', branch: 'b2' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',  // STALE
      branches: [
        makeBranch('b1', 'Brightlingsea'),
        makeBranch('b2', 'Colchester', 12_000),
      ],
    })

    const { getByTestId, queryByText } = wrap(<VoucherDetailScreen />)
    // Display reflects B2 (URL truth), not B1 (stale selectedBranch).
    expect(getByTestId('redeem-at-line').props.children).toBeTruthy()
    expect(queryByText(/Brightlingsea/)).toBeNull()
    // Active CTA visible — branchReady is true because B2 was found.
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
  })

  it('URL=B2 + selectedBranch stale=B1 + branches NOT yet containing B2 (refetch in flight): hides CTA, no stale branch flash', () => {
    // Edge case — merchant query is mid-refetch (isFetching=true).
    // The stale `data` still includes only B1 and selectedBranch=B1.
    // Display must NOT fall back to B1 (URL truth wins). CTA must
    // be hidden (no large alarming "Resolving Branch…" button).
    mockParams = { id: 'v1', branch: 'b2' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea')],
    })
    ;(globalThis as any).__voucherProfileMock__.isFetching = true

    const { queryByText, queryByTestId, getByTestId } = wrap(<VoucherDetailScreen />)
    // Stale Brightlingsea branch must NOT appear anywhere.
    expect(queryByText(/Brightlingsea/)).toBeNull()
    // No active CTA. No "branch-loading" CTA either — the wrap is
    // hidden entirely. No success popup.
    expect(queryByTestId('redeem-cta-active')).toBeNull()
    expect(queryByTestId('redeem-cta-branch-loading')).toBeNull()
    // Quieter inline signal — MerchantRow placeholder.
    expect(getByTestId('redeem-at-placeholder')).toBeTruthy()
  })

  it('Picker-confirmed B2 + URL still B1 (one-render gap): display + mutation both use B2', async () => {
    // Picker confirm sets local pickerConfirmedBranchId synchronously
    // BEFORE router.replace fires; for one render the URL still says
    // B1 but the local pickerConfirmedBranchId says B2. The mutation
    // (proven by existing TIER 1 test elsewhere) uses B2; this test
    // pins that the DISPLAY also uses B2 in that exact render.
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [
        makeBranch('b1', 'Brightlingsea'),
        makeBranch('b2', 'Colchester', 12_000),
      ],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue({ ...successResponse, branchId: 'b2' })

    const { getByTestId, queryByText } = wrap(<VoucherDetailScreen />)
    // Open picker, confirm B2 — sets pickerConfirmedBranchId locally.
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy())
    fireEvent.press(getByTestId(`branch-picker-row-b2`))
    fireEvent.press(getByTestId('branch-picker-confirm'))

    // PIN sheet opens with the B2 branch name in its header — proves
    // display uses pickerConfirmedBranchId, not selectedBranch.
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
    // Brightlingsea (the stale URL/selectedBranch value) must NOT
    // appear in the PIN sheet header.
    expect(queryByText(/Brightlingsea/)).toBeNull()
  })

  it('Cold-open with NO branch URL param: selectedBranch fallback still works', () => {
    // Per the locked branch-attribution contract, cold-open without
    // a URL ?branch= param falls back to merchant.selectedBranch
    // (server-resolved nearest-by-GPS or main-branch fallback).
    // Pre-fix this was the only display source; the fix preserves
    // it for the no-target case.
    mockParams = { id: 'v1' } // no branch param
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea')],
    })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    // Active CTA renders — branchReady is true (selectedBranch
    // resolved B1).
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
    // MerchantRow shows the resolved branch line, not the placeholder.
    expect(getByTestId('redeem-at-line')).toBeTruthy()
  })

  it('URL=B2 inactive in merchant.branches: no active CTA, no display-ready state, error surfaces', () => {
    // Edge case (locked 2026-05-07 from device QA): URL targets a
    // branch that exists in merchant.branches but with isActive=false
    // (suspended / deactivated). Pre-fix: displayBranch resolved
    // anyway → branchReady true → active Redeem CTA appeared →
    // backend rejected with BRANCH_UNAVAILABLE only after PIN entry.
    // Post-fix: the isActive gate in displayBranch makes branchReady
    // false; branchErrored fires (settled merchant + no
    // active-and-matching branch); the screen shows the error state
    // before the user reaches PIN entry.
    mockParams = { id: 'v1', branch: 'b2' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [
        makeBranch('b1', 'Brightlingsea'),
        // B2 is in the list but inactive (suspended).
        { ...makeBranch('b2', 'Colchester', 12_000), isActive: false },
      ],
    })

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    // No active Redeem CTA — defense-in-depth. The screen MUST NOT
    // let the user reach PIN entry for an inactive branch.
    expect(queryByTestId('redeem-cta-active')).toBeNull()
    // No "branch-loading" CTA either (that wasn't the regression
    // — but pin its absence so the hide-the-wrap pattern is
    // preserved alongside the isActive gate).
    expect(queryByTestId('redeem-cta-branch-loading')).toBeNull()
    // The voucher-detail-error surface renders — settled merchant
    // data, no active+matching target branch.
    expect(getByTestId('voucher-detail-error')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────
// Redeemed-state MerchantRow copy (locked 2026-05-07 from device QA)
// ─────────────────────────────────────────────────────────────────────
//
// "REDEEM AT" must never appear when the voucher has already been
// redeemed in the current cycle — the eyebrow is misleading because
// redemption is locked across all branches per (userId, voucherId).
// Two redeemed-state variants:
//   • Immediately after redemption: lastRedemption is in memory, so
//     the row knows the actual redemption branch → "REDEEMED AT
//     <branch>".
//   • Return visit: lastRedemption is null (M2 doesn't persist the
//     redemption branch — see §P2 deferred follow-up). The row
//     shows "REDEEMED THIS CYCLE" and hides the branch line entirely.

describe('Voucher Detail — redeemed-this-cycle does not render "REDEEM AT"', () => {
  it('return-visit redeemed (no lastRedemption): renders "REDEEMED THIS CYCLE", hides branch line, NO "REDEEM AT"', () => {
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: true })
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea')],
    })

    const { getByText, queryByText, queryByTestId } = wrap(<VoucherDetailScreen />)
    // Eyebrow is the neutral redeemed-unknown copy.
    expect(getByText('REDEEMED THIS CYCLE')).toBeTruthy()
    // Critical: no "REDEEM AT" eyebrow anywhere on the screen.
    expect(queryByText('REDEEM AT')).toBeNull()
    // Branch line is hidden — passed branchName could be misleading
    // on return visit (it's the URL/selectedBranch fallback, not
    // the actual redemption branch).
    expect(queryByText('Brightlingsea')).toBeNull()
    expect(queryByTestId('redeem-at-line')).toBeNull()
    expect(queryByTestId('redeemed-at-line')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// Picker default-select + sort + inactive filter (locked 2026-05-07)
// ─────────────────────────────────────────────────────────────────────

describe('Voucher Detail — picker branches list (default-select + sort + filter)', () => {
  function openPickerAndGetRowOrder(getByTestId: (id: string) => any): string[] {
    fireEvent.press(getByTestId('redeem-cta-active'))
    // Walk the rendered picker sheet's tree in DOM order, pulling
    // testIDs that match `branch-picker-row-<id>`. `findAll` can
    // surface a testID multiple times (the Pressable plus nested
    // host elements that inherit it); dedupe by first occurrence.
    // The remaining order reflects the sort applied by
    // `pickerBranches` in the orchestrator.
    const sheet = getByTestId('voucher-branch-picker-sheet')
    const rows = sheet.findAll((el: any) => {
      const tid = el.props?.testID
      return typeof tid === 'string' && tid.startsWith('branch-picker-row-')
    })
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const el of rows) {
      const id = String(el.props.testID).replace('branch-picker-row-', '')
      if (seen.has(id)) continue
      seen.add(id)
      ordered.push(id)
    }
    return ordered
  }

  it('current branch (URL=B2) renders FIRST in the picker; remaining branches sorted by ascending distance', async () => {
    // Fixtures: B1 (1500m), B2 (12000m, current), B3 (no distance),
    // B4 (500m). Expected sort: B2 (current first), B4 (500m),
    // B1 (1500m), B3 (null distance, last).
    mockParams = { id: 'v1', branch: 'b2' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b2',
      branches: [
        makeBranch('b1', 'Brightlingsea', 1500),
        makeBranch('b2', 'Colchester',    12_000),
        makeBranch('b3', 'Wivenhoe',      null),
        makeBranch('b4', 'Tendring',      500),
      ],
    })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    const order = openPickerAndGetRowOrder(getByTestId)
    // Current first, then nearest, then farther, then null distance.
    expect(order).toEqual(['b2', 'b4', 'b1', 'b3'])
  })

  it('picker pre-selects the current branch (B2) — Confirm without further taps submits B2', async () => {
    mockParams = { id: 'v1', branch: 'b2' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b2',
      branches: [
        makeBranch('b1', 'Brightlingsea', 1500),
        makeBranch('b2', 'Colchester',    12_000),
      ],
    })
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue({ ...successResponse, branchId: 'b2' })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy())

    // B2 is pre-selected.
    expect(getByTestId('branch-picker-row-b2').props.accessibilityState).toEqual({ selected: true })
    expect(getByTestId('branch-picker-row-b1').props.accessibilityState).toEqual({ selected: false })

    // User confirms without picking another row → submits B2.
    fireEvent.press(getByTestId('branch-picker-confirm'))
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    await waitFor(() => {
      expect(redemptionApi.redeem).toHaveBeenCalledWith({
        voucherId: 'v1', branchId: 'b2', pin: '1234',
      })
    })
  })

  it('inactive branches do not appear in the picker', async () => {
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [
        makeBranch('b1', 'Brightlingsea', 1500),
        // B2 is suspended/deactivated — must NOT render in the
        // picker.
        { ...makeBranch('b2', 'Colchester', 12_000), isActive: false },
        makeBranch('b3', 'Wivenhoe', 5_000),
      ],
    })

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy())

    expect(getByTestId('branch-picker-row-b1')).toBeTruthy()
    expect(queryByTestId('branch-picker-row-b2')).toBeNull()  // inactive — hidden
    expect(getByTestId('branch-picker-row-b3')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────
// Picker intent split (locked 2026-05-07 from device QA)
// ─────────────────────────────────────────────────────────────────────
//
// Two distinct entry points, two distinct outcomes:
//   • MerchantRow "Change ▾" pill → 'change' intent → confirm
//     updates branch context only, picker closes, NO PIN sheet.
//   • Sticky "Redeem This Voucher" CTA → 'redeem' intent → confirm
//     updates branch context AND opens PIN sheet.
// Pre-fix: both paths opened PIN on confirm, which surprised users
// who only wanted to change the branch context.

describe('Voucher Detail M2 — picker intent split (issue: change vs redeem)', () => {
  it("'change' intent: tap MerchantRow 'Change ▾' → pick B2 → Confirm → URL replace fires, NO PIN sheet, Redeem CTA still visible", async () => {
    mockSubscribed = true
    mockVoucherData = baseVoucher() // can-redeem
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [
        makeBranch('b1', 'Brightlingsea', 1500),
        makeBranch('b2', 'Colchester', 12_000),
      ],
    })

    const { getByTestId, getByLabelText, queryByTestId } = wrap(<VoucherDetailScreen />)
    // Tap the Change ▾ pill — sets pickerIntent='change'.
    fireEvent.press(getByLabelText('Change ▾'))
    await waitFor(() => expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy())

    fireEvent.press(getByTestId('branch-picker-row-b2'))
    fireEvent.press(getByTestId('branch-picker-confirm'))

    // URL replace must fire with branch=b2 (context updated).
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('branch=b2'),
    )
    // CRITICAL: PIN sheet does NOT open — that was the device-QA bug.
    expect(queryByTestId('pin-entry-sheet')).toBeNull()
    // Picker is closed.
    expect(queryByTestId('voucher-branch-picker-sheet')).toBeNull()
    // The Redeem CTA stays the active variant — the screen state
    // didn't transition to anything weird; the user can still redeem
    // when they're ready.
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
    // No mutation attempt on the network.
    expect(redemptionApi.redeem).not.toHaveBeenCalled()
  })

  it("'change' intent picker shows 'Choose branch' title + 'Change Branch' confirm CTA", async () => {
    mockSubscribed = true
    mockVoucherData = baseVoucher()
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [
        makeBranch('b1', 'Brightlingsea'),
        makeBranch('b2', 'Colchester', 12_000),
      ],
    })

    const { getByText, getByLabelText, queryByText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByLabelText('Change ▾'))

    // Picker copy reflects the change intent.
    await waitFor(() => expect(getByText('Choose branch')).toBeTruthy())
    expect(getByText('Change Branch')).toBeTruthy()
    // Redeem-intent copy must NOT appear.
    expect(queryByText('Confirm redemption branch')).toBeNull()
    expect(queryByText('Confirm & Enter PIN')).toBeNull()
  })

  it("'redeem' intent: tap sticky CTA → picker confirm → PIN sheet opens", async () => {
    mockSubscribed = true
    mockVoucherData = baseVoucher()
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [
        makeBranch('b1', 'Brightlingsea'),
        makeBranch('b2', 'Colchester', 12_000),
      ],
    })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy())

    fireEvent.press(getByTestId('branch-picker-confirm'))

    // PIN sheet opens — that's the redeem-intent contract.
    await waitFor(() => expect(getByTestId('pin-entry-sheet')).toBeTruthy())
  })

  it("'redeem' intent picker shows 'Confirm redemption branch' title + 'Confirm & Enter PIN' confirm CTA", async () => {
    mockSubscribed = true
    mockVoucherData = baseVoucher()
    mockParams = { id: 'v1', branch: 'b1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [
        makeBranch('b1', 'Brightlingsea'),
        makeBranch('b2', 'Colchester', 12_000),
      ],
    })

    const { getByText, getByTestId, queryByText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    await waitFor(() => expect(getByText('Confirm redemption branch')).toBeTruthy())
    expect(getByText('Confirm & Enter PIN')).toBeTruthy()
    // Change-intent copy must NOT appear.
    expect(queryByText('Choose branch')).toBeNull()
    expect(queryByText('Change Branch')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// branchChanged return-URL flag (locked 2026-05-07 from device QA)
// ─────────────────────────────────────────────────────────────────────

describe('Voucher Detail M2 — branchChanged return-URL flag (issue: silent branch swap)', () => {
  it('change-intent + actually-different branch → handleBack URL routes to NEW branch AND carries branchChanged=1', async () => {
    mockSubscribed = true
    mockVoucherData = baseVoucher()
    mockParams = { id: 'v1', branch: 'b1', from: 'merchant', returnMerchantId: 'm1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [
        makeBranch('b1', 'Brightlingsea', 1500),
        makeBranch('b2', 'Colchester', 12_000),
      ],
    })

    const { getByTestId, getByLabelText } = wrap(<VoucherDetailScreen />)
    // Open via change pill, swap to B2.
    fireEvent.press(getByLabelText('Change ▾'))
    await waitFor(() => expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy())
    fireEvent.press(getByTestId('branch-picker-row-b2'))
    fireEvent.press(getByTestId('branch-picker-confirm'))

    // Hit the back nav — handleBack reads `changedBranchOnVoucherId`
    // (the synchronous local store of the picker confirm), so the
    // return URL routes to B2 EVEN IF `useLocalSearchParams` hasn't
    // caught up to the router.replace fired during confirm.
    fireEvent.press(getByLabelText('Go back'))
    // The back URL must carry BOTH the new branch AND the toast flag.
    // Pre-fix the back URL could carry branch=b1 (stale URL) +
    // branchChanged=1 (toast fires) — toast says "now viewing B2"
    // while the screen actually returned to B1. Pin both halves.
    const backCalls = (mockReplace as jest.Mock).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/(app)/merchant/'))
    expect(backCalls.length).toBeGreaterThan(0)
    const backUrl = backCalls[backCalls.length - 1]
    expect(backUrl).toContain('branch=b2')
    expect(backUrl).toContain('branchChanged=1')
    // Negative pin: must NOT carry the stale branch.
    expect(backUrl).not.toContain('branch=b1&')
    expect(backUrl).not.toMatch(/branch=b1$/)
  })

  it('change-intent + immediate Back BEFORE URL catch-up → return URL still routes to new branch (synchronous local source)', async () => {
    // Critical race-free test (locked 2026-05-07 from device QA
    // re-review): tap Back the very next interaction after Confirm.
    // The router.replace fired by Confirm has run, but the test does
    // NOT explicitly wait for `useLocalSearchParams` to re-sync — the
    // back tap happens synchronously in the same fireEvent batch.
    // handleBack must still produce branch=b2 because it reads
    // changedBranchOnVoucherId, not params.branch.
    mockSubscribed = true
    mockVoucherData = baseVoucher()
    mockParams = { id: 'v1', branch: 'b1', from: 'merchant', returnMerchantId: 'm1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [
        makeBranch('b1', 'Brightlingsea', 1500),
        makeBranch('b2', 'Colchester', 12_000),
      ],
    })

    const { getByTestId, getByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByLabelText('Change ▾'))
    await waitFor(() => expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy())
    fireEvent.press(getByTestId('branch-picker-row-b2'))

    // Confirm + Back synchronously, no `await` between them. The
    // mock useLocalSearchParams returns whatever `mockParams` is at
    // the moment of the call — we never mutate `mockParams.branch`
    // here, so it's STILL 'b1' when Back fires. That's exactly the
    // device-QA race the resolver guards against.
    fireEvent.press(getByTestId('branch-picker-confirm'))
    fireEvent.press(getByLabelText('Go back'))

    const backCalls = (mockReplace as jest.Mock).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/(app)/merchant/'))
    const backUrl = backCalls[backCalls.length - 1]
    expect(backUrl).toContain('branch=b2')
    expect(backUrl).toContain('branchChanged=1')
    // mockParams was never mutated — confirms the local id is what
    // saved us, not URL catch-up.
    expect(mockParams.branch).toBe('b1')
  })

  it('back without any branch change → return URL does NOT carry branchChanged', () => {
    mockSubscribed = true
    mockVoucherData = baseVoucher()
    mockParams = { id: 'v1', branch: 'b1', from: 'merchant', returnMerchantId: 'm1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [makeBranch('b1', 'Brightlingsea')],
    })

    const { getByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByLabelText('Go back'))
    // Some replace call happened (returning to merchant), but it
    // does NOT include the branchChanged flag.
    expect(mockReplace).toHaveBeenCalled()
    const calls = (mockReplace as jest.Mock).mock.calls
    expect(calls.every(([url]) => !String(url).includes('branchChanged'))).toBe(true)
  })

  it('change-intent + same branch picked (no-op) → return URL does NOT carry branchChanged', async () => {
    // User opens picker via Change ▾, taps Confirm without picking a
    // different row. branchId === branchIdParam, so the flag stays
    // false. (The current branch is the default-selected row.)
    mockSubscribed = true
    mockVoucherData = baseVoucher()
    mockParams = { id: 'v1', branch: 'b1', from: 'merchant', returnMerchantId: 'm1' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({
      selectedBranchId: 'b1',
      branches: [
        makeBranch('b1', 'Brightlingsea'),
        makeBranch('b2', 'Colchester', 12_000),
      ],
    })

    const { getByTestId, getByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByLabelText('Change ▾'))
    await waitFor(() => expect(getByTestId('voucher-branch-picker-sheet')).toBeTruthy())
    // Confirm immediately — same branch (B1) preselected.
    fireEvent.press(getByTestId('branch-picker-confirm'))

    fireEvent.press(getByLabelText('Go back'))
    const calls = (mockReplace as jest.Mock).mock.calls
    expect(calls.every(([url]) => !String(url).includes('branchChanged'))).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// M3 Task 17 — persisted return-visit RedemptionDetailsCard.
// ═══════════════════════════════════════════════════════════════════════

describe('persisted return-visit RedemptionDetailsCard (M3 Task 17)', () => {
  function persistedRedemption(overrides: any = {}) {
    return {
      code:        'A7K2P9X4',
      // 30 min ago — inside the 2h presentation window, so the
      // RedemptionDetailsCard renders the code + Show-to-Staff button
      // (the §AE gate is open). Computed at call time so the value
      // stays "recent" regardless of when the test runs.
      redeemedAt:  new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      branch:      { id: 'b1', name: 'Brightlingsea' },
      isValidated: false,
      validatedAt: null,
      ...overrides,
    }
  }

  it('renders RedemptionDetailsCard from voucher.lastRedemption when no in-memory redemption exists', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedRedemption(),
    })

    const { getByText, getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('redemption-details-card')).toBeTruthy()
    expect(getByText('A7K2 P9X4')).toBeTruthy()
    // Branch surfaces from voucher.lastRedemption.branch.name.
    expect(getByText('Brightlingsea')).toBeTruthy()
  })

  it('Show-to-Staff button on the persisted card mounts ShowToStaff with the persisted code', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedRedemption(),
    })

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('show-to-staff-mounted')).toBeNull()

    fireEvent.press(getByTestId('redemption-details-show-to-staff'))

    const mounted = getByTestId('show-to-staff-mounted')
    const props = JSON.parse(mounted.props.accessibilityLabel as string)
    expect(props.code).toBe('A7K2P9X4')
    expect(props.branch).toBe('Brightlingsea')
    expect(props.title).toBe('Free Filter Coffee with Any Thali')
    expect(props.type).toBe('FREEBIE')
    expect(props.merchant).toBe('Covelum Restaurant')
    expect(props.customerName).toBe('') // §U1 lock
  })

  it('renders the validated pill when voucher.lastRedemption.isValidated is true', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedRedemption({
        isValidated: true,
        validatedAt: '2026-05-08T10:01:30.000Z',
      }),
    })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('redemption-details-validated-pill')).toBeTruthy()
  })

  it('does NOT render RedemptionDetailsCard when voucher.lastRedemption is null and not redeemed', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: false,
      lastRedemption: null,
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('redemption-details-card')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// M3 Task 18 — §Q6 cycle-rollover invariant.
//
// THE GATE IS LOAD-BEARING: the persisted RedemptionDetailsCard MUST
// render only when stateKey === 'redeemed-this-cycle' (driven by
// voucher.isRedeemedThisCycle), NOT merely when lastRedemption data
// is present. After cycle rollover the backend flips both the flag
// AND the data together (Task 5 hoisted cycle-window math), but
// payload drift could in theory expose a stale lastRedemption with
// isRedeemedThisCycle=false. The frontend gate must hold the line.
// ═══════════════════════════════════════════════════════════════════════

describe('§Q6 cycle-rollover invariant — RedemptionDetailsCard gate (M3 Task 18)', () => {
  // The §Q6 invariant is independent of the presentation-window gate —
  // it operates on `voucher.isRedeemedThisCycle`, not on `redeemedAt`.
  // BUT in PHASE 1 the test asserts the rendered CODE is visible, which
  // requires the §AE window to ALSO be open. Use a recent timestamp so
  // both gates align.
  const persistedFixture = {
    code:        'A7K2P9X4',
    redeemedAt:  new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    branch:      { id: 'b1', name: 'Brightlingsea' },
    isValidated: false,
    validatedAt: null,
  }

  it('PHASE 1 — current cycle: isRedeemedThisCycle:true + lastRedemption present → card renders', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedFixture,
    })
    const { getByTestId, getByText } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('redemption-details-card')).toBeTruthy()
    expect(getByText('A7K2 P9X4')).toBeTruthy()
  })

  it('PHASE 2 — rolled-over: isRedeemedThisCycle:false + lastRedemption:null → card hidden, redeemable state restored', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: false,
      lastRedemption: null,
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('redemption-details-card')).toBeNull()
  })

  it('PHASE 3 (defensive drift) — isRedeemedThisCycle:false + lastRedemption STILL PRESENT → card MUST stay hidden', () => {
    // Critical pin: backend payload drift (cycle flag flipped but
    // lastRedemption hasn't cleared yet, OR a stale React Query
    // cache hit) must NOT cause the card to render. The frontend
    // gate is `stateKey === 'redeemed-this-cycle'`, NOT presence
    // of lastRedemption data.
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: false,           // backend says cycle is fresh
      lastRedemption: persistedFixture,     // ...but stale data lingers
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('redemption-details-card')).toBeNull()
  })

  it('PHASE 4 (negative defense) — isRedeemedThisCycle:true + lastRedemption:null → no card (no source for data)', () => {
    // The opposite drift case: cycle flag says redeemed but no
    // lastRedemption payload. The card needs a source — without
    // either the in-memory or persisted shape, there's nothing to
    // render. Verifies the §Q6 gate doesn't crash on this combo.
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: null,
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('redemption-details-card')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// PR #49 review fix — validated state propagation from ShowToStaff
// back to the parent's RedemptionDetailsCard. Without this, the user
// saw "Verified by staff" inside ShowToStaff but the validated pill
// stayed hidden after auto-dismiss because the in-memory
// `lastRedemption` branch hardcoded `isValidated: false`.
// ═══════════════════════════════════════════════════════════════════════

describe('ShowToStaff → RedemptionDetailsCard validated propagation (PR #49 review fix)', () => {
  // Pull the mocked ShowToStaff so we can invoke its props directly.
  const ShowToStaffMock = require('@/features/voucher/components/ShowToStaff').ShowToStaff as jest.Mock

  beforeEach(() => {
    ShowToStaffMock.mockClear()
  })

  function persistedRedemption(overrides: any = {}) {
    return {
      code:        'A7K2P9X4',
      // 30 min ago — inside the 2h presentation window, so the
      // RedemptionDetailsCard renders the code + Show-to-Staff button
      // (the §AE gate is open). Computed at call time so the value
      // stays "recent" regardless of when the test runs.
      redeemedAt:  new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      branch:      { id: 'b1', name: 'Brightlingsea' },
      isValidated: false,
      validatedAt: null,
      ...overrides,
    }
  }

  it('persisted-card path: ShowToStaff onValidated flips RedemptionDetailsCard to show the validated pill after dismiss', () => {
    // Voucher arrives in the redeemed-this-cycle state with a NOT-YET-
    // VALIDATED persisted lastRedemption — i.e. user redeemed earlier,
    // killed the app, relaunched, came back to voucher detail.
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedRedemption({ isValidated: false }),
    })

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)

    // Initial: card renders, no validated pill (persisted isValidated:false).
    expect(getByTestId('redemption-details-card')).toBeTruthy()
    expect(queryByTestId('redemption-details-validated-pill')).toBeNull()

    // User taps "Show to Staff" on the persisted card → ShowToStaff
    // mounts. We need the latest props (the mock captures every render's
    // props via mock.calls).
    fireEvent.press(getByTestId('redemption-details-show-to-staff'))
    expect(getByTestId('show-to-staff-mounted')).toBeTruthy()

    // ShowToStaff polls + flips to validated. We invoke its onValidated
    // callback directly. Then dismiss via onDone.
    const lastMountProps =
      ShowToStaffMock.mock.calls[ShowToStaffMock.mock.calls.length - 1][0]
    expect(typeof lastMountProps.onValidated).toBe('function')
    expect(typeof lastMountProps.onDone).toBe('function')

    act(() => {
      lastMountProps.onValidated()
      lastMountProps.onDone()
    })

    // Now back on VoucherDetail: the validated pill MUST render —
    // either via the session override (immediate) or via the refetched
    // voucher.lastRedemption.isValidated (eventual). Even with no
    // refetch in the test (mockVoucherData unchanged), the session
    // override carries the pill.
    expect(queryByTestId('show-to-staff-mounted')).toBeNull()
    expect(getByTestId('redemption-details-validated-pill')).toBeTruthy()
  })

  it('session override is keyed by redemption code — clears for a different code', () => {
    // Voucher with persisted lastRedemption #1.
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedRedemption({ code: 'AAAAAAAA' }),
    })

    const view = wrap(<VoucherDetailScreen />)
    fireEvent.press(view.getByTestId('redemption-details-show-to-staff'))

    const props =
      ShowToStaffMock.mock.calls[ShowToStaffMock.mock.calls.length - 1][0]

    // Session override fires for code AAAAAAAA — the validated pill
    // should appear.
    act(() => {
      props.onValidated()
      props.onDone()
    })
    expect(view.getByTestId('redemption-details-validated-pill')).toBeTruthy()

    // Now mock a DIFFERENT code surfacing on the voucher (e.g. cycle
    // reset + fresh redemption). The session override's stored code
    // (AAAAAAAA) shouldn't match the new code (BBBBBBBB), so the pill
    // disappears.
    view.unmount()

    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedRedemption({ code: 'BBBBBBBB', isValidated: false }),
    })
    const view2 = wrap(<VoucherDetailScreen />)
    expect(view2.queryByTestId('redemption-details-validated-pill')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// §AE — Presentation-window gate on Voucher Detail (locked 2026-05-08,
// owner direction PR #49 review).
//
// Once the 2-hour handoff window expires (or staff has validated), the
// redemption code + Show-to-Staff entry point disappear from Voucher
// Detail. The user still sees a redeemed-state surface — the seal +
// non-sensitive details — but cannot re-show a code that staff might
// be tricked into scanning a second time. Code retrieval moves to
// Profile → Redemption History (full surface deferred).
//
// Pin both branches: in-window (button visible) AND out-of-window
// (button hidden + history tip + seal surfaces).
// ═══════════════════════════════════════════════════════════════════════

describe('§AE — Voucher Detail presentation-window gate', () => {
  function persistedAt(redeemedAt: string) {
    return {
      code:        'A7K2P9X4',
      redeemedAt,
      branch:      { id: 'b1', name: 'Brightlingsea' },
      isValidated: false,
      validatedAt: null,
    }
  }

  it('IN-WINDOW (30 min ago): code + Show-to-Staff visible AND hero seal also visible (owner wave 8: immediate visual confirmation)', () => {
    // Locked 2026-05-09 PR #49 device QA wave 8: the hero washed-out
    // + seal must surface AS SOON AS the voucher is redeemed, not
    // only after the 2h window expires. Previously the seal was
    // gated on `(!isPresentationActive || isRedemptionValidated)`,
    // so the hero stayed unchanged for the in-window state — owner
    // QA report said this made the page not feel "redeemed enough".
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ),
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    // Code + Show-to-Staff visible (in-window).
    expect(getByTestId('redemption-details-card')).toBeTruthy()
    expect(getByTestId('redemption-details-code')).toBeTruthy()
    expect(getByTestId('redemption-details-show-to-staff')).toBeTruthy()
    // Seal AND hero overlay are now ALSO visible during the in-window
    // state (wave 8 change).
    expect(getByTestId('voucher-detail-hero-seal')).toBeTruthy()
  })

  it('OUT-OF-WINDOW (3 hours ago): code hidden, Show-to-Staff hidden, expired-window inner notice + hero seal surface', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      ),
    })
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    // Card surface is still mounted (for header / summary / info rows /
    // disclaimer) but the code surface and Show-to-Staff entry are gone.
    expect(getByTestId('redemption-details-card')).toBeTruthy()
    expect(queryByTestId('redemption-details-code')).toBeNull()
    expect(queryByTestId('redemption-details-show-to-staff')).toBeNull()
    // Inner notice card (the new design) replaces the previous
    // loose-text "Staff handoff window ended..." + "history tip"
    // bottom-of-card pair. Sits in the slot where the code box was.
    expect(getByTestId('redemption-details-expired-notice')).toBeTruthy()
    // Seal is now an OVERLAY on the hero/banner (testID `voucher-
    // detail-hero-seal`). The previous standalone middle-page mount
    // (`redeemed-seal` testID exposed via the component) is gone —
    // the component still has its testID, but now mounts inside the
    // hero overlay wrapper.
    expect(getByTestId('voucher-detail-hero-seal')).toBeTruthy()
  })

  it('VALIDATED (regardless of window): code hidden, Show-to-Staff hidden, validated pill + seal surface', () => {
    // Validated is terminal — once staff has scanned, the code
    // surface collapses even if the customer is technically still
    // inside the 2h window.
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago, in-window
      ),
    })
    // Override the persisted isValidated flag.
    mockVoucherData.lastRedemption.isValidated = true
    mockVoucherData.lastRedemption.validatedAt = new Date().toISOString()

    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('redemption-details-code')).toBeNull()
    expect(queryByTestId('redemption-details-show-to-staff')).toBeNull()
    expect(getByTestId('redemption-details-validated-pill')).toBeTruthy()
    expect(getByTestId('redeemed-seal')).toBeTruthy()
  })

  it('OUT-OF-WINDOW does NOT mount ShowToStaff even with a programmatic press attempt', () => {
    // Defense-in-depth pin (locked 2026-05-08, PR #49 review): the
    // card hides the CTA, but if a future render-tree race re-attaches
    // it, the parent's onShowToStaff handler must ALSO refuse to mount
    // ShowToStaff. The test confirms `show-to-staff-mounted` does not
    // appear after the gate has flipped closed.
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      ),
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    // The CTA testID is gone — there's nothing to press. This is the
    // user-visible surface guarantee. The handler-side guard is
    // implicit: even if a press were synthesised against a stale
    // node, the `if (showRedeemedSeal) return` early-out in
    // VoucherDetailScreen would block ShowToStaff from mounting.
    expect(queryByTestId('redemption-details-show-to-staff')).toBeNull()
    expect(queryByTestId('show-to-staff-mounted')).toBeNull()
  })

  it('non-redeemed states do NOT render the seal (gate is scoped to redeemed-this-cycle)', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: false,
      lastRedemption: null,
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('redeemed-seal')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// §AE6 — Screen-capture protection on Voucher Detail (locked 2026-05-08,
// owner direction PR #49 review).
//
// Rule: ANY surface that displays the redemption code or QR must have
// screen-capture protection active. ShowToStaff and SuccessPopup already
// install the protection via their own hooks; this block pins that
// Voucher Detail itself does the same — necessary because the persisted
// RedemptionDetailsCard surfaces the code on return visits during the
// 2-hour presentation window.
//
// Active condition (mirrors the card's `showCodeSurface` gate):
//   stateKey === 'redeemed-this-cycle'
//   AND a redemption exists to display
//   AND isPresentationActive === true
//   AND isRedemptionValidated === false
// ═══════════════════════════════════════════════════════════════════════

describe('§AE6 — Voucher Detail screen-capture protection', () => {
  function persistedAt(redeemedAt: string, overrides: any = {}) {
    return {
      code:        'A7K2P9X4',
      redeemedAt,
      branch:      { id: 'b1', name: 'Brightlingsea' },
      isValidated: false,
      validatedAt: null,
      ...overrides,
    }
  }

  it('IN-WINDOW redeemed (code visible) calls preventScreenCaptureAsync on mount', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ),
    })
    wrap(<VoucherDetailScreen />)
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
  })

  it('OUT-OF-WINDOW redeemed (code hidden) does NOT call preventScreenCaptureAsync', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      ),
    })
    wrap(<VoucherDetailScreen />)
    // The hook is called with `active=false` — `useScreenCaptureProtection`
    // is a no-op in that branch (verified in its own unit tests).
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
  })

  it('VALIDATED redeemed (code hidden, regardless of window) does NOT call preventScreenCaptureAsync', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        { isValidated: true, validatedAt: new Date().toISOString() },
      ),
    })
    wrap(<VoucherDetailScreen />)
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
  })

  it('NON-REDEEMED voucher does NOT call preventScreenCaptureAsync (no code surface to protect)', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: false,
      lastRedemption: null,
    })
    wrap(<VoucherDetailScreen />)
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
  })

  it('UNMOUNT after IN-WINDOW: allowScreenCaptureAsync called to release prevention', () => {
    // Symmetric pin — when Voucher Detail unmounts (user navigates back
    // to merchant profile, etc.), prevention must be released so other
    // app screens can be recorded normally afterwards. The hook's
    // cleanup is responsible for this.
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ),
    })
    const { unmount } = wrap(<VoucherDetailScreen />)
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
    unmount()
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1)
  })

  it('LOADING state does NOT call preventScreenCaptureAsync (no voucher → no code surface)', () => {
    // Defensive pin: while voucher data is loading, stateKey is
    // 'loading' — not 'redeemed-this-cycle'. Protection must stay off.
    mockVoucherData = null
    wrap(<VoucherDetailScreen />)
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// §AE6.2 — iOS post-fact screenshot detection on Voucher Detail (locked
// 2026-05-09, owner direction PR #49 device QA wave 2).
//
// Apple has no SDK to PREVENT iOS screenshots; the captured photo will
// always contain the unblurred code. The best we can do is detect via
// `addScreenshotListener`, surface a screen-level banner so the user
// sees we noticed, and post-fire telemetry. Mirrors the Show-to-Staff
// post-fact pattern (locked iOS framing §AB / deferred-followups §AE5).
// ═══════════════════════════════════════════════════════════════════════

describe('§AE6.2 — Voucher Detail iOS screenshot listener + banner', () => {
  let listener: () => void
  const removeSpy = jest.fn()
  const { Platform } = require('react-native') as typeof import('react-native')
  const { redemptionApi: api } = require('@/lib/api/redemption')

  function persistedAt(redeemedAt: string) {
    return {
      code:        'A7K2P9X4',
      redeemedAt,
      branch:      { id: 'b1', name: 'Brightlingsea' },
      isValidated: false,
      validatedAt: null,
    }
  }

  beforeEach(() => {
    jest.useFakeTimers()
    Platform.OS = 'ios' as any
    removeSpy.mockClear()
    ;(api.postScreenshotFlag as jest.Mock).mockClear()
    ;(api.postScreenshotFlag as jest.Mock).mockResolvedValue({ accepted: true })
    ;(ScreenCapture.addScreenshotListener as jest.Mock).mockImplementation(
      (cb: () => void) => {
        listener = cb
        return { remove: removeSpy }
      },
    )
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('IN-WINDOW redeemed (code visible) on iOS installs the screenshot listener', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ),
    })
    wrap(<VoucherDetailScreen />)
    expect(ScreenCapture.addScreenshotListener).toHaveBeenCalledTimes(1)
  })

  it('OUT-OF-WINDOW (code hidden) does NOT install the screenshot listener', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      ),
    })
    wrap(<VoucherDetailScreen />)
    expect(ScreenCapture.addScreenshotListener).not.toHaveBeenCalled()
  })

  it('VALIDATED (code hidden) does NOT install the screenshot listener', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: {
        ...persistedAt(new Date(Date.now() - 5 * 60 * 1000).toISOString()),
        isValidated: true,
        validatedAt: new Date().toISOString(),
      },
    })
    wrap(<VoucherDetailScreen />)
    expect(ScreenCapture.addScreenshotListener).not.toHaveBeenCalled()
  })

  it('NON-REDEEMED state does NOT install the screenshot listener', () => {
    mockVoucherData = baseVoucher({ isRedeemedThisCycle: false, lastRedemption: null })
    wrap(<VoucherDetailScreen />)
    expect(ScreenCapture.addScreenshotListener).not.toHaveBeenCalled()
  })

  it('Android does NOT install the listener (FLAG_SECURE handles both)', () => {
    Platform.OS = 'android' as any
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ),
    })
    wrap(<VoucherDetailScreen />)
    expect(ScreenCapture.addScreenshotListener).not.toHaveBeenCalled()
  })

  it('iOS screenshot fire surfaces the post-fact banner', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ),
    })
    const { queryByTestId, getByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('voucher-detail-screenshot-banner')).toBeNull()
    act(() => { listener() })
    expect(getByTestId('voucher-detail-screenshot-banner')).toBeTruthy()
  })

  it('iOS screenshot fire posts telemetry with the redemption code + ios platform', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ),
    })
    wrap(<VoucherDetailScreen />)
    act(() => { listener() })
    expect(api.postScreenshotFlag).toHaveBeenCalledWith('A7K2P9X4', 'ios')
  })

  it('banner auto-dismisses after 4 seconds', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ),
    })
    const { queryByTestId, getByTestId } = wrap(<VoucherDetailScreen />)
    act(() => { listener() })
    expect(getByTestId('voucher-detail-screenshot-banner')).toBeTruthy()
    act(() => { jest.advanceTimersByTime(4_001) })
    expect(queryByTestId('voucher-detail-screenshot-banner')).toBeNull()
  })

  it('listener is removed on unmount', () => {
    mockVoucherData = baseVoucher({
      isRedeemedThisCycle: true,
      lastRedemption: persistedAt(
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ),
    })
    const { unmount } = wrap(<VoucherDetailScreen />)
    expect(removeSpy).not.toHaveBeenCalled()
    unmount()
    expect(removeSpy).toHaveBeenCalledTimes(1)
  })
})
