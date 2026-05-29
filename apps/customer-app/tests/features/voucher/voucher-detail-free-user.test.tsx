import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { VoucherDetailScreen } from '@/features/voucher/screens/VoucherDetailScreen'

// Round 22 part 5: subscription prompt is now scheduled 800ms after the
// screen becomes interactive. Tests that need the modal visible must
// advance fake timers past that delay.
const SUBSCRIPTION_PROMPT_DELAY_MS = 800
function advancePastModalDelay() {
  act(() => {
    jest.advanceTimersByTime(SUBSCRIPTION_PROMPT_DELAY_MS)
  })
}

// PR #40 round 15 — Voucher Detail free-user state contract.
//
// Spec: docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md
//   §4  (Screen 2 — Voucher Detail Free User)
//   §11 ("Free user taps voucher → Sees Screen 2")
//
// Locked behaviour the tests pin:
//   • Free user can BROWSE the voucher (coupon header + body + merchant
//     row + terms + fair use). Same layout as Screen 1 minus How It Works.
//   • No "How It Works" section (user can't redeem yet).
//   • Sticky CTA: navy background, "Subscribe to Redeem · £6.99/mo".
//   • Tapping the CTA navigates to /(auth)/subscription-prompt.
//   • No PIN entry, no redeem mutation path.

// ── Stable router mock so we can assert push calls ────────────────────

let mockParams: Record<string, string | undefined> = { id: 'v1' }
const mockPush    = jest.fn()
const mockReplace = jest.fn()
const mockBack    = jest.fn()

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({
      push:    mockPush,
      replace: mockReplace,
      back:    mockBack,
      canGoBack: () => true,
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        try { return effect() } catch { /* defensive */ return undefined }
      }, [])
    },
  }
})

// Voucher / merchant / subscription / location mocks ────────────────────

let mockVoucherData: any = null
let mockVoucherLoading = false
let mockVoucherError = false
jest.mock('@/features/voucher/hooks/useCustomerVoucher', () => ({
  useCustomerVoucher: () => ({
    data:      mockVoucherData,
    isLoading: mockVoucherLoading,
    isError:   mockVoucherError,
  }),
}))

// Section B: stub useRedeem (avoid QueryClientProvider requirement
// in M1 tests that previously didn't wrap the screen).
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

let mockSubscribed = false
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
  title: 'Free Filter Coffee with Any Thali',
  type: 'FREEBIE' as const,
  description: 'Order any thali plate and get a complimentary South Indian filter coffee.',
  terms: 'In-house only. Cannot be combined with other offers. Once per cycle.',
  imageUrl: null,
  estimatedSaving: 2.5,
  expiryDate: null,
  code: null,
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  merchant: { id: 'm1', businessName: 'Covelum Restaurant', tradingName: null, logoUrl: null, status: 'ACTIVE' },
  isRedeemedThisCycle: false,
  isFavourited: false,
})

const baseMerchant = () => ({
  id: 'm1',
  businessName: 'Covelum Restaurant',
  branches: [
    {
      id: 'b1', name: 'Covelum — Brightlingsea',
      isMainBranch: true, isActive: true,
      addressLine1: null, addressLine2: null, city: 'Brightlingsea',
      postcode: null, latitude: null, longitude: null,
      phone: null, email: null,
      distance: 100, isOpenNow: true,
      avgRating: 4.6, reviewCount: 12, openingHours: [],
    },
  ],
  selectedBranch: {
    id: 'b1', name: 'Covelum — Brightlingsea',
    isMainBranch: true, isActive: true,
    addressLine1: null, addressLine2: null, city: 'Brightlingsea',
    postcode: null, country: 'GB',
    latitude: null, longitude: null,
    phone: null, email: null, websiteUrl: null,
    logoUrl: null, bannerUrl: null, about: null,
    openingHours: [],
    photos: [], amenities: [],
    distance: 100, isOpenNow: true,
    avgRating: 4.6, reviewCount: 12,
    myReview: null,
  },
  selectedBranchFallbackReason: 'used-candidate' as const,
  descriptor: 'Indian Restaurant',
})

