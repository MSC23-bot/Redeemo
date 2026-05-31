import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
  VoucherDetailScreen,
  buildReturnUrl,
} from '@/features/voucher/screens/VoucherDetailScreen'

// PR #40 round 5 — back-navigation contract tests.
//
// What this pins (round-5 plan §1):
//   • When pushed from MerchantProfileScreen, Voucher Detail receives
//     `from=merchant&returnMerchantId=<id>&tab=vouchers&branch=<id>`
//     URL params. handleBack uses these EXCLUSIVELY — it does NOT
//     read voucher.merchant.id, so back navigation works even when
//     the voucher query is still loading or has errored.
//   • Cold links / push-notification flows without these params fall
//     through to router.back() (when canGoBack) and finally to
//     router.replace('/(app)/') as a last-resort Discovery default.
//
// pure-function `buildReturnUrl` is unit-tested first, then the
// integration is exercised via the rendered screen + simulated tap.

// ── Pure-function unit tests ─────────────────────────────────────────

describe('buildReturnUrl — pure URL construction', () => {
  it('returns the merchant URL when from=merchant + returnMerchantId + branch are all present', () => {
    expect(
      buildReturnUrl({
        from: 'merchant',
        returnMerchantId: 'm1',
        branch: 'b1',
        tab: 'vouchers',
      }),
    ).toBe('/(app)/merchant/m1?branch=b1&tab=vouchers')
  })

  it('defaults tab to "vouchers" when tab param is absent', () => {
    expect(
      buildReturnUrl({
        from: 'merchant',
        returnMerchantId: 'm1',
        branch: 'b1',
      }),
    ).toBe('/(app)/merchant/m1?branch=b1&tab=vouchers')
  })

  it('encodeURIComponents the merchantId, branchId, and tab', () => {
    expect(
      buildReturnUrl({
        from: 'merchant',
        returnMerchantId: 'm 1/special',
        branch: 'b&1',
        tab: 'vou chers',
      }),
    ).toBe('/(app)/merchant/m%201%2Fspecial?branch=b%261&tab=vou%20chers')
  })

  it('returns null when from is missing', () => {
    expect(buildReturnUrl({ returnMerchantId: 'm1', branch: 'b1' })).toBeNull()
  })

  it('returns null when returnMerchantId is missing', () => {
    expect(buildReturnUrl({ from: 'merchant', branch: 'b1' })).toBeNull()
  })

  it('returns null when branch is missing (cold-open case — no GPS+isMainBranch fallback was hit on the push side)', () => {
    expect(buildReturnUrl({ from: 'merchant', returnMerchantId: 'm1' })).toBeNull()
  })

  it('returns null when from is an unrecognised origin token (defends against future tokens)', () => {
    expect(
      buildReturnUrl({ from: 'someUnknownOrigin', returnMerchantId: 'm1', branch: 'b1' }),
    ).toBeNull()
  })

  it('returns null for an empty params object', () => {
    expect(buildReturnUrl({})).toBeNull()
  })

  // ── §R3 Device-QA R1 Wave 2 (2026-05-30) — favourites origin ────────
  // Vouchers tab on Favourites pushes `?from=favourites`.  Voucher
  // Detail's back-nav must return to /(app)/favourites?tab=vouchers
  // rather than fall through to router.back() (which on a Tabs surface
  // restores the previously-active tab — usually Home).
  describe('§R3 — from=favourites origin (Device-QA R1 Wave 2)', () => {
    it('returns the Favourites > Vouchers URL when from=favourites', () => {
      expect(buildReturnUrl({ from: 'favourites' })).toBe('/(app)/favourites?tab=vouchers')
    })

    it('does NOT require branch / returnMerchantId for the favourites branch (favourites are merchant/voucher-scoped, not branch-scoped on the back URL)', () => {
      expect(
        buildReturnUrl({ from: 'favourites', returnMerchantId: 'm1', branch: 'b1' }),
      ).toBe('/(app)/favourites?tab=vouchers')
    })
  })

  // ── §R4 Device-QA R1 Wave 3 (2026-05-30) — merchantFrom propagation ──
  // When the user reaches voucher detail VIA a Merchant Profile that
  // was itself reached from Favourites, Merchant Profile stamps
  // `merchantFrom=favourites` on the voucher URL.  Voucher Detail's
  // return-to-merchant URL must rewrite this as `from=favourites` so
  // `resolveBackNavigation` on the rebuilt merchant page can pop one
  // more level (merchant → favourites).
  describe('§R4 — merchantFrom propagation (Device-QA R1 Wave 3)', () => {
    it('appends &from=favourites when merchantFrom=favourites is passed', () => {
      expect(
        buildReturnUrl({
          from:             'merchant',
          returnMerchantId: 'm1',
          branch:           'b1',
          merchantFrom:     'favourites',
        }),
      ).toBe('/(app)/merchant/m1?branch=b1&tab=vouchers&from=favourites')
    })

    it('does NOT append &from= when merchantFrom is undefined (existing behaviour preserved)', () => {
      expect(
        buildReturnUrl({
          from:             'merchant',
          returnMerchantId: 'm1',
          branch:           'b1',
        }),
      ).toBe('/(app)/merchant/m1?branch=b1&tab=vouchers')
    })

    it('does NOT append &from= for unrecognised merchantFrom values (defensive — only "favourites" propagates in v1)', () => {
      expect(
        buildReturnUrl({
          from:             'merchant',
          returnMerchantId: 'm1',
          branch:           'b1',
          merchantFrom:     'someUnknownOrigin',
        }),
      ).toBe('/(app)/merchant/m1?branch=b1&tab=vouchers')
    })

    it('coexists with branchChanged=1 — both flags can appear', () => {
      expect(
        buildReturnUrl({
          from:             'merchant',
          returnMerchantId: 'm1',
          branch:           'b1',
          branchChanged:    true,
          merchantFrom:     'favourites',
        }),
      ).toBe('/(app)/merchant/m1?branch=b1&tab=vouchers&branchChanged=1&from=favourites')
    })

    it('is ignored on the from=favourites branch (favourites→voucher direct entry doesn\'t chain through a merchant)', () => {
      expect(
        buildReturnUrl({ from: 'favourites', merchantFrom: 'favourites' }),
      ).toBe('/(app)/favourites?tab=vouchers')
    })
  })
})

