import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { VoucherDetailScreen } from '@/features/voucher/screens/VoucherDetailScreen'

// Phase 3C.1g M2.10 — CouponHeader embeds `<FavouriteHeart>` which
// calls `useFavourite()` → `useQueryClient()`.  Wrap render here so
// the existing test bodies stay untouched.  useCustomerVoucher /
// useRedeem are already mocked above so the QueryClient doesn't
// re-introduce real-network behaviour.
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return rtlRender(node, { wrapper: Wrapper })
}

// State-machine + branch-attribution tests for VoucherDetailScreen.
// These pin the 12-state derivation the orchestrator implements +
// the locked branch-attribution contract from plan §11.

// ── Mocks ────────────────────────────────────────────────────────────

// expo-router: useLocalSearchParams returns the URL params; useRouter
// stub for back/push navigation. The test mutates `mockParams` between
// cases to drive the screen.
let mockParams: { id?: string; branch?: string } = { id: 'v1' }
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
    // useFocusEffect mock fires the effect AFTER commit (via useEffect)
    // matching the real focus-on-mount semantics. Round-16 fix: was
    // running synchronously during render, which broke effects that
    // called setState (infinite re-renders).
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        try { return effect() } catch { /* defensive */ return undefined }
      }, [])
    },
  }
})

// Voucher fetch hook — drives state-1/2/3/4/5–7 derivations.
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

// useRedeem requires a QueryClientProvider in production; M1 tests
// don't wrap in one because the screen previously only used useQuery
// hooks (themselves mocked). Stub useRedeem with the same shape the
// screen expects so M1 contracts continue to pass without bringing in
// a QueryClientProvider that would re-introduce real-network behaviour.
jest.mock('@/features/voucher/hooks/useRedeem', () => ({
  useRedeem: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    reset: jest.fn(),
  }),
}))

// Merchant profile — drives selectedBranch / branches list. The mock
// captures the (id, opts) args every call so tests can assert the
// branch URL param is threaded through correctly (closes the test
// gap raised in PR #40 review — the previous "renders without
// crashing" check would have passed even if branchIdParam was
// dropped from useMerchantProfile's options).
//
// jest.mock factories are hoisted above module code, so captured
// top-level identifiers aren't available inside the factory at the
// time the factory's CLOSURE runs. We park mutable state on a single
// globalThis-attached object that the factory dereferences fresh on
// every call.
;(globalThis as any).__voucherProfileMock__ = {
  data: null as any,
  isLoading: false,
  isError: false,
  spy: jest.fn(),
}
const useMerchantProfileSpy = (globalThis as any).__voucherProfileMock__.spy as jest.Mock
jest.mock('@/features/merchant/hooks/useMerchantProfile', () => ({
  useMerchantProfile: (id: string | undefined, opts: any) => {
    const m = (globalThis as any).__voucherProfileMock__
    m.spy(id, opts)
    return { data: m.data, isLoading: m.isLoading, isError: m.isError }
  },
}))

// Helpers so test-side mutations don't have to know about the global.
function setMerchantData(data: any) { (globalThis as any).__voucherProfileMock__.data = data }
function setMerchantLoading(v: boolean) { (globalThis as any).__voucherProfileMock__.isLoading = v }
function setMerchantError(v: boolean) { (globalThis as any).__voucherProfileMock__.isError = v }

// Subscription state — drives state 1 (free user).
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

// Default voucher payload — overridden per-test.
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

