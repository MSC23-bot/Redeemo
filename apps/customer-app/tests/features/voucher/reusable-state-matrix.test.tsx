import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { VoucherDetailScreen } from '@/features/voucher/screens/VoucherDetailScreen'

// M5 Task 10 — REUSABLE 5-state matrix coverage (spec §7.1) +
// D44 expiry-before-cooldown frontend-computed suppression +
// D25 hero seal absence pin.
//
// Mirrors the mock structure of voucher-detail-states.test.tsx so all
// useQuery / useMerchantProfile / useSubscription consumers are stubbed
// deterministically. The orchestrator under test is the real screen.

// ── Mocks ────────────────────────────────────────────────────────────

let mockParams: { id?: string; branch?: string } = { id: 'rv1' }
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        try { return effect() } catch { /* defensive */ return undefined }
      }, [])
    },
  }
})

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

jest.mock('@/features/voucher/hooks/useRedeem', () => ({
  useRedeem: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    reset: jest.fn(),
  }),
}))

;(globalThis as any).__reusableProfileMock__ = {
  data: null as any,
  isLoading: false,
  isError: false,
  spy: jest.fn(),
}
jest.mock('@/features/merchant/hooks/useMerchantProfile', () => ({
  useMerchantProfile: (id: string | undefined, opts: any) => {
    const m = (globalThis as any).__reusableProfileMock__
    m.spy(id, opts)
    return { data: m.data, isLoading: m.isLoading, isError: m.isError }
  },
}))

function setMerchantData(data: any) {
  ;(globalThis as any).__reusableProfileMock__.data = data
}

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

// Anchor — Tuesday 2026-05-12 12:00 UTC. Aligns with the broader
// REUSABLE spec date and is well clear of London midnight rollover.
const NOW = new Date('2026-05-12T12:00:00Z')

function isoOffsetMs(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString()
}
function minuteOffsetISO(minutes: number): string {
  return isoOffsetMs(minutes * 60_000)
}

const FOUR_HOURS_SECONDS = 4 * 60 * 60

// Base REUSABLE voucher fixture. Overrides drive the state-matrix
// table. `effectiveCooldownSeconds` is always non-null for REUSABLE
// (backend contract — Task 5 + Task 7).
function reusableVoucher(overrides: Partial<{
  availableAgainAt: string | null
  lastRedemption: any | null
  expiryDate: string | null
  effectiveCooldownSeconds: number
}> = {}): any {
  return {
    id: 'rv1',
    title: 'Free coffee',
    type: 'REUSABLE',
    description: 'Free coffee every visit.',
    terms: null,
    imageUrl: null,
    estimatedSaving: 3.0,
    expiryDate:        overrides.expiryDate     !== undefined ? overrides.expiryDate     : '2030-12-31T23:59:59.000Z',
    code: null,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    merchant: {
      id: 'm1',
      businessName: 'The Coffee House',
      tradingName: null,
      logoUrl: null,
      status: 'ACTIVE',
    },
    // D13: REUSABLE always has isRedeemedThisCycle=false.
    isRedeemedThisCycle: false,
    isFavourited: false,
    availableAgainAt: overrides.availableAgainAt !== undefined ? overrides.availableAgainAt : null,
    lastRedemption:    overrides.lastRedemption  !== undefined ? overrides.lastRedemption  : null,
    availabilityWindows: [],
    currentWindow: null,
    nextWindow: null,
    redeemedWindow: null,
    effectiveCooldownSeconds:
      overrides.effectiveCooldownSeconds ?? FOUR_HOURS_SECONDS,
  }
}

// Minimal merchant profile so MerchantRow / displayBranch resolve
// happily. Single branch; `selectedBranch.id` matches the URL branch
// param so `branchReady` flips true.
const baseBranch = {
  id: 'b1',
  name: 'Main branch',
  isMainBranch: true,
  isActive: true,
  addressLine1: null, addressLine2: null, city: 'London', postcode: null,
  latitude: null, longitude: null, phone: null, email: null,
  distance: 100, isOpenNow: true,
  avgRating: 4.5, reviewCount: 10, openingHours: [],
}
function baseMerchant() {
  return {
    id: 'm1',
    businessName: 'The Coffee House',
    branches: [baseBranch],
    selectedBranch: {
      ...baseBranch,
      country: 'GB',
      websiteUrl: null, logoUrl: null, bannerUrl: null, about: null,
      photos: [], amenities: [], myReview: null,
    },
    selectedBranchFallbackReason: 'used-candidate' as const,
  }
}

