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
