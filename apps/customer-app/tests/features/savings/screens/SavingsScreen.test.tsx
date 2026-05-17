import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SavingsScreen } from '@/features/savings/screens/SavingsScreen'
import type { SavingsSummary, SavingsRedemption, MonthlyDetail } from '@/lib/api/savings'

// §Savings Rebaseline (PR-B, Revision 2) — SavingsScreen state-machine
// pins per plan v2 §8.  Verifies:
//   - 5 user states (loading / error / free / subscriber-empty / populated)
//   - PAST_DUE routes through normal states based on lifetimeSaving
//   - CANCELLED + EXPIRED route to State 1 (free) regardless of lifetime
//   - Subscription === null routes to State 1
//   - Free CTA → /(auth)/subscription-prompt (NOT /(app)/subscribe-prompt)
//   - TopPlaces tap → /(app)/merchant/{merchantId}  (merchant-only,
//     fidelity fixup-3 2026-05-17)
//   - RedemptionRow tap → /(app)/voucher/{id}

// ── Mocks ────────────────────────────────────────────────────────────
const mockRouterPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: jest.fn(), back: jest.fn() }),
}))

const mockSubscription = jest.fn()
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => mockSubscription(),
}))

const mockSummary = jest.fn()
const mockRedemptions = jest.fn()
const mockMonthlyDetail = jest.fn()
jest.mock('@/features/savings/hooks/useSavingsSummary', () => ({
  useSavingsSummary: () => mockSummary(),
}))
jest.mock('@/features/savings/hooks/useSavingsRedemptions', () => ({
  useSavingsRedemptions: () => mockRedemptions(),
}))
jest.mock('@/features/savings/hooks/useMonthlyDetail', () => ({
  useMonthlyDetail: () => mockMonthlyDetail(),
}))

// ── Fixtures ────────────────────────────────────────────────────────
const populatedSummary: SavingsSummary = {
  lifetimeSaving: 247.5,
  thisMonthSaving: 32,
  thisMonthRedemptionCount: 5,
  monthlyBreakdown: [
    { month: '2026-05', saving: 32, count: 5 },
    { month: '2026-04', saving: 18, count: 3 },
  ],
  byBranch: [
    {
      branchId: 'br-bright',
      branchName: 'Covelum — Brightlingsea',
      merchantId: 'cov',
      merchantName: 'Covelum',
      merchantLogoUrl: null,
      saving: 15, count: 1,
    },
    {
      branchId: 'br-colch',
      branchName: 'Colchester',
      merchantId: 'cov',
      merchantName: 'Covelum',
      merchantLogoUrl: null,
      saving: 10, count: 1,
    },
  ],
  byCategory: [{ categoryId: 'food', name: 'Food & Drink', saving: 20 }],
}

const emptySummary: SavingsSummary = {
  lifetimeSaving: 0,
  thisMonthSaving: 0,
  thisMonthRedemptionCount: 0,
  monthlyBreakdown: [],
  byBranch: [],
  byCategory: [],
}

const someRedemption: SavingsRedemption = {
  id: 'red-1',
  redeemedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  estimatedSaving: 12.5,
  isValidated: false,
  validatedAt: null,
  merchant: { id: 'cov', businessName: 'Covelum', logoUrl: null },
  voucher: { id: 'v-1', title: 't', voucherType: 'BOGO' },
  branch: { id: 'br-bright', name: 'Covelum — Brightlingsea' },
}

const initialMetrics = {
  frame:  { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>
    </QueryClientProvider>,
  )
}

// Default mock setup; each test overrides as needed.
function setMocks(opts: {
  subscription?: any
  isSubscribed?: boolean
  isSubLoading?: boolean
  summaryState?: 'loading' | 'success' | 'error'
  summaryData?: SavingsSummary | null
  redemptions?: SavingsRedemption[]
}) {
  mockSubscription.mockReturnValue({
    subscription:  opts.subscription ?? null,
    isSubscribed:  opts.isSubscribed ?? false,
    isSubLoading:  opts.isSubLoading ?? false,
  })
  mockSummary.mockReturnValue({
    data:      opts.summaryData,
    isLoading: opts.summaryState === 'loading',
    isError:   opts.summaryState === 'error',
    refetch:   jest.fn(),
  })
  mockRedemptions.mockReturnValue({
    data: { pages: [{ redemptions: opts.redemptions ?? [], total: opts.redemptions?.length ?? 0 }] },
    isFetchingNextPage: false,
    hasNextPage:        false,
    fetchNextPage:      jest.fn(),
    refetch:            jest.fn(),
  })
  mockMonthlyDetail.mockReturnValue({
    data: undefined, isLoading: false, isError: false, refetch: jest.fn(),
  })
}