const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}
function wrap(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>
  )
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW)
  mockParams = { id: 'rv1' }
  mockVoucherData = null
  mockVoucherLoading = false
  mockVoucherError = false
  mockSubscribed = true
  mockSubLoading = false
  setMerchantData(baseMerchant())
})

afterEach(() => {
  jest.useRealTimers()
})

// ── State 1: Available now (no recent redemption) ────────────────────

describe('VoucherDetailScreen — REUSABLE state matrix (spec §7.1)', () => {
  it('state 1 — Available now: active Redeem CTA, no RedemptionDetailsCard, eyebrow "Available now"', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { queryByTestId, getByTestId } = wrap(<VoucherDetailScreen />)

    // State machine resolves to 'can-redeem' for REUSABLE-available.
    expect(getByTestId('voucher-detail-state-can-redeem')).toBeTruthy()
    // Hero eyebrow surfaces the "Available now" copy via HeroStatusBlock
    // reusable-available branch.
    expect(getByTestId('hero-status-eyebrow').props.children).toContain('Available now')
    // No persisted-card surface.
    expect(queryByTestId('redemption-details-card')).toBeNull()
    // Active redeem CTA.
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
  })

  it('state 2 — Available again + recent redemption: persisted card + disabled CTA + countdown', () => {
    const redeemedAt = minuteOffsetISO(-30)            // 30 min ago
    const availableAgainAt = minuteOffsetISO(3 * 60 + 30)   // 3h 30m
    mockVoucherData = reusableVoucher({
      availableAgainAt,
      lastRedemption: {
        code: 'ABCD1234',
        redeemedAt,
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)

    // Eyebrow flips to "Available again" via the reusable-cooldown branch.
    expect(getByTestId('hero-status-eyebrow').props.children).toContain('Available again')
    // Persisted RedemptionDetailsCard renders (M3 lifecycle).
    expect(getByTestId('redemption-details-card')).toBeTruthy()
    // Disabled cooldown CTA with countdown copy.
    const cta = getByTestId('redeem-cta-reusable-cooldown')
    expect(cta).toBeTruthy()
    expect(cta.props.accessibilityLabel).toMatch(/Available again in/)
  })

  it('state 3 — presentation expired, still in cooldown: countdown shown, NO RedemptionDetailsCard (D26)', () => {
    // 3h ago redemption (presentation expired — >2h), 4h cooldown.
    // Backend gates lastRedemption to null for the presentation-expired
    // window — fixture mirrors that (lastRedemption: null).
    const availableAgainAt = minuteOffsetISO(60)        // 1h to go on cooldown
    mockVoucherData = reusableVoucher({
      availableAgainAt,
      lastRedemption: null,
    })
    const { queryByTestId, getByTestId } = wrap(<VoucherDetailScreen />)

    expect(getByTestId('hero-status-eyebrow').props.children).toContain('Available again')
    expect(getByTestId('hero-status-primary')).toBeTruthy()  // countdown primary
    expect(queryByTestId('redemption-details-card')).toBeNull()
    expect(getByTestId('redeem-cta-reusable-cooldown')).toBeTruthy()
  })

  it('state 4 — cooldown elapsed, presentation alive: active CTA + persisted card simultaneously (REUSABLE distinguisher)', () => {
    // 35 min ago redemption (within 2h presentation). Cooldown already
    // elapsed → backend sets availableAgainAt to null (D16 future-only
    // convention) but lastRedemption stays populated until 2h passes.
    const redeemedAt = minuteOffsetISO(-35)
    mockVoucherData = reusableVoucher({
      availableAgainAt: null,
      lastRedemption: {
        code: 'PREV1234',
        redeemedAt,
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)

    expect(getByTestId('hero-status-eyebrow').props.children).toContain('Available now')
    // OLD code still visible.
    expect(getByTestId('redemption-details-card')).toBeTruthy()
    // NEW redemption available — active CTA.
    expect(getByTestId('redeem-cta-active')).toBeTruthy()
  })

  it('state 5 — expired voucher: dimmed hero, disabled CTA, "Expired"', () => {
    mockVoucherData = reusableVoucher({
      expiryDate: minuteOffsetISO(-60),  // expired 1h ago
    })
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)

    expect(getByTestId('voucher-detail-state-expired')).toBeTruthy()
    expect(getByTestId('redeem-cta-expired')).toBeTruthy()
    // REUSABLE in any state — no hero seal (D25).
    expect(queryByTestId('voucher-detail-hero-seal')).toBeNull()
  })
})

// ── D44: expiry-before-cooldown frontend-computed suppression ─────────

describe('VoucherDetailScreen — REUSABLE D44 expiry-before-cooldown (spec §7.4)', () => {
  it('suppresses "Available again in 3h 30m" when availableAgainAt > expiryDate', () => {
    const expiryDate       = minuteOffsetISO(60)              // expires in 1h
    const availableAgainAt = minuteOffsetISO(4 * 60)          // 4h from now — past expiry
    mockVoucherData = reusableVoucher({
      availableAgainAt,
      expiryDate,
    })
    const { getByTestId, queryByText, getByText } = wrap(<VoucherDetailScreen />)

    // The standard countdown copy is gone — both in the hero status
    // block (HeroStatusBlock receives msToOpen=null so it renders null)
    // AND in the disabled CTA label.
    expect(queryByText(/Available again in/)).toBeNull()
    // The replacement copy is shown.
    expect(getByText('Offer ends before it becomes available again')).toBeTruthy()
    expect(getByTestId('voucher-detail-expiry-before-available-again')).toBeTruthy()
    // The CTA is still visibly disabled (renders, just no countdown).
    expect(getByTestId('redeem-cta-reusable-cooldown')).toBeTruthy()
  })

  it('shows normal countdown when availableAgainAt <= expiryDate (sanity counter-test)', () => {
    const expiryDate       = minuteOffsetISO(8 * 60)
    const availableAgainAt = minuteOffsetISO(4 * 60)
    mockVoucherData = reusableVoucher({
      availableAgainAt,
      expiryDate,
    })
    const { queryByText, getByTestId } = wrap(<VoucherDetailScreen />)

    // The standard countdown CTA appears.
    expect(getByTestId('redeem-cta-reusable-cooldown').props.accessibilityLabel).toMatch(/Available again in/)
    // The D44 supporting line is NOT rendered.
    expect(queryByText(/Offer ends before/)).toBeNull()
  })
})

// ── M5 Gate E polish (Issue 1) — RedemptionDetailsCard → coupon spacer ─

describe('VoucherDetailScreen — REUSABLE Gate E polish Issue 1: card → coupon spacer', () => {
  it('state 2: renders 16pt spacer between RedemptionDetailsCard and coupon stack', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(3 * 60),
      lastRedemption: {
        code: 'ABCD1234',
        redeemedAt: minuteOffsetISO(-30),
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    const spacer = getByTestId('reusable-card-coupon-spacer')
    expect(spacer).toBeTruthy()
    // Flatten style to confirm 16pt height.
    const styles = Array.isArray(spacer.props.style) ? spacer.props.style : [spacer.props.style]
    const flat = Object.assign({}, ...styles)
    expect(flat.height).toBe(16)
  })

  it('state 4: spacer mounts when OLD redemption + active CTA simultaneous (REUSABLE distinguisher)', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: null,
      lastRedemption: {
        code: 'PREV1234',
        redeemedAt: minuteOffsetISO(-35),
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('reusable-card-coupon-spacer')).toBeTruthy()
  })

  it('state 1 (no redemption): RedemptionDetailsCard not rendered → spacer not rendered either', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('redemption-details-card')).toBeNull()
    expect(queryByTestId('reusable-card-coupon-spacer')).toBeNull()
  })

  it('state 3 (presentation expired): no RedemptionDetailsCard → no spacer (D26)', () => {
    // 3h ago redemption — backend gates lastRedemption to null past 2h
    // presentation window; fixture mirrors that.
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(60),
      lastRedemption: null,
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('redemption-details-card')).toBeNull()
    expect(queryByTestId('reusable-card-coupon-spacer')).toBeNull()
  })
})