const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function wrap(ui: React.ReactElement) {
  // Phase 3C.1g M2.10 — QueryClientProvider added so CouponHeader's
  // embedded `<FavouriteHeart>` can call `useFavourite()`.  Mocked
  // useRedeem + useCustomerVoucher keep query traffic off the wire.
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
  mockSubscribed     = false   // FREE USER for this whole file
  mockSubLoading     = false
  mockPush.mockClear()
  mockReplace.mockClear()
  mockBack.mockClear()
  ;(globalThis as any).__voucherProfileMock__.data       = baseMerchant()
  ;(globalThis as any).__voucherProfileMock__.isLoading  = false
  ;(globalThis as any).__voucherProfileMock__.isError    = false
})

// ── State + chrome contracts ─────────────────────────────────────────

describe('Voucher Detail — free-user state (Screen 2 per spec §4)', () => {
  it('renders the free-user state when isSubscribed=false', () => {
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-free-user')).toBeTruthy()
  })

  it('still renders the coupon (header + body) so the user can browse the voucher', () => {
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('coupon-header')).toBeTruthy()
    expect(getByTestId('coupon-top-card')).toBeTruthy()
    expect(getByTestId('coupon-body')).toBeTruthy()
  })

  it('still renders the merchant row + REDEEM AT branch attribution panel', () => {
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('merchant-row')).toBeTruthy()
    expect(getByTestId('redeem-at-line')).toBeTruthy()
  })
})

// ── How It Works variants ─────────────────────────────────────────────

describe('Voucher Detail — How It Works variant', () => {
  it('free-user state DOES render How It Works (round 17: 5-step variant starting "Subscribe to Unlock")', () => {
    // Round 15 hid this; round 16 owner direction restored it; round
    // 17 finalised both variants at 5 steps.
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    const node = getByTestId('how-it-works')
    expect(node).toBeTruthy()
    expect(node.props.accessibilityLabel).toBe('How redemption works (5 steps)')
  })

  it('subscribed-user state renders the 5-step variant (starting "Review the Voucher")', () => {
    mockSubscribed = true
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    const node = getByTestId('how-it-works')
    expect(node).toBeTruthy()
    expect(node.props.accessibilityLabel).toBe('How redemption works (5 steps)')
  })

  // ── Round 19: card-shaped tappable section, both states ─────

  it('free-user state — section is a tappable card, default EXPANDED', () => {
    // Round 19: free users now also see the card affordance + toggle
    // chevron. Steps are visible by default (still supports
    // conversion), but the section is collapsible if the user wants.
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('how-it-works-steps')).toBeTruthy()
    const toggle = getByTestId('how-it-works-toggle')
    expect(toggle.props.accessibilityRole).toBe('button')
    expect(toggle.props.accessibilityState).toEqual({ expanded: true })
    expect(toggle.props.accessibilityLabel).toBe('Collapse How redemption works')
  })

  it('free-user state — tapping the header collapses the steps', () => {
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('how-it-works-toggle'))
    expect(queryByTestId('how-it-works-steps')).toBeNull()
    const toggle = getByTestId('how-it-works-toggle')
    expect(toggle.props.accessibilityState).toEqual({ expanded: false })
    expect(toggle.props.accessibilityLabel).toBe('Expand How redemption works')
  })

  it('subscribed-user state — section is a tappable card, default COLLAPSED', () => {
    mockSubscribed = true
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    const toggle = getByTestId('how-it-works-toggle')
    expect(toggle.props.accessibilityRole).toBe('button')
    expect(toggle.props.accessibilityState).toEqual({ expanded: false })
    expect(toggle.props.accessibilityLabel).toBe('Expand How redemption works')
    expect(queryByTestId('how-it-works-steps')).toBeNull()
  })

  it('subscribed-user state — tapping the header expands the steps', () => {
    mockSubscribed = true
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('how-it-works-toggle'))
    expect(getByTestId('how-it-works-steps')).toBeTruthy()
    const toggle = getByTestId('how-it-works-toggle')
    expect(toggle.props.accessibilityState).toEqual({ expanded: true })
    expect(toggle.props.accessibilityLabel).toBe('Collapse How redemption works')
    // Tap again → collapses.
    fireEvent.press(toggle)
    expect(queryByTestId('how-it-works-steps')).toBeNull()
  })
})