beforeEach(() => {
  mockRouterPush.mockReset()
  mockSubscription.mockReset()
  mockSummary.mockReset()
  mockRedemptions.mockReset()
  mockMonthlyDetail.mockReset()
})

describe('SavingsScreen — user-state derivation', () => {
  it('loading: skeleton renders when summary is loading', () => {
    setMocks({ summaryState: 'loading' })
    const { getByTestId, queryByTestId } = wrap(<SavingsScreen />)
    expect(getByTestId('savings-skeleton')).toBeTruthy()
    expect(queryByTestId('savings-screen')).toBeNull()
  })

  it('loading: skeleton also renders when subscription is loading (avoids state flash)', () => {
    setMocks({ summaryState: 'success', summaryData: emptySummary, isSubLoading: true })
    const { getByTestId } = wrap(<SavingsScreen />)
    expect(getByTestId('savings-skeleton')).toBeTruthy()
  })

  it('error: shows ErrorState when summary errored AND no cached data', () => {
    setMocks({ summaryState: 'error', summaryData: null })
    const { getByText } = wrap(<SavingsScreen />)
    expect(getByText("Couldn't load your savings")).toBeTruthy()
  })

  it('free: subscription === null routes to State 1 hero', () => {
    setMocks({ summaryState: 'success', summaryData: emptySummary, subscription: null })
    const { getByTestId } = wrap(<SavingsScreen />)
    expect(getByTestId('savings-hero-free')).toBeTruthy()
  })

  it('subscriber-empty: ACTIVE + lifetimeSaving === 0 routes to State 2 hero', () => {
    setMocks({
      summaryState: 'success', summaryData: emptySummary,
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
    })
    const { getByTestId } = wrap(<SavingsScreen />)
    expect(getByTestId('savings-hero-subscriber-empty')).toBeTruthy()
  })

  it('populated: ACTIVE + lifetimeSaving > 0 routes to State 3', () => {
    setMocks({
      summaryState: 'success', summaryData: populatedSummary,
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
      redemptions: [someRedemption],
    })
    const { getByTestId } = wrap(<SavingsScreen />)
    expect(getByTestId('savings-hero-populated')).toBeTruthy()
    expect(getByTestId('savings-insight-section')).toBeTruthy()
  })
})