// ── M5 Gate E polish (Issue 4) — alive ring on REUSABLE-available hero ─

describe('VoucherDetailScreen — REUSABLE Gate E polish Issue 4: alive hero treatment', () => {
  it('state 1 (reusable-available): renders alive ring on HeroStatusBlock', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('hero-status-block-alive-ring')).toBeTruthy()
  })

  it('state 2 (reusable-cooldown): NO alive ring (cooldown stays calm)', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(3 * 60),
      lastRedemption: {
        code: 'ABCD1234',
        redeemedAt: minuteOffsetISO(-30),
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { queryByTestId, getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('hero-status-block')).toBeTruthy()  // hero still renders
    expect(queryByTestId('hero-status-block-alive-ring')).toBeNull()
  })

  it('state 3 (cooldown active, presentation expired): NO alive ring', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(60),
      lastRedemption: null,
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('hero-status-block-alive-ring')).toBeNull()
  })

  it('state 4 (cooldown elapsed, OLD code visible): alive ring DOES render (CTA is active)', () => {
    // State 4 maps to reusable-available windowState because cooldown
    // is elapsed → the voucher is redeemable now. Alive treatment is
    // bound to windowState === 'reusable-available'.
    mockVoucherData = reusableVoucher({
      availableAgainAt: null,
      lastRedemption: {
        code: 'PREV1234',
        redeemedAt: minuteOffsetISO(-35),
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('hero-status-block-alive-ring')).toBeTruthy()
  })

  it('state 5 (expired voucher): NO alive ring — hero block returns null on expired', () => {
    mockVoucherData = reusableVoucher({
      expiryDate: minuteOffsetISO(-60),
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('hero-status-block-alive-ring')).toBeNull()
  })
})

// ── M5 Gate E polish (Issue 3) — REUSABLE coupon body content parity ──

describe('VoucherDetailScreen — REUSABLE Gate E polish Issue 3: body content parity with TL', () => {
  it('renders USAGE RULE block with "available again after each use" copy (no "wait" or "cooldown")', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { getByTestId, getByText } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('coupon-body-usage-rule')).toBeTruthy()
    expect(getByText('This voucher becomes available again after each use.')).toBeTruthy()
  })

  it('USAGE RULE copy avoids the locked-out words "wait" and "cooldown"', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    const usage = getByTestId('coupon-body-usage-rule')
    const a11y = String(usage.props.accessibilityLabel || '')
    expect(a11y.toLowerCase()).not.toContain('wait')
    expect(a11y.toLowerCase()).not.toContain('cooldown')
  })

  it('renders ABOUT THIS OFFER block carrying voucher.description (moved from hero per spec §7.3)', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { getByTestId, getByText } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('coupon-body-description')).toBeTruthy()
    // Description from the fixture: 'Free coffee every visit.'
    expect(getByText('Free coffee every visit.')).toBeTruthy()
  })

  it('REUSABLE description is NOT duplicated inside the hero (CouponHeader suppression)', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { getAllByText } = wrap(<VoucherDetailScreen />)
    // The description string appears exactly once in the rendered tree
    // (inside the coupon body); CouponHeader's `type !== 'REUSABLE'` gate
    // suppresses the in-column description for REUSABLE.
    const matches = getAllByText('Free coffee every visit.')
    expect(matches.length).toBe(1)
  })

  it('renders ReusableGuidanceCard (two-clock advisory) sandwiched between USAGE RULE and ABOUT THIS OFFER', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-reusable-guidance')).toBeTruthy()
  })

  it('REUSABLE coupon body bottom spacer (Issue 2) mounts before the Terms section', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('coupon-body-reusable-bottom-spacer')).toBeTruthy()
  })

  it('does NOT render TL-only sections (no AVAILABILITY pre-section, no TL guidance, no OFFER ENDS)', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('coupon-body-availability')).toBeNull()
    expect(queryByTestId('coupon-body-redeem-guidance')).toBeNull()
    expect(queryByTestId('coupon-body-offer-ends')).toBeNull()
  })
})