// ── Subscription prompt modal (round 16) ─────────────────────────────

describe('Voucher Detail — subscription prompt modal (round 16)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders for free users 800ms after voucher data loads (round 22 part 5 delay)', () => {
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    // Modal must NOT be present synchronously — that would feel
    // gate-like. Free user should see the voucher itself first.
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
    advancePastModalDelay()
    expect(getByTestId('subscription-prompt-modal')).toBeTruthy()
  })

  it('does NOT render for subscribed users', () => {
    mockSubscribed = true
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
  })

  it('does NOT render before voucher data loads (subscription state irrelevant if voucher null)', () => {
    mockVoucherLoading = true
    mockVoucherData    = null
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
  })

  it('"Maybe later" dismisses the modal and keeps the user on Voucher Detail (no navigation)', () => {
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    expect(getByTestId('subscription-prompt-modal')).toBeTruthy()
    fireEvent.press(getByTestId('subscription-prompt-maybe-later'))
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
    expect(mockPush).not.toHaveBeenCalled()
    // Voucher Detail itself is still mounted.
    expect(getByTestId('voucher-detail-state-free-user')).toBeTruthy()
  })

  it('close icon dismisses the modal', () => {
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    fireEvent.press(getByTestId('subscription-prompt-close'))
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('annual plan button routes with source=voucher&plan=annual + return context', () => {
    // Round 21: plan-specific URL so SubscribePromptScreen can
    // initialise its plan selector to the user's pre-pick.
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    fireEvent.press(getByTestId('subscription-prompt-annual'))
    expect(mockPush).toHaveBeenCalledWith(
      '/(auth)/subscription-prompt?source=voucher&plan=annual&returnVoucherId=v1&branch=b1&returnMerchantId=m1&tab=vouchers',
    )
  })

  it('monthly plan button routes with source=voucher&plan=monthly + return context', () => {
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    fireEvent.press(getByTestId('subscription-prompt-monthly'))
    expect(mockPush).toHaveBeenCalledWith(
      '/(auth)/subscription-prompt?source=voucher&plan=monthly&returnVoucherId=v1&branch=b1&returnMerchantId=m1&tab=vouchers',
    )
  })
})

// ── Round 22 part 5: auto-modal delay contract ────────────────────────

describe('Voucher Detail — subscription prompt delay contract (round 22 part 5)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('does NOT auto-show the modal synchronously after mount', () => {
    // The user should see the voucher itself for a beat before the
    // conversion overlay appears. Synchronous show would feel like
    // the old hard gate the modal replaced.
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
  })

  it('does NOT auto-show the modal before the delay completes', () => {
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    act(() => {
      jest.advanceTimersByTime(SUBSCRIPTION_PROMPT_DELAY_MS - 1)
    })
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
  })

  it('auto-shows the modal once the delay completes', () => {
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
    advancePastModalDelay()
    expect(getByTestId('subscription-prompt-modal')).toBeTruthy()
  })

  it('does NOT schedule the timer when suppressSubscribePrompt=1 is on the URL', () => {
    // Free user returning from "Continue with Free Account" must not
    // see the modal pop in 800ms after they just dismissed it by
    // choosing free.
    mockParams = { id: 'v1', suppressSubscribePrompt: '1' }
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
  })

  it('does NOT schedule the timer for subscribed users', () => {
    mockSubscribed = true
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
  })

  it('does NOT auto-show after the user has dismissed via "Maybe later" (timer cancelled)', () => {
    // After dismiss, the modal must stay closed — even if some
    // internal timer were still pending. Effect deps include
    // promptDismissed → flipping it cancels the pending timer.
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    fireEvent.press(getByTestId('subscription-prompt-maybe-later'))
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
    // Advance well past any plausible re-schedule.
    act(() => { jest.advanceTimersByTime(SUBSCRIPTION_PROMPT_DELAY_MS * 3) })
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
  })
})