// ── Integration tests — screen + handleBack wiring ────────────────────

let mockParams: Record<string, string | undefined> = { id: 'v1' }
const mockReplace    = jest.fn()
const mockBack       = jest.fn()
const mockPush       = jest.fn()
const mockNavigate   = jest.fn()
const mockDismissAll = jest.fn()
const mockCanGoBack  = jest.fn(() => true)

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({
      replace:    mockReplace,
      push:       mockPush,
      back:       mockBack,
      // Device-QA R1 Wave 6.3 (2026-05-30) — handleBack now uses
      // `router.navigate(target)` (expo-router 6 cross-tab API).
      // The Wave 6.2 dismissAll path was abandoned because it
      // dispatched the unsupported POP_TO_TOP action on our
      // Tabs-root navigator (LogBox warning).  Mock still includes
      // dismissAll so the §W6.3 regression pins can assert it is
      // NOT called.
      navigate:   mockNavigate,
      dismissAll: mockDismissAll,
      canGoBack:  mockCanGoBack,
    }),
    // Defer the effect to commit phase (via useEffect) so it can
    // call setState without triggering a render-phase loop.
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        try { return effect() } catch { /* defensive */ return undefined }
      }, [])
    },
  }
})

let mockVoucherData: any   = null
let mockVoucherLoading     = false
let mockVoucherError       = false
jest.mock('@/features/voucher/hooks/useCustomerVoucher', () => ({
  useCustomerVoucher: () => ({
    data:      mockVoucherData,
    isLoading: mockVoucherLoading,
    isError:   mockVoucherError,
  }),
}))

jest.mock('@/features/voucher/hooks/useRedeem', () => ({
  useRedeem: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    reset: jest.fn(),
  }),
}))

;(globalThis as any).__voucherProfileMock__ = {
  data: null as any,
  isLoading: false,
  isError: false,
  spy: jest.fn(),
}
jest.mock('@/features/merchant/hooks/useMerchantProfile', () => ({
  useMerchantProfile: (id: string | undefined, opts: any) => {
    const m = (globalThis as any).__voucherProfileMock__
    m.spy(id, opts)
    return { data: m.data, isLoading: m.isLoading, isError: m.isError }
  },
}))

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