// ── Contextual placement (2026-05-12): pre-redemption guidance vs
//    post-redemption latest-code cards by state ───────────────────────

describe('VoucherDetailScreen — REUSABLE pre-redemption vs post-redemption advisory cards', () => {
  it('state 1 (no redemption): pre-redemption guidance renders; latest-code does NOT', () => {
    mockVoucherData = reusableVoucher({ availableAgainAt: null, lastRedemption: null })
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-reusable-guidance')).toBeTruthy()
    expect(queryByTestId('voucher-detail-reusable-latest-code')).toBeNull()
  })

  it('state 2 (recently redeemed, in cooldown): BOTH cards render', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(3 * 60),
      lastRedemption: {
        code: 'ABCD1234',
        redeemedAt: minuteOffsetISO(-30),
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-reusable-guidance')).toBeTruthy()
    expect(getByTestId('voucher-detail-reusable-latest-code')).toBeTruthy()
  })

  it('state 3 (presentation expired, lastRedemption=null): pre-redemption guidance renders; latest-code does NOT', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(60),
      lastRedemption: null,
    })
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-reusable-guidance')).toBeTruthy()
    expect(queryByTestId('voucher-detail-reusable-latest-code')).toBeNull()
  })

  it('state 4 (cooldown elapsed, presentation alive): BOTH cards render', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: null,
      lastRedemption: {
        code: 'PREV1234',
        redeemedAt: minuteOffsetISO(-35),
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)
    expect(getByTestId('voucher-detail-reusable-guidance')).toBeTruthy()
    expect(getByTestId('voucher-detail-reusable-latest-code')).toBeTruthy()
  })

  // Position pin: <ReusableLatestCodeCard> sits AFTER the
  // RedemptionDetailsCard in the rendered tree (sibling-after mount).
  it('state 2: latest-code card mounts AFTER RedemptionDetailsCard in the tree', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(3 * 60),
      lastRedemption: {
        code: 'ABCD1234',
        redeemedAt: minuteOffsetISO(-30),
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId, toJSON } = wrap(<VoucherDetailScreen />)
    const details = getByTestId('redemption-details-card')
    const latest = getByTestId('voucher-detail-reusable-latest-code')
    expect(details).toBeTruthy()
    expect(latest).toBeTruthy()
    // Rough order check: the testID string for latest-code appears
    // AFTER the details-card testID string in the serialised tree.
    const json = JSON.stringify(toJSON() ?? '')
    const detailsIdx = json.indexOf('"redemption-details-card"')
    const latestIdx  = json.indexOf('"voucher-detail-reusable-latest-code"')
    expect(detailsIdx).toBeGreaterThanOrEqual(0)
    expect(latestIdx).toBeGreaterThan(detailsIdx)
  })
})