// Default merchant payload — overridden per-test.
const baseMerchant = () => ({
  id: 'm1',
  businessName: 'The Coffee House',
  // For the branch-attribution test: keep branches[0] DELIBERATELY
  // different from selectedBranch so we can prove the screen reads
  // selectedBranch and never falls back to branches[0].
  branches: [
    { id: 'WRONG-FIRST',  name: 'WrongBranch',   isMainBranch: false, isActive: true,
      addressLine1: null, addressLine2: null, city: null, postcode: null,
      latitude: null, longitude: null, phone: null, email: null,
      distance: 99999, isOpenNow: true,
      avgRating: null, reviewCount: 0, openingHours: [] },
    { id: 'CORRECT-SB',   name: 'CorrectSB',     isMainBranch: true,  isActive: true,
      addressLine1: null, addressLine2: null, city: 'London', postcode: null,
      latitude: null, longitude: null, phone: null, email: null,
      distance: 100, isOpenNow: true,
      avgRating: 4.5, reviewCount: 12, openingHours: [] },
  ],
  selectedBranch: {
    id: 'CORRECT-SB',
    name: 'CorrectSB',
    isMainBranch: true,
    isActive: true,
    addressLine1: null, addressLine2: null, city: 'London',
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
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>
  )
}

// ── Reset before each test ───────────────────────────────────────────
beforeEach(() => {
  mockParams = { id: 'v1' }
  mockVoucherData = baseVoucher()
  mockVoucherLoading = false
  mockVoucherError = false
  mockSubscribed = true
  mockSubLoading = false

  // Push merchant defaults into the globalThis-attached mock state
  // each test sees a fresh starting point (helpers below also write
  // into this object, so mid-test mutations work too).
  setMerchantData(baseMerchant())
  setMerchantLoading(false)
  setMerchantError(false)
  useMerchantProfileSpy.mockClear()
})

// ── 12-state derivation tests ─────────────────────────────────────────

describe('VoucherDetailScreen — state machine', () => {
  it('renders state 9 (loading) while voucher fetch is in flight', () => {
    mockVoucherLoading = true
    mockVoucherData = null
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-loading')).toBeTruthy()
  })

  it('renders state 9 (loading) while subscription is still loading', () => {
    mockSubLoading = true
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-loading')).toBeTruthy()
  })

  it('renders error state when the fetch fails', () => {
    mockVoucherError = true
    mockVoucherData = null
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-error')).toBeTruthy()
  })

  it('renders state 1 (free-user) when not subscribed', () => {
    mockSubscribed = false
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-free-user')).toBeTruthy()
    expect(getByTestId('redeem-cta-subscribe')).toBeTruthy()
  })

  it('renders state 2 (can redeem) for subscribed user with a normal voucher', () => {
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-can-redeem')).toBeTruthy()
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
  })

  it('renders state 3 (already redeemed) when isRedeemedThisCycle is true', () => {
    mockVoucherData = { ...baseVoucher(), isRedeemedThisCycle: true }
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-redeemed-this-cycle')).toBeTruthy()
    // M3 §AE wave 4 (locked 2026-05-09): the standalone RedeemedBadge
    // pill was removed and the seal moved onto the hero overlay.
    // No redeemedAt source here (no in-memory + no persisted), so
    // neither the seal nor the badge render — only the CTA's
    // redeemed-state copy + page state-key surface confirm we're in
    // the redeemed-this-cycle state.
    expect(queryByTestId('redeemed-badge')).toBeNull()
    expect(getByTestId('redeem-cta-redeemed')).toBeTruthy()
  })

  it('renders state 4 (expired) when expiryDate is in the past', () => {
    mockVoucherData = { ...baseVoucher(), expiryDate: '2020-01-01T00:00:00.000Z' }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-expired')).toBeTruthy()
    expect(getByTestId('redeem-cta-expired')).toBeTruthy()
  })

  it('renders TIME_LIMITED variant with hero status block + active CTA (M4b-8 / M4d Phase G)', () => {
    // M4b-8 introduced the real TIME_LIMITED state machine driven by
    // `currentWindow` + `availabilityWindows` via useTimeLimited. M4d
    // Phase G (2026-05-11) replaced the post-coupon TimeLimitedBanner
    // mount with <HeroStatusBlock> inside <CouponHeader>. The minimal
    // fixture below produces a window that is currently open with
    // > 60min remaining → 'active'. Assertion now pins the new mount.
    const futureISO = (minutes: number): string =>
      new Date(Date.now() + minutes * 60_000).toISOString()
    const pastISO = (minutes: number): string =>
      new Date(Date.now() - minutes * 60_000).toISOString()
    mockVoucherData = {
      ...baseVoucher(),
      type: 'TIME_LIMITED',
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: { startsAt: pastISO(30), endsAt: futureISO(120) },
      nextWindow: { startsAt: futureISO(24 * 60), endsAt: futureISO(24 * 60 + 120) },
      redeemedWindow: null,
      isRedeemedThisCycle: false,
      availableAgainAt: null,
    }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-time-limited-active')).toBeTruthy()
    expect(getByTestId('hero-status-block')).toBeTruthy()
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
  })

  it('expired wins over already-redeemed (defensive priority — no double-state)', () => {
    mockVoucherData = {
      ...baseVoucher(),
      expiryDate: '2020-01-01T00:00:00.000Z',
      isRedeemedThisCycle: true,
    }
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-expired')).toBeTruthy()
    expect(queryByTestId('redeemed-badge')).toBeNull()
  })

  it('redeemed-this-cycle wins over free-user (subscription state irrelevant once redemption row exists)', () => {
    mockSubscribed = false
    mockVoucherData = { ...baseVoucher(), isRedeemedThisCycle: true }
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-redeemed-this-cycle')).toBeTruthy()
  })
})

// ── TIME_LIMITED state machine (M4b-8) ───────────────────────────────

describe('VoucherDetailScreen — TIME_LIMITED state machine (M4b-8)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    // Tuesday 2026-05-12 10:00 UTC = 11:00 BST. Deterministic anchor for
    // the TIME_LIMITED suite so the state-machine derivation is stable
    // regardless of run time.
    //
    // Why this exact instant:
    //   • Sits well clear of the 21:30 London brittleness boundary that
    //     made futureISO(180) flip from unavailable-today to
    //     unavailable-future-day (crosses midnight London past ~21:30).
    //   • availabilityWindows fixtures pin to dayOfWeek: 1 (Monday)
    //     11:00-15:00. Anchoring on Tuesday means there is NO current
    //     window re-derivable from availabilityWindows[] alone — the
    //     state-machine flows to the nextWindow path which is what the
    //     unavailable-today / unavailable-future-day tests exercise.
    //   • futureISO(180) = same Tuesday 14:00 BST → same London day →
    //     unavailable-today.
    //   • futureISO(2 * 24 * 60) = Thursday 11:00 BST → different London
    //     day → unavailable-future-day.
    //
    // Locked: spec D1 (2026-05-11-voucher-detail-m4d-redesign-design.md §6 D1).
    jest.setSystemTime(new Date('2026-05-12T10:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // Helpers — relative ISO timestamps using Date.now() so tests are
  // deterministic regardless of wall clock.
  function futureISO(minutes: number): string {
    return new Date(Date.now() + minutes * 60_000).toISOString()
  }
  function pastISO(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString()
  }

  // Base TIME_LIMITED voucher fixture — extends baseVoucher() with
  // an active recurring window (Mon-Fri 11-15) and a "now is inside
  // the current window" currentWindow block.
  function tlVoucher(overrides: any = {}): any {
    return {
      ...baseVoucher(),
      type: 'TIME_LIMITED' as const,
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: { startsAt: pastISO(30), endsAt: futureISO(120) },
      nextWindow:    { startsAt: futureISO(24 * 60), endsAt: futureISO(24 * 60 + 120) },
      redeemedWindow: null,
      // M4a contract: TIME_LIMITED always returns isRedeemedThisCycle=false
      isRedeemedThisCycle: false,
      // M4a contract: TIME_LIMITED always returns availableAgainAt=null
      availableAgainAt: null,
      ...overrides,
    }
  }

  // ── Phase G mount-order pins (M4d, 2026-05-11) ────────────────────
  //
  // Owner direction: "Do not leave duplicate TIME_LIMITED timing
  // surfaces on screen." Phase G replaced the three M4b post-coupon
  // mount sites (FrostedCountdown + TimeLimitedBanner +
  // TimeLimitedDetailsCard) with a single <HeroStatusBlock> inside
  // <CouponHeader> + TL-specific sections inside <CouponBodyCard>.
  // These pins enforce the contract: HeroStatusBlock present, all
  // three M4b testIDs absent. Cross-fixture (active / urgent /
  // unavailable-today) so any future refactor that resurrects a
  // duplicated countdown trips the pin in every state.
  const M4B_TESTIDS = [
    'vd-frosted-countdown',         // FrostedCountdown root
    'time-limited-banner-active',   // TimeLimitedBanner variant testIDs
    'time-limited-banner-urgent',
    'time-limited-banner-unavailable',
    'time-limited-details-card',    // TimeLimitedDetailsCard root
  ] as const

  it('time-limited-active state: 2h remaining → active state key + HeroStatusBlock (M4d Phase G — M4b mounts absent)', () => {
    mockVoucherData = tlVoucher()
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-time-limited-active')).toBeTruthy()
    expect(getByTestId('hero-status-block')).toBeTruthy()
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
    // M4d Phase G: the three M4b mount sites are GONE.
    M4B_TESTIDS.forEach((id) => {
      expect(queryByTestId(id)).toBeNull()
    })
  })

  it('time-limited-urgent state: 30min remaining → urgent state key + HeroStatusBlock (M4d Phase G — M4b mounts absent)', () => {
    mockVoucherData = tlVoucher({
      currentWindow: { startsAt: pastISO(60), endsAt: futureISO(30) },
    })
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-time-limited-urgent')).toBeTruthy()
    expect(getByTestId('hero-status-block')).toBeTruthy()
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
    M4B_TESTIDS.forEach((id) => {
      expect(queryByTestId(id)).toBeNull()
    })
  })

  it('time-limited-unavailable-today state: no current window, nextWindow later today → HeroStatusBlock + disabled-navy CTA (M4d Phase G — M4b mounts absent)', () => {
    mockVoucherData = tlVoucher({
      currentWindow: null,
      nextWindow: { startsAt: futureISO(180), endsAt: futureISO(180 + 60) },
    })
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-time-limited-unavailable-today')).toBeTruthy()
    expect(getByTestId('hero-status-block')).toBeTruthy()
    expect(getByTestId('redeem-cta-unavailable-window')).toBeTruthy()
    // No active redeem CTA — disabled-navy CTA is the dominant message.
    expect(queryByTestId('redeem-cta-active')).toBeNull()
    M4B_TESTIDS.forEach((id) => {
      expect(queryByTestId(id)).toBeNull()
    })
  })

  it('time-limited-unavailable-future-day state: no current window, nextWindow > 24h → same disabled-navy CTA', () => {
    mockVoucherData = tlVoucher({
      currentWindow: null,
      nextWindow: { startsAt: futureISO(2 * 24 * 60), endsAt: futureISO(2 * 24 * 60 + 240) },
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-time-limited-unavailable-future-day')).toBeTruthy()
    expect(getByTestId('redeem-cta-unavailable-window')).toBeTruthy()
  })

  it('redeemed-this-window state: TIME_LIMITED + redeemedWindow set → state key flips, hero seal renders', () => {
    mockVoucherData = tlVoucher({
      redeemedWindow: { startsAt: pastISO(60), endsAt: futureISO(120) },
      lastRedemption: {
        code: 'A7K2P9X4',
        redeemedAt: pastISO(30),
        branch: { id: 'CORRECT-SB', name: 'CorrectSB' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    // State key per spec §5.1: mirrors `redeemed-this-cycle` for cycle
    // vouchers — `redeemed-this-window` for TIME_LIMITED. The hero seal
    // surface is identical in both redeemed states; the subtitle source
    // differs (see the "Available again in" / "Renews on" tests below).
    expect(getByTestId('voucher-detail-state-redeemed-this-window')).toBeTruthy()
    expect(getByTestId('voucher-detail-hero-seal')).toBeTruthy()
  })

  it('expired-precedes-redeemed-window (D4 lock): expired voucher + TIME_LIMITED + redeemedWindow set → expired wins', () => {
    mockVoucherData = tlVoucher({
      expiryDate: pastISO(10),
      redeemedWindow: { startsAt: pastISO(120), endsAt: futureISO(60) },
      lastRedemption: {
        code: 'A7K2P9X4',
        redeemedAt: pastISO(120),
        branch: { id: 'CORRECT-SB', name: 'CorrectSB' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-state-expired')).toBeTruthy()
    expect(queryByTestId('voucher-detail-state-redeemed-this-window')).toBeNull()
    expect(queryByTestId('voucher-detail-hero-seal')).toBeNull()
  })

  it('RedeemedSeal subtitle reads "Available again in …" for TIME_LIMITED (sourced from nextWindow.startsAt)', () => {
    mockVoucherData = tlVoucher({
      redeemedWindow: { startsAt: pastISO(180), endsAt: pastISO(0) },
      lastRedemption: {
        code: 'A7K2P9X4',
        redeemedAt: pastISO(60),
        branch: { id: 'CORRECT-SB', name: 'CorrectSB' },
        isValidated: false,
        validatedAt: null,
      },
      currentWindow: null,
      nextWindow: { startsAt: futureISO(18 * 60 + 24), endsAt: futureISO(18 * 60 + 24 + 240) },
    })
    const { getByText } = wrap(<VoucherDetailScreen />)
    expect(getByText(/Available again in/)).toBeTruthy()
  })

  it('RedeemedSeal subtitle reads "Renews on …" for non-TIME_LIMITED (sourced from availableAgainAt) — unchanged', () => {
    mockVoucherData = {
      ...baseVoucher(),
      isRedeemedThisCycle: true,
      availableAgainAt: futureISO(28 * 24 * 60),
      lastRedemption: {
        code: 'B7K2P9X4',
        redeemedAt: pastISO(60),
        branch: { id: 'CORRECT-SB', name: 'CorrectSB' },
        isValidated: false,
        validatedAt: null,
      },
    }
    const { getByText } = wrap(<VoucherDetailScreen />)
    expect(getByText(/Renews on/)).toBeTruthy()
  })
})

// ── Branch-attribution contract (plan §11 C1) ────────────────────────

describe('VoucherDetailScreen — branch attribution (plan §11)', () => {
  it('displays the branch name from merchant.selectedBranch.id, NOT branches[0].id', () => {
    // Fixture deliberately makes branches[0] = WrongBranch and
    // selectedBranch = CorrectSB. Plan §11 C1 says display MUST
    // come from selectedBranch — this asserts the contract.
    const { getByTestId, queryByText } = wrap(<VoucherDetailScreen />)
    const merchantRow = getByTestId('merchant-row')
    expect(merchantRow).toBeTruthy()

    const redeemAtLine = getByTestId('redeem-at-line')
    expect(redeemAtLine).toBeTruthy()

    // The "Redeem at" line shows "CorrectSB" (the selected branch),
    // never "WrongBranch" (branches[0]).
    expect(queryByText(/CorrectSB/)).toBeTruthy()
    expect(queryByText(/WrongBranch/)).toBeNull()
  })

  it('shows "Redeem at <branch>" with the selected branch name verbatim', () => {
    setMerchantData({
      ...baseMerchant(),
      selectedBranch: {
        ...baseMerchant().selectedBranch,
        id: 'B-XYZ',
        name: 'Brightlingsea',
      },
    })
    const { queryByText } = wrap(<VoucherDetailScreen />)
    expect(queryByText(/Brightlingsea/)).toBeTruthy()
  })

  it('hides the "Change ▾" affordance for single-branch merchants', () => {
    setMerchantData({
      ...baseMerchant(),
      branches: [baseMerchant().branches[1]],     // single branch
    })
    const { queryByText } = wrap(<VoucherDetailScreen />)
    expect(queryByText(/Change ▾/)).toBeNull()
  })

  it('shows the "Change ▾" affordance for multi-branch merchants', () => {
    // baseMerchant() has 2 branches by default.
    const { queryByText } = wrap(<VoucherDetailScreen />)
    expect(queryByText(/Change ▾/)).toBeTruthy()
  })

  it('keeps state 3 (already redeemed) regardless of which branch is selected — eligibility is branch-INDEPENDENT (§11 C4)', () => {
    // First render: selected branch = CorrectSB, voucher already redeemed.
    // M3 §AE wave 4 (locked 2026-05-09): the standalone RedeemedBadge
    // was removed; the redeemed signal is now the hero seal overlay.
    // With no redeemedAt source in this fixture, neither surfaces —
    // we assert the page state-key as the redeemed-state pin.
    mockVoucherData = { ...baseVoucher(), isRedeemedThisCycle: true }
    let result = wrap(<VoucherDetailScreen />)
    expect(result.getByTestId('voucher-detail-state-redeemed-this-cycle')).toBeTruthy()
    expect(result.getByTestId('redeem-cta-redeemed')).toBeTruthy()
    result.unmount()

    // Re-render with a DIFFERENT selected branch — voucher is still
    // marked redeemed in this cycle, eligibility is per (userId,
    // voucherId) NOT per (userId, voucherId, branchId), so the state
    // and the redeemed-CTA copy MUST stay.
    setMerchantData({
      ...baseMerchant(),
      selectedBranch: { ...baseMerchant().selectedBranch, id: 'DIFFERENT-BRANCH', name: 'OtherBranch' },
    })
    result = wrap(<VoucherDetailScreen />)
    expect(result.getByTestId('voucher-detail-state-redeemed-this-cycle')).toBeTruthy()
    expect(result.getByTestId('redeem-cta-redeemed')).toBeTruthy()
  })

  it('threads the ?branch=<id> URL param into useMerchantProfile.opts.branchId', () => {
    // PR #40 review fix: the previous version of this test only
    // checked the screen rendered without crashing — a regression
    // dropping branchIdParam from useMerchantProfile's options would
    // have passed silently. Now we capture the hook's args and
    // assert the URL branch flows through to the data fetch.
    mockParams = { id: 'v1', branch: 'BRANCH-FROM-URL' }
    wrap(<VoucherDetailScreen />)
    expect(useMerchantProfileSpy).toHaveBeenCalled()
    // The hook is called with (merchantId, opts). Find the call where
    // merchantId is set (skipping the initial call before voucher
    // resolves, where merchantId is undefined).
    const call = useMerchantProfileSpy.mock.calls.find(c => c[0] === 'm1')
    expect(call).toBeTruthy()
    expect(call?.[1]).toMatchObject({ branchId: 'BRANCH-FROM-URL' })
  })

  it('passes voucher.merchant.id (not branches[0].id or any other source) as the merchant id to useMerchantProfile', () => {
    mockParams = { id: 'v1', branch: 'BRANCH-FROM-URL' }
    wrap(<VoucherDetailScreen />)
    // baseVoucher's merchant.id is 'm1'. Even though baseMerchant()
    // returns branches[0] = WRONG-FIRST, the screen MUST use the
    // voucher's own merchant.id and the URL's branchId — NOT pluck
    // an id from the merchant.branches array.
    const merchantIds = useMerchantProfileSpy.mock.calls.map(c => c[0])
    expect(merchantIds).toContain('m1')
    expect(merchantIds).not.toContain('WRONG-FIRST')
  })

  it('does NOT replace branchIdParam with branches[0].id or any other fallback in the client', () => {
    mockParams = { id: 'v1', branch: 'BRANCH-FROM-URL' }
    wrap(<VoucherDetailScreen />)
    // For every call to useMerchantProfile after voucher loaded, the
    // branchId option is either the URL param OR undefined (cold-open
    // resolution case). It is NEVER 'WRONG-FIRST' or any other value.
    const branchIds = useMerchantProfileSpy.mock.calls.map(c => c[1]?.branchId)
    expect(branchIds.every(b => b === undefined || b === 'BRANCH-FROM-URL')).toBe(true)
    expect(branchIds).not.toContain('WRONG-FIRST')
    expect(branchIds).not.toContain('CORRECT-SB')
  })

  it('cold-open (no ?branch param): passes branchId=undefined and lets the server resolve nearest', () => {
    mockParams = { id: 'v1' }
    wrap(<VoucherDetailScreen />)
    const call = useMerchantProfileSpy.mock.calls.find(c => c[0] === 'm1')
    expect(call).toBeTruthy()
    // No branchId in opts when URL param absent — server-side resolver
    // (nearest by GPS / isMainBranch) takes over.
    expect(call?.[1]?.branchId).toBeUndefined()
  })
})

// ── Active-CTA gating (PR #40 review blocker — plan §11) ──────────────────────

describe('VoucherDetailScreen — active CTA gated on branch readiness', () => {
  it('hides the sticky CTA wrap entirely when branch is unresolved (no alarming "Resolving Branch…" button)', () => {
    // Locked 2026-05-07 from device QA — pre-fix this rendered a
    // disabled primary "Resolving Branch…" CTA which read as
    // "broken/uncertain" rather than "loading". Post-fix the cta
    // memo returns null and the {cta ? <wrap> : null} guard
    // collapses the sticky wrap. The MerchantRow placeholder
    // ("Resolving branch…") still surfaces inline to give the
    // user a quieter signal that branch context is loading.
    setMerchantLoading(true)
    setMerchantData(null)
    const { queryByTestId, getByTestId } = wrap(<VoucherDetailScreen />)
    // No CTA at all — neither the active variant nor any
    // "branch-loading" variant should render.
    expect(queryByTestId('redeem-cta-active')).toBeNull()
    expect(queryByTestId('redeem-cta-branch-loading')).toBeNull()
    expect(queryByTestId('redeem-cta-subscribe')).toBeNull()
    expect(queryByTestId('redeem-cta-redeemed')).toBeNull()
    // Quieter inline signal — the MerchantRow placeholder.
    expect(getByTestId('redeem-at-placeholder')).toBeTruthy()
  })

  it('renders error state when merchant query errors out', () => {
    setMerchantError(true)
    setMerchantData(null)
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-error')).toBeTruthy()
  })

  it('renders error state when merchant data has no selectedBranch (e.g. all-suspended fallback)', () => {
    setMerchantData({ ...baseMerchant(), selectedBranch: null })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-error')).toBeTruthy()
  })

  it('free-user CTA still renders even when merchant is loading (does not need branch context)', () => {
    mockSubscribed = false
    setMerchantLoading(true)
    setMerchantData(null)
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('redeem-cta-subscribe')).toBeTruthy()
    expect(queryByTestId('redeem-cta-branch-loading')).toBeNull()
  })

  it('already-redeemed CTA still renders disabled even when merchant is loading (no branch context needed)', () => {
    mockVoucherData = { ...baseVoucher(), isRedeemedThisCycle: true }
    setMerchantLoading(true)
    setMerchantData(null)
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('redeem-cta-redeemed')).toBeTruthy()
    expect(queryByTestId('redeem-cta-branch-loading')).toBeNull()
  })

  it('expired CTA still renders disabled even when merchant is loading', () => {
    mockVoucherData = { ...baseVoucher(), expiryDate: '2020-01-01T00:00:00.000Z' }
    setMerchantLoading(true)
    setMerchantData(null)
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('redeem-cta-expired')).toBeTruthy()
    expect(queryByTestId('redeem-cta-branch-loading')).toBeNull()
  })
})