const baseMerchant = () => ({
  id: 'm1',
  businessName: 'The Coffee House',
  branches: [
    { id: 'b1', name: 'CorrectSB', isMainBranch: true, isActive: true,
      addressLine1: null, addressLine2: null, city: null, postcode: null,
      latitude: null, longitude: null, phone: null, email: null,
      distance: 100, isOpenNow: true,
      avgRating: 4.5, reviewCount: 12, openingHours: [] },
  ],
  selectedBranch: {
    id: 'b1', name: 'CorrectSB', isMainBranch: true, isActive: true,
    addressLine1: null, addressLine2: null, city: null,
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
  // Phase 3C.1g M2.10 — QueryClientProvider added so CouponHeader's
  // embedded `<FavouriteHeart>` can call `useFavourite()`.
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  mockParams = { id: 'v1' }
  mockVoucherData    = baseVoucher()
  mockVoucherLoading = false
  mockVoucherError   = false
  mockSubscribed     = true
  mockSubLoading     = false
  mockReplace.mockClear()
  mockBack.mockClear()
  mockDismissAll.mockClear()
  mockNavigate.mockClear()
  mockPush.mockClear()
  mockCanGoBack.mockReset().mockReturnValue(true)
  ;(globalThis as any).__voucherProfileMock__.data       = baseMerchant()
  ;(globalThis as any).__voucherProfileMock__.isLoading  = false
  ;(globalThis as any).__voucherProfileMock__.isError    = false
})

describe('VoucherDetailScreen — handleBack via URL params', () => {
  it('1. with full return params + voucher LOADED → router.navigate to merchant + branch + vouchers tab (Wave 6.3: navigate, not replace)', () => {
    mockParams = {
      id: 'v1',
      from: 'merchant',
      returnMerchantId: 'm1',
      branch: 'b1',
      tab: 'vouchers',
    }
    const { getAllByLabelText } = wrap(<VoucherDetailScreen />)
    // Two "Go back" buttons exist: hero NavRow + CollapsedHeader.
    // Tap the hero one (first match) — both are wired to handleBack.
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&tab=vouchers')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('2. with full return params + voucher STILL LOADING → router.navigate still works (back must NOT depend on voucher load)', () => {
    mockParams = {
      id: 'v1',
      from: 'merchant',
      returnMerchantId: 'm1',
      branch: 'b1',
    }
    mockVoucherLoading = true
    mockVoucherData    = null
    const { getByTestId, getAllByLabelText } = wrap(<VoucherDetailScreen />)
    // Loading state renders FallbackNav (one back button).
    expect(getByTestId('voucher-detail-loading')).toBeTruthy()
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&tab=vouchers')
  })

  it('3. with full return params + voucher ERRORED → router.navigate still works', () => {
    mockParams = {
      id: 'v1',
      from: 'merchant',
      returnMerchantId: 'm1',
      branch: 'b1',
    }
    mockVoucherError = true
    mockVoucherData  = null
    const { getByTestId, getAllByLabelText } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-error')).toBeTruthy()
    // Error state has TWO "Go back" elements: the FallbackNav at top
    // AND the in-body errorBack pressable. Both wired to the same
    // handleBack — tap the first (top-nav) to mirror the user's
    // primary back tap.
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&tab=vouchers')
  })

  it('4. without return params + canGoBack=true → router.back() is used', () => {
    mockParams = { id: 'v1' }
    mockCanGoBack.mockReturnValue(true)
    const { getAllByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockBack).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('5. without return params + canGoBack=false → router.replace to Discovery as last-resort fallback', () => {
    mockParams = { id: 'v1' }
    mockCanGoBack.mockReturnValue(false)
    const { getAllByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockReplace).toHaveBeenCalledWith('/(app)/')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('6. tab param defaults to "vouchers" when absent on the URL', () => {
    mockParams = {
      id: 'v1',
      from: 'merchant',
      returnMerchantId: 'm1',
      branch: 'b1',
      // tab intentionally absent
    }
    const { getAllByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&tab=vouchers')
  })
})

// ── §W6-#1 Device-QA R1 Wave 6 (2026-05-30) ──────────────────────────
//
// Owner-reported blocker: when the user reached Voucher Detail via a
// Favourites chain (either Favourites > Vouchers > Voucher Detail OR
// Favourites > Merchants > Merchant Profile > Voucher Detail), tapping
// the merchant row on Voucher Detail pushed a bare merchant URL with
// no `?from=…` token.  When the user then tapped Back on that Merchant
// Profile, `resolveBackNavigation` had no origin to honour and fell
// through to the Tabs default (Home) instead of returning to
// Favourites.
//
// Fix: `handleMerchantTap` now appends `?from=favourites` to the push
// URL whenever EITHER `params.from === 'favourites'` (direct chain)
// OR `params.merchantFrom === 'favourites'` (Wave 3 propagated chain).
describe('VoucherDetailScreen — §W6-#1 + §P1 handleMerchantTap propagation', () => {
  // §P1 (Codex review 2026-05-31, PR #137) — Wave 6 only propagated
  // `from`.  Codex flagged that branch-level favourites also need the
  // BRANCH context to thread through the push, otherwise MP cold-
  // resolves another branch via nearest-GPS / main-branch fallback.
  // New URL shape (when branch is known) is
  // `/(app)/merchant/<id>?branch=<branchId>&from=favourites`.  The
  // branch param threads through INDEPENDENTLY of the from token —
  // non-favourites paths also benefit (and never carry from=favourites).
  //
  // Branch source = three-tier priority (matches `redeem.getBranchId`
  // + `<BranchPickerSheet currentBranchId>`):
  //   1. pickerConfirmedBranchId (in-session picker confirm)
  //   2. branchIdParam            (URL `?branch=<id>`)
  //   3. selectedBranch?.id       (server-resolved cold-open fallback)
  //
  // baseMerchant.selectedBranch.id = 'b1' (fixture line ~275); so any
  // chain that doesn't set URL `branch` still resolves to 'b1' via
  // cold-open fallback.
  it('chain A (Favourites > Vouchers > Voucher Detail) — pushes merchant URL with branch=b1 (cold-open fallback) + from=favourites', () => {
    mockParams = {
      id:   'v1',
      from: 'favourites',
    }
    const { getByLabelText } = wrap(<VoucherDetailScreen />)
    // baseMerchant.businessName = "The Coffee House" — no descriptor.
    fireEvent.press(getByLabelText('The Coffee House'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&from=favourites')
  })

  it('chain B (Favourites > Merchants > Merchant Profile > Voucher Detail) — pushes merchant URL with branch=b1 (URL branch wins) + from=favourites via merchantFrom propagation', () => {
    mockParams = {
      id:               'v1',
      from:             'merchant',
      returnMerchantId: 'm1',
      branch:           'b1',
      merchantFrom:     'favourites',
    }
    const { getByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByLabelText('The Coffee House'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&from=favourites')
  })

  it('non-favourites entry — pushes merchant URL with branch=b1 (URL branch wins) but NO from token', () => {
    mockParams = {
      id:               'v1',
      from:             'merchant',
      returnMerchantId: 'm1',
      branch:           'b1',
      // merchantFrom intentionally absent — covers Home / Search /
      // Map / Category origins that don't propagate today.
    }
    const { getByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByLabelText('The Coffee House'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1')
  })

  it('unrecognised merchantFrom value — pushes merchant URL with branch=b1 but NO from token (defensive: only "favourites" propagates in v1)', () => {
    mockParams = {
      id:               'v1',
      from:             'merchant',
      returnMerchantId: 'm1',
      branch:           'b1',
      merchantFrom:     'someUnknownOrigin',
    }
    const { getByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByLabelText('The Coffee House'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1')
  })

  // §P1 no-branch-resolution case is guarded at the implementation
  // level by `if (branchForPush) qsParts.push(...)` — without a
  // resolvable branch (picker/URL/selectedBranch all null) the URL
  // is `/(app)/merchant/<id>` with no junk `branch=undefined` segment.
  // An explicit test pin for this state would require driving the
  // merchant query into a no-active-branches fixture which renders
  // the branch-error UI (not the MerchantRow), so the assertion
  // cannot be reached.  The guard is small + obviously correct; the
  // four pins above + the optional-chain in source are sufficient
  // coverage.
})

// ── §W6.1 Device-QA R1 Wave 6.1 (2026-05-30) ─────────────────────────
//
// Owner re-QA after Wave 6 confirmed handleMerchantTap fix but flagged
// "Please inspect EVERY Voucher Detail path that pushes to Merchant
// Profile, not only the back-route builder."  Two more paths surfaced:
//   • handleReviewPromptPress — fires when the user taps the Review
//     Prompt card on a redeemed-this-cycle Voucher Detail.
//   • SuccessPopup `onRateReview` — fires when the user taps "Rate &
//     Review" on the just-redeemed SuccessPopup.
// Both pushed to MP > Reviews > openWriteReview with NO `from` token,
// so back from the rebuilt-after-scrub MP fell through to Tabs default
// (Home) — same regression class as the merchant-row tap fixed in
// Wave 6.  Fix: same nestedFrom propagation logic inlined at both
// sites.  Integration pin below covers handleReviewPromptPress (the
// surface is mountable in jest); SuccessPopup CTA is covered by the
// shared pattern + dev verification (would require a heavier
// useRedeem mock to drive the popup state).
describe('VoucherDetailScreen — §W6.1 handleReviewPromptPress propagation', () => {
  it('chain A — Rate&Review prompt pushes /(app)/merchant/[id] with params.from = "favourites" when params.from = "favourites"', () => {
    mockParams = { id: 'v1', from: 'favourites' }
    mockVoucherData = {
      ...baseVoucher(),
      isRedeemedThisCycle: true,
      lastRedemption: {
        code:        'A7K2P9X4',
        redeemedAt:  '2026-05-30T10:00:00.000Z',
        isValidated: false,
        validatedAt: null,
        branch:      { id: 'b1', name: 'CorrectSB' },
      },
    }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('voucher-detail-review-prompt-cta'))
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/merchant/[id]',
        params: expect.objectContaining({
          id:              'm1',
          branch:          'b1',
          tab:             'reviews',
          openWriteReview: '1',
          from:            'favourites',
        }),
      }),
    )
  })

  it('chain B — Rate&Review prompt pushes with params.from = "favourites" via merchantFrom propagation', () => {
    mockParams = {
      id:               'v1',
      from:             'merchant',
      returnMerchantId: 'm1',
      branch:           'b1',
      merchantFrom:     'favourites',
    }
    mockVoucherData = {
      ...baseVoucher(),
      isRedeemedThisCycle: true,
      lastRedemption: {
        code:        'A7K2P9X4',
        redeemedAt:  '2026-05-30T10:00:00.000Z',
        isValidated: false,
        validatedAt: null,
        branch:      { id: 'b1', name: 'CorrectSB' },
      },
    }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('voucher-detail-review-prompt-cta'))
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ from: 'favourites' }),
      }),
    )
  })

  // ── §W6.3 (2026-05-30) — handleBack uses router.navigate ─────
  //
  // Wave 6.2's `dismissAll + replace` pair dispatched POP_TO_TOP
  // (a Stack-only action) on our Tabs-root navigator, surfacing a
  // LogBox console error.  Wave 6.3 uses `router.navigate(target)`
  // — the expo-router 6 recommended programmatic cross-tab API.
  // See `navigateBackTo` docstring for the full root-cause history.
  it('§W6.3 — handleBack from favourites chain calls router.navigate (NOT dismissAll, NOT replace) — POP_TO_TOP regression fix', () => {
    mockParams = { id: 'v1', from: 'favourites' }
    const { getAllByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/favourites?tab=vouchers')
    // Regression pin — POP_TO_TOP was the device-QA blocker.
    expect(mockDismissAll).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('§W6.3 — handleBack to merchant URL (non-tab) ALSO uses router.navigate (uniform behaviour)', () => {
    mockParams = {
      id:               'v1',
      from:             'merchant',
      returnMerchantId: 'm1',
      branch:           'b1',
    }
    const { getAllByLabelText } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getAllByLabelText('Go back')[0])
    expect(mockNavigate).toHaveBeenCalledWith('/(app)/merchant/m1?branch=b1&tab=vouchers')
    expect(mockDismissAll).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('non-favourites entry — Rate&Review prompt push omits the `from` param (defensive)', () => {
    mockParams = {
      id:               'v1',
      from:             'merchant',
      returnMerchantId: 'm1',
      branch:           'b1',
      // merchantFrom intentionally absent
    }
    mockVoucherData = {
      ...baseVoucher(),
      isRedeemedThisCycle: true,
      lastRedemption: {
        code:        'A7K2P9X4',
        redeemedAt:  '2026-05-30T10:00:00.000Z',
        isValidated: false,
        validatedAt: null,
        branch:      { id: 'b1', name: 'CorrectSB' },
      },
    }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('voucher-detail-review-prompt-cta'))
    const pushed = (mockPush.mock.calls[0]?.[0]) as { params: Record<string, unknown> } | undefined
    expect(pushed?.params).toBeDefined()
    expect(pushed?.params.from).toBeUndefined()
  })
})