// ── D25: REUSABLE never renders the hero seal at any state ────────────

describe('VoucherDetailScreen — REUSABLE hero seal absence (D25)', () => {
  it('state 2 (recently redeemed, in cooldown): no hero RedeemedSeal', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(3 * 60),
      lastRedemption: {
        code: 'ABCD1234',
        redeemedAt: minuteOffsetISO(-30),
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('voucher-detail-hero-seal')).toBeNull()
  })

  it('state 4 (cooldown elapsed, presentation alive): no hero RedeemedSeal', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: null,
      lastRedemption: {
        code: 'PREV1234',
        redeemedAt: minuteOffsetISO(-35),
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)
    expect(queryByTestId('voucher-detail-hero-seal')).toBeNull()
  })
})

// ── PR #72 pre-merge review (Finding 1, 2026-05-12) — REUSABLE cooldown
//    must NOT preempt free-user / expired stateKey precedence ─────────
//
// Bug shipped on Gate E branch: the REUSABLE cooldown CTA override and
// hero override both ran BEFORE the `switch (stateKey)` block, so:
//   - free user + cooldown saw "Available again in X" CTA instead of
//     "Subscribe to Redeem"
//   - expired + cooldown saw the cooldown CTA instead of "Expired"
//   - hero showed the cooldown countdown for free users (hero override
//     previously only excluded `'expired'`)
//
// Fix: gate BOTH overrides on `stateKey === 'can-redeem'` so the
// cooldown surface is additive within the "user can act" state and the
// state-machine precedence (expired > redeemed > free-user > can-redeem)
// is respected.