// ── Round 22: suppressSubscribePrompt URL param ───────────────────────

describe('Voucher Detail — suppressSubscribePrompt suppression contract (round 22)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('does NOT auto-show the modal when ?suppressSubscribePrompt=1 is on the URL (even after the delay)', () => {
    // Simulates returning from SubscribePromptScreen via "Continue
    // with Free Account" — the user just made a deliberate decision
    // and we must not nag-loop the same prompt back at them. Suppression
    // also blocks the round 22 part 5 delayed auto-show, so advancing
    // past the delay must still yield no modal.
    mockParams = { id: 'v1', suppressSubscribePrompt: '1' }
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    expect(queryByTestId('subscription-prompt-modal')).toBeNull()
  })

  it('still renders the sticky free-user CTA when modal is suppressed', () => {
    mockParams = { id: 'v1', suppressSubscribePrompt: '1' }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('redeem-cta-subscribe')).toBeTruthy()
  })

  it('sticky CTA still routes to subscription-prompt when modal is suppressed', () => {
    mockParams = {
      id: 'v1',
      branch: 'b1',
      from: 'merchant',
      returnMerchantId: 'm1',
      tab: 'vouchers',
      suppressSubscribePrompt: '1',
    }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-subscribe'))
    expect(mockPush).toHaveBeenCalledWith(
      '/(auth)/subscription-prompt?source=voucher&plan=monthly&returnVoucherId=v1&branch=b1&returnMerchantId=m1&tab=vouchers',
    )
  })

  it('fresh entry without the param auto-shows the modal after the delay (regression check)', () => {
    // No suppressSubscribePrompt param = fresh free-user open. After
    // the round 22 part 5 delay, the modal MUST still appear — the
    // suppression flag is the only thing that should block it.
    mockParams = { id: 'v1' }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    expect(getByTestId('subscription-prompt-modal')).toBeTruthy()
  })
})

// ── Subscribe CTA contract ───────────────────────────────────────────

describe('Voucher Detail — free-user CTA routes to subscription-prompt', () => {
  it('renders the subscribe CTA testID (no redeem CTA)', () => {
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('redeem-cta-subscribe')).toBeTruthy()
    // Active redeem path must NOT be rendered for free users.
    expect(queryByTestId('redeem-cta-active')).toBeNull()
    expect(queryByTestId('redeem-cta-redeemed')).toBeNull()
    expect(queryByTestId('redeem-cta-expired')).toBeNull()
  })

  it('tapping the sticky subscribe CTA navigates with source=voucher&plan=monthly + return context', () => {
    // Round 21: sticky CTA copy is "Subscribe to Redeem · £6.99/mo"
    // so plan=monthly matches the price. Full return-context params
    // included so SubscribePromptScreen's "Continue with Free
    // Account" can route back to this exact voucher detail page.
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-subscribe'))
    expect(mockPush).toHaveBeenCalledWith(
      '/(auth)/subscription-prompt?source=voucher&plan=monthly&returnVoucherId=v1&branch=b1&returnMerchantId=m1&tab=vouchers',
    )
  })
})

// ── Post-merge follow-up — buildSubscriptionUrl branch source ────────
//
// Symmetric to §O7's `MerchantProfileScreen.handleVoucherPress` fix
// (PR #40 round 23). The free-user sticky CTA + the modal's plan
// buttons can both fire while voucherQuery has resolved but
// merchantQuery is still in flight (selectedBranch still null).
// `buildSubscriptionUrl` must source the branch return value from
// the URL `branchIdParam` first so the URL-driven return contract
// — the basis for SubscribePromptScreen's "Continue with Free
// Account" round-trip + the suppressSubscribePrompt=1 flag — never
// drops the branch identity. Without this, the URL omits `branch=`,
// SubscribePromptScreen's secondary CTA can't rebuild the exact
// return URL, and falls back to router.back() — losing the
// suppression contract along the way.