describe('SavingsScreen — locked subscription-status routing', () => {
  it('PAST_DUE with lifetimeSaving === 0 → State 2 (subscriber-empty)', () => {
    setMocks({
      summaryState: 'success', summaryData: emptySummary,
      subscription: { status: 'PAST_DUE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: false,           // useSubscription returns false for PAST_DUE
    })
    const { getByTestId } = wrap(<SavingsScreen />)
    expect(getByTestId('savings-hero-subscriber-empty')).toBeTruthy()
  })

  it('PAST_DUE with lifetimeSaving > 0 → State 3 (populated)', () => {
    setMocks({
      summaryState: 'success', summaryData: populatedSummary,
      subscription: { status: 'PAST_DUE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: false,
      redemptions: [someRedemption],
    })
    const { getByTestId } = wrap(<SavingsScreen />)
    expect(getByTestId('savings-hero-populated')).toBeTruthy()
  })

  it('CANCELLED with lifetimeSaving > 0 → State 1 (free) — NOT populated (locked §8.3)', () => {
    setMocks({
      summaryState: 'success', summaryData: populatedSummary,
      subscription: { status: 'CANCELLED', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: false,
    })
    const { getByTestId, queryByTestId } = wrap(<SavingsScreen />)
    expect(getByTestId('savings-hero-free')).toBeTruthy()
    expect(queryByTestId('savings-hero-populated')).toBeNull()
  })

  it('EXPIRED with lifetimeSaving > 0 → State 1 (free) — NOT populated (locked §8.3)', () => {
    setMocks({
      summaryState: 'success', summaryData: populatedSummary,
      subscription: { status: 'EXPIRED', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: false,
    })
    const { getByTestId, queryByTestId } = wrap(<SavingsScreen />)
    expect(getByTestId('savings-hero-free')).toBeTruthy()
    expect(queryByTestId('savings-hero-populated')).toBeNull()
  })
})

describe('SavingsScreen — navigation', () => {
  it('free CTA → /(auth)/subscription-prompt (NOT the stale /(app)/subscribe-prompt path)', () => {
    setMocks({ summaryState: 'success', summaryData: emptySummary, subscription: null })
    const { getByTestId } = wrap(<SavingsScreen />)
    fireEvent.press(getByTestId('savings-hero-subscribe-cta'))
    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/subscription-prompt')
  })

  it('subscriber-empty Browse CTA → /(app)/', () => {
    setMocks({
      summaryState: 'success', summaryData: emptySummary,
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
    })
    const { getByTestId } = wrap(<SavingsScreen />)
    fireEvent.press(getByTestId('savings-hero-browse-cta'))
    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/')
  })

  it('TopPlaces row tap → /(app)/merchant/{merchantId} (merchant-only, fidelity fixup-3)', async () => {
    // §Savings fidelity fixup-3 2026-05-17: rows are now merchant-
    // grouped.  Covelum Brightlingsea + Covelum Colchester collapse
    // into ONE "Covelum" row (testID `savings-top-places-row-cov`).
    // Tap navigates to the merchant profile without `?branch=`
    // since we no longer have a single branch to pin.
    setMocks({
      summaryState: 'success', summaryData: populatedSummary,
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
    })
    const { getByTestId } = wrap(<SavingsScreen />)
    await waitFor(() => expect(getByTestId('savings-top-places-row-cov')).toBeTruthy())
    fireEvent.press(getByTestId('savings-top-places-row-cov'))
    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/merchant/cov')
  })

  it('RedemptionRow tap → /(app)/voucher/{voucherId}', async () => {
    setMocks({
      summaryState: 'success', summaryData: populatedSummary,
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
      redemptions: [someRedemption],
    })
    const { getByTestId } = wrap(<SavingsScreen />)
    await waitFor(() => expect(getByTestId('savings-redemption-row-red-1')).toBeTruthy())
    fireEvent.press(getByTestId('savings-redemption-row-red-1'))
    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/voucher/v-1')
  })
})

describe('SavingsScreen — month-drill-down error state (fixup §6)', () => {
  it('selecting a past month whose detail errors → ErrorState + Retry CTA fires monthDetail.refetch', async () => {
    const refetchMonth = jest.fn()
    setMocks({
      summaryState: 'success', summaryData: populatedSummary,
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
    })
    // Override monthlyDetail to return an error on every call.  In
    // production, isError flips only after the user selects a month
    // and the fetch fails; here the mock is unconditional so we
    // assert the error UI mounts after `setSelectedMonth` fires.
    mockMonthlyDetail.mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: refetchMonth,
    })
    const { getByTestId, queryByTestId, getByText, queryByText } = wrap(<SavingsScreen />)
    // Tap the past-month bar (2026-04 from populatedSummary fixture).
    fireEvent.press(getByTestId('savings-trend-bar-2026-04'))
    // ErrorState mounts inside the insightSection.
    await waitFor(() => expect(getByTestId('savings-month-detail-error')).toBeTruthy())
    // Title interpolates the selected month — pin the right month
    // landed on the right error.
    expect(getByText("Couldn't load 2026-04")).toBeTruthy()
    // Wrong-month label is NOT shown.
    expect(queryByText("Couldn't load 2026-05")).toBeNull()
    // Retry tap fires monthDetail.refetch.
    fireEvent.press(getByText('Retry'))
    expect(refetchMonth).toHaveBeenCalled()
    // TopPlaces / ByCategory are NOT mounted while the error is
    // visible (regression guard against showing stale insight data).
    expect(queryByTestId('savings-top-places-row-cov')).toBeNull()
  })
})

describe('SavingsScreen — hook-order safety (regression for fixup hotfix 2026-05-17)', () => {
  it('mounting loading → re-rendering populated does NOT trigger "more hooks than previous render"', () => {
    // Regression for the listHeader useMemo placement.  If the memo
    // sits BELOW the `if (userState === 'loading') return ...` guard,
    // it never runs on the loading render, then runs on the next
    // populated render — React fires "Rendered more hooks than
    // during the previous render" and the screen blanks with a
    // red-box error.  Caught on device QA 2026-05-17.
    //
    // The test:
    //   - Mount with summaryState: 'loading' → skeleton path
    //     (skips listHeader memo if it's below the early return)
    //   - rerender with summaryState: 'success' populated →
    //     listHeader memo runs for the first time
    //   - React errors if the hook count differs across renders.
    //
    // We capture console.error to assert no Rules-of-Hooks message
    // fires across the transition.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    setMocks({ summaryState: 'loading' })
    const { rerender, getByTestId } = wrap(<SavingsScreen />)
    expect(getByTestId('savings-skeleton')).toBeTruthy()

    // Flip mocks: loading → populated
    setMocks({
      summaryState: 'success',
      summaryData: populatedSummary,
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
    })
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SafeAreaProvider initialMetrics={initialMetrics}><SavingsScreen /></SafeAreaProvider>
      </QueryClientProvider>,
    )

    // Populated UI now renders without a hook-order error.
    expect(getByTestId('savings-hero-populated')).toBeTruthy()

    // No "Rendered more hooks" or "change in the order of Hooks"
    // warnings fired during the transition.
    const hookOrderCalls = errorSpy.mock.calls.filter(call =>
      String(call[0] ?? '').match(/Rendered more hooks|order of Hooks/i)
    )
    expect(hookOrderCalls).toEqual([])

    errorSpy.mockRestore()
  })
})

describe('SavingsScreen — backend current month is authoritative (fixup §3)', () => {
  it("uses monthlyBreakdown[0].month as 'current' even when it disagrees with the device clock", async () => {
    // Pin: backend month is the source of truth.  If the device's
    // local clock said 2026-06 but the backend returns 2026-05 as
    // monthlyBreakdown[0].month, the screen treats 2026-05 as the
    // current month — tapping the 2026-05 bar should reset to no
    // selection (because it's the "current"), NOT route through
    // useMonthlyDetail.
    setMocks({
      summaryState: 'success',
      summaryData: {
        ...populatedSummary,
        // Authoritative current month from backend — first entry.
        monthlyBreakdown: [
          { month: '2026-05', saving: 32, count: 5 },
          { month: '2026-04', saving: 18, count: 3 },
        ],
      },
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
    })
    const { getByTestId, queryByTestId } = wrap(<SavingsScreen />)
    // Tapping the backend-current month bar deselects (handler short-
    // circuits because `month === curMonth`).
    fireEvent.press(getByTestId('savings-trend-bar-2026-05'))
    // ViewingChip never appears since selectedMonth stays null.
    expect(queryByTestId('savings-viewing-chip')).toBeNull()
  })
})

describe('SavingsScreen — design-fidelity fixup pass (2026-05-17)', () => {
  it('selected month hides the all-time Redemption History rows and label', () => {
    // §Issue 3: when the user drills into a past month via the
    // TrendChart, the all-time recent-history rows below were
    // misleading — they read as that month's redemptions even
    // though they're unfiltered.  Locked fix: hide the entire
    // history section under a selection until we have a
    // month-filtered redemptions endpoint.
    setMocks({
      summaryState: 'success', summaryData: populatedSummary,
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
      redemptions: [someRedemption],
    })
    const { getByTestId, queryByTestId, queryByText } = wrap(<SavingsScreen />)

    // Before selection: history row is visible.
    expect(getByTestId('savings-redemption-row-red-1')).toBeTruthy()
    expect(queryByText('Redemption History')).toBeTruthy()

    // Tap a past-month bar.
    fireEvent.press(getByTestId('savings-trend-bar-2026-04'))
    // ViewingChip appears.
    expect(getByTestId('savings-viewing-chip')).toBeTruthy()
    // History rows + label are GONE.
    expect(queryByTestId('savings-redemption-row-red-1')).toBeNull()
    expect(queryByText('Redemption History')).toBeNull()
  })

  it('selected month with empty TopBranches shows explicit empty-state card', () => {
    // §Issue 4: under a selected month, monthDetail returns empty
    // byBranch / byCategory arrays when the user has no redemptions
    // in that month.  Locked fix: show explicit empty-state cards
    // ("No branch savings in April" / "No category savings in
    // April") instead of silently rendering nothing.
    const refetchMonth = jest.fn()
    setMocks({
      summaryState: 'success', summaryData: populatedSummary,
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
    })
    // monthlyDetail returns success with EMPTY byBranch / byCategory.
    mockMonthlyDetail.mockReturnValue({
      data: { totalSaving: 0, redemptionCount: 0, byBranch: [], byCategory: [] },
      isLoading: false, isError: false, refetch: refetchMonth,
    })
    const { getByTestId, getByText } = wrap(<SavingsScreen />)
    fireEvent.press(getByTestId('savings-trend-bar-2026-04'))

    // Empty-state cards render with month-name copy.
    expect(getByTestId('savings-top-places-empty')).toBeTruthy()
    expect(getByText('No place savings in April')).toBeTruthy()
    expect(getByTestId('savings-by-category-empty')).toBeTruthy()
    expect(getByText('No category savings in April')).toBeTruthy()
  })

  it('no-selection populated state with empty byBranch / byCategory still hides those cards (current behaviour)', () => {
    // Locked: only the selected-month path opts into the empty-state
    // cards (via emptyLabel prop).  Current-month with empty data
    // still returns null on the cards — preserves the pre-fixup
    // behaviour for cold-start subscribed-empty edge cases.
    setMocks({
      summaryState: 'success',
      summaryData: {
        ...populatedSummary,
        byBranch:   [],   // empty
        byCategory: [],
      },
      subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } },
      isSubscribed: true,
    })
    const { queryByTestId } = wrap(<SavingsScreen />)
    // No empty-state cards under no-selection.
    expect(queryByTestId('savings-top-places-empty')).toBeNull()
    expect(queryByTestId('savings-by-category-empty')).toBeNull()
    // Normal cards also not present (data is empty).
    expect(queryByTestId('savings-top-places')).toBeNull()
    expect(queryByTestId('savings-by-category')).toBeNull()
  })
})