describe('VoucherDetailScreen — REUSABLE cooldown precedence (Finding 1)', () => {
  it('free user + REUSABLE in cooldown → subscribe CTA, NO cooldown CTA', () => {
    mockSubscribed = false
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(3 * 60 + 30), // 3h 30m cooldown
      lastRedemption: null,
    })
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)

    // State-machine resolves to 'free-user' (free-user precedes
    // cooldown-derived behaviour for REUSABLE).
    expect(getByTestId('voucher-detail-state-free-user')).toBeTruthy()
    // Subscribe CTA visible.
    expect(getByTestId('redeem-cta-subscribe')).toBeTruthy()
    // Cooldown CTA absent.
    expect(queryByTestId('redeem-cta-reusable-cooldown')).toBeNull()
  })

  it('expired REUSABLE voucher in cooldown → expired CTA, NO cooldown CTA', () => {
    mockVoucherData = reusableVoucher({
      expiryDate: minuteOffsetISO(-60),                  // expired 1h ago
      availableAgainAt: minuteOffsetISO(3 * 60 + 30),    // would otherwise be in cooldown
      lastRedemption: null,
    })
    const { getByTestId, queryByTestId } = wrap(<VoucherDetailScreen />)

    // State-machine resolves to 'expired' (expired precedes everything).
    expect(getByTestId('voucher-detail-state-expired')).toBeTruthy()
    // Expired CTA visible.
    expect(getByTestId('redeem-cta-expired')).toBeTruthy()
    // Cooldown CTA absent.
    expect(queryByTestId('redeem-cta-reusable-cooldown')).toBeNull()
  })

  it('subscribed + non-expired + REUSABLE in cooldown → cooldown CTA visible (regression guard for normal case)', () => {
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(3 * 60 + 30),
      lastRedemption: {
        code: 'ABCD1234',
        redeemedAt: minuteOffsetISO(-30),
        branch: { id: 'b1', name: 'Main branch' },
        isValidated: false,
        validatedAt: null,
      },
    })
    const { getByTestId } = wrap(<VoucherDetailScreen />)

    // Subscribed + active voucher + cooldown → cooldown override fires.
    expect(getByTestId('voucher-detail-state-can-redeem')).toBeTruthy()
    expect(getByTestId('redeem-cta-reusable-cooldown')).toBeTruthy()
  })

  it('hero: free user + REUSABLE in cooldown → hero shows free-user/subscribe treatment, NOT cooldown countdown', () => {
    mockSubscribed = false
    mockVoucherData = reusableVoucher({
      availableAgainAt: minuteOffsetISO(3 * 60 + 30),
      lastRedemption: null,
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)

    // HeroStatusBlock-related testIDs are absent — the REUSABLE hero
    // override is gated out for free-user state, falling through to the
    // CouponHeader default (no eyebrow / no countdown / no alive ring).
    expect(queryByTestId('hero-status-eyebrow')).toBeNull()
    expect(queryByTestId('hero-status-block')).toBeNull()
    expect(queryByTestId('hero-status-block-alive-ring')).toBeNull()
  })

  it('hero: expired REUSABLE in cooldown → hero shows expired state, NOT cooldown countdown', () => {
    mockVoucherData = reusableVoucher({
      expiryDate: minuteOffsetISO(-60),
      availableAgainAt: minuteOffsetISO(3 * 60 + 30),
      lastRedemption: null,
    })
    const { queryByTestId } = wrap(<VoucherDetailScreen />)

    // HeroStatusBlock is skipped for expired (preserved from the
    // existing Gate E Issue 4 polish) — no cooldown countdown leaks.
    expect(queryByTestId('hero-status-eyebrow')).toBeNull()
    expect(queryByTestId('hero-status-block')).toBeNull()
    expect(queryByTestId('hero-status-block-alive-ring')).toBeNull()
  })
})