describe('Voucher Detail — buildSubscriptionUrl reads branch from URL when selectedBranch is loading', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('sticky free-user CTA: URL branch=B2 wins when merchantQuery is still loading (no selectedBranch yet)', () => {
    // URL carries branch=b2 (user came from MerchantProfile with B2
    // selected). Voucher data has resolved → state machine produces
    // 'free-user'. Merchant data is still in flight → selectedBranch
    // is null. Without the fix, the pushed URL would omit branch=.
    mockParams = {
      id: 'v1',
      branch: 'b2',
      from: 'merchant',
      returnMerchantId: 'm1',
      tab: 'vouchers',
    }
    ;(globalThis as any).__voucherProfileMock__.data       = null
    ;(globalThis as any).__voucherProfileMock__.isLoading  = true
    ;(globalThis as any).__voucherProfileMock__.isError    = false

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-subscribe'))

    expect(mockPush).toHaveBeenCalledTimes(1)
    const [pushedUrl] = (mockPush as jest.Mock).mock.calls[0]
    expect(pushedUrl).toMatch(/branch=b2/)
    // Defensive — must NOT silently use a different branch (e.g. b1
    // from the steady-state fixture).
    expect(pushedUrl).not.toMatch(/branch=b1/)
  })

  it('modal annual button: URL branch=B2 wins when merchantQuery is still loading', () => {
    mockParams = {
      id: 'v1',
      branch: 'b2',
      from: 'merchant',
      returnMerchantId: 'm1',
      tab: 'vouchers',
    }
    ;(globalThis as any).__voucherProfileMock__.data       = null
    ;(globalThis as any).__voucherProfileMock__.isLoading  = true
    ;(globalThis as any).__voucherProfileMock__.isError    = false

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    fireEvent.press(getByTestId('subscription-prompt-annual'))

    expect(mockPush).toHaveBeenCalledWith(
      '/(auth)/subscription-prompt?source=voucher&plan=annual&returnVoucherId=v1&branch=b2&returnMerchantId=m1&tab=vouchers',
    )
  })

  it('modal monthly button: URL branch=B2 wins when merchantQuery is still loading', () => {
    mockParams = {
      id: 'v1',
      branch: 'b2',
      from: 'merchant',
      returnMerchantId: 'm1',
      tab: 'vouchers',
    }
    ;(globalThis as any).__voucherProfileMock__.data       = null
    ;(globalThis as any).__voucherProfileMock__.isLoading  = true
    ;(globalThis as any).__voucherProfileMock__.isError    = false

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    advancePastModalDelay()
    fireEvent.press(getByTestId('subscription-prompt-monthly'))

    expect(mockPush).toHaveBeenCalledWith(
      '/(auth)/subscription-prompt?source=voucher&plan=monthly&returnVoucherId=v1&branch=b2&returnMerchantId=m1&tab=vouchers',
    )
  })

  it('falls back to selectedBranch.id only when URL has no branch (cold-open contract preserved)', () => {
    // Cold-open: no ?branch= on the URL. Once merchant resolves,
    // selectedBranch carries the server-resolved branch. The fallback
    // must keep working — URL = subscription-prompt?...&branch=b1&...
    // even with no URL branch param.
    mockParams = {
      id: 'v1',
      from: 'merchant',
      returnMerchantId: 'm1',
      tab: 'vouchers',
      // intentionally no `branch` param
    }
    // steady-state merchant data — selectedBranch present, id=b1
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-subscribe'))

    const [pushedUrl] = (mockPush as jest.Mock).mock.calls[0]
    expect(pushedUrl).toMatch(/branch=b1/)
  })
})
