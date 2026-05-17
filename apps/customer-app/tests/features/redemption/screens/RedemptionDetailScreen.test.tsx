import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RedemptionDetailScreen } from '@/features/redemption/screens/RedemptionDetailScreen'
import { PRESENTATION_WINDOW_MS } from '@/features/voucher/utils/presentationWindow'
import type { MyRedemptionDetail } from '@/features/redemption/hooks/useMyRedemption'

// §Savings Redemption Detail screen — PR #105 device-QA round-3
// regression-test surface.  Pins the state-machine behaviour for
// every voucher type and every receipt state, plus the locked
// non-regression for the §AS-class identity bug (two REUSABLE
// redemptions of the same voucher must each open their OWN receipt
// with their OWN code — the routing-by-redemption.id pin lives in
// the SavingsScreen test, the data-identity pin lives here).

// ── Mocks ────────────────────────────────────────────────────────
const mockRouterPush = jest.fn()
const mockRouterBack = jest.fn()
const mockParams: { id?: string; from?: string } = {}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: jest.fn(), back: mockRouterBack }),
  useLocalSearchParams: () => mockParams,
}))

const mockUseMyRedemption = jest.fn()
jest.mock('@/features/redemption/hooks/useMyRedemption', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actual = jest.requireActual('@/features/redemption/hooks/useMyRedemption')
  return {
    ...actual,
    useMyRedemption: (id: string | undefined) => mockUseMyRedemption(id),
  }
})

// ── Fixtures ────────────────────────────────────────────────────
function makeDetail(overrides: Partial<MyRedemptionDetail> = {}): MyRedemptionDetail {
  return {
    id:               'red-1',
    redemptionCode:   'A7K2P9X4',
    redeemedAt:       new Date(Date.now() - 30 * 60_000).toISOString(),  // 30 min ago
    estimatedSaving:  12.5,
    isValidated:      false,
    validatedAt:      null,
    validationMethod: null,
    voucherId:        'v-1',
    branchId:         'br-1',
    voucher: {
      id:          'v-1',
      title:       'Half-price pizza Monday',
      voucherType: 'BOGO',
      merchant: {
        id:           'cov',
        businessName: 'Covelum',
      },
    },
    branch: {
      id:           'br-1',
      name:         'Brightlingsea',
      addressLine1: '12 High Street',
      city:         'Brightlingsea',
      postcode:     'CO7 0AB',
    },
    ...overrides,
  }
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

function setMock(opts: {
  data?: MyRedemptionDetail | undefined
  isLoading?: boolean
  isError?: boolean
}) {
  mockUseMyRedemption.mockReturnValue({
    data:      opts.data,
    isLoading: opts.isLoading ?? false,
    isError:   opts.isError ?? false,
    refetch:   jest.fn(),
  })
}

beforeEach(() => {
  mockRouterPush.mockReset()
  mockRouterBack.mockReset()
  mockUseMyRedemption.mockReset()
  mockParams.id = 'red-1'
  mockParams.from = 'savings'
})

// ── Tests ────────────────────────────────────────────────────────

describe('RedemptionDetailScreen — error guards', () => {
  it('renders no-id error when route is missing id param', () => {
    delete mockParams.id
    setMock({ data: undefined })
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail-no-id')).toBeTruthy()
  })

  it('renders error when fetch fails', () => {
    setMock({ isError: true })
    const { getByTestId, getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail-error')).toBeTruthy()
    expect(getByText(/Couldn't load this redemption/)).toBeTruthy()
  })

  it('renders loading shell while fetching', () => {
    setMock({ isLoading: true })
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail-loading')).toBeTruthy()
  })
})

describe('RedemptionDetailScreen — active window state', () => {
  it('shows code + "Show to staff" affordance when not validated AND within 2h window', () => {
    setMock({ data: makeDetail({
      redeemedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      isValidated: false,
    })})
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail-code')).toBeTruthy()
    expect(getByTestId('redemption-detail-status-active')).toBeTruthy()
  })

  it('formats the 8-char redemption code as "XXXX XXXX" (4+4 grouping)', () => {
    setMock({ data: makeDetail({ redemptionCode: 'A7K2P9X4' }) })
    const { getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByText('A7K2 P9X4')).toBeTruthy()
  })
})

describe('RedemptionDetailScreen — validated state', () => {
  it('shows green Validated chip when isValidated === true', () => {
    setMock({ data: makeDetail({
      isValidated: true,
      validatedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      validationMethod: 'QR_SCAN',
    })})
    const { getByTestId, getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail-status-validated')).toBeTruthy()
    expect(getByText('Validated by staff')).toBeTruthy()
    // Validation method shown only as secondary detail, not headline.
    expect(getByText(/QR scan/)).toBeTruthy()
  })

  it('shows "Manual code" secondary when validation method === MANUAL', () => {
    setMock({ data: makeDetail({
      isValidated: true,
      validatedAt: new Date().toISOString(),
      validationMethod: 'MANUAL',
    })})
    const { getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByText(/Manual code/)).toBeTruthy()
  })

  it('still shows redemption code on validated state (historical record)', () => {
    setMock({ data: makeDetail({
      isValidated:      true,
      validatedAt:      new Date().toISOString(),
      validationMethod: 'QR_SCAN',
      redemptionCode:   'BXYZ12CD',
    })})
    const { getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByText('BXYZ 12CD')).toBeTruthy()
  })
})

describe('RedemptionDetailScreen — ended (window expired, not validated) state', () => {
  it('shows "window ended" status when 2h+ since redemption AND not validated', () => {
    setMock({ data: makeDetail({
      redeemedAt: new Date(Date.now() - PRESENTATION_WINDOW_MS - 60_000).toISOString(),
      isValidated: false,
    })})
    const { getByTestId, queryByTestId } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail-status-ended')).toBeTruthy()
    // Critically: NOT 'active' — we don't imply the user can still
    // present the code to staff.
    expect(queryByTestId('redemption-detail-status-active')).toBeNull()
  })

  it('still shows the historical redemption code even when window has ended', () => {
    setMock({ data: makeDetail({
      redeemedAt:     new Date(Date.now() - 5 * 60 * 60_000).toISOString(),  // 5h ago
      isValidated:    false,
      redemptionCode: 'EXPRD123',
    })})
    const { getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByText('EXPR D123')).toBeTruthy()
  })

  it('historical past-cycle redemption still renders the full receipt', () => {
    // 60 days ago — guaranteed past the current cycle for any
    // subscription anchor.  Receipt must still be viewable.
    setMock({ data: makeDetail({
      redeemedAt: new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString(),
      isValidated: true,
      validatedAt: new Date(Date.now() - 60 * 24 * 60 * 60_000 + 5 * 60_000).toISOString(),
      validationMethod: 'QR_SCAN',
    })})
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail')).toBeTruthy()
    expect(getByTestId('redemption-detail-code')).toBeTruthy()
    expect(getByTestId('redemption-detail-status-validated')).toBeTruthy()
  })
})

describe('RedemptionDetailScreen — voucher type coverage', () => {
  // §Savings device-QA round-5 fixup 2026-05-18 — type eyebrow now
  // renders as an UPPERCASE chip with a coloured outline (the
  // voucher-type accent).  Text is wrapped in a child <Text>, so
  // the chip View's children are React elements not strings —
  // assert via the rendered text directly.

  it('renders REUSABLE redemption as "REUSABLE VOUCHER" eyebrow chip', () => {
    setMock({ data: makeDetail({
      voucher: {
        id: 'v-r', title: 'Coffee club', voucherType: 'REUSABLE',
        merchant: { id: 'cov', businessName: 'Covelum' },
      },
    })})
    const { getByText, getByTestId } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail-type-eyebrow')).toBeTruthy()
    expect(getByText('REUSABLE VOUCHER')).toBeTruthy()
  })

  it('renders TIME_LIMITED redemption with full historical receipt context even after window closed', () => {
    setMock({ data: makeDetail({
      voucher: {
        id: 'v-tl', title: 'Lunch deal 12-2pm', voucherType: 'TIME_LIMITED',
        merchant: { id: 'm', businessName: 'Bella Italia' },
      },
      redeemedAt: new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString(),
    })})
    const { getByTestId, getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail')).toBeTruthy()
    expect(getByText('TIME LIMITED VOUCHER')).toBeTruthy()
    expect(getByText('Lunch deal 12-2pm')).toBeTruthy()
  })

  it('renders FREEBIE redemption with full receipt', () => {
    setMock({ data: makeDetail({
      voucher: {
        id: 'v-f', title: 'Free coffee Friday', voucherType: 'FREEBIE',
        merchant: { id: 'm', businessName: 'Coffee Co' },
      },
    })})
    const { getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByText('FREEBIE VOUCHER')).toBeTruthy()
    expect(getByText('Free coffee Friday')).toBeTruthy()
  })

  it('renders BOGO redemption as "BUY ONE, GET ONE FREE VOUCHER" eyebrow chip', () => {
    setMock({ data: makeDetail() })
    const { getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByText('BUY ONE, GET ONE FREE VOUCHER')).toBeTruthy()
  })

  it('voucher-type accent strip renders (controlled identity accent)', () => {
    setMock({ data: makeDetail() })
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail-type-accent')).toBeTruthy()
  })
})

describe('RedemptionDetailScreen — voucher description + terms', () => {
  it('renders voucher description when present', () => {
    setMock({ data: makeDetail({
      voucher: {
        id: 'v-1', title: 'Half-price pizza Monday', voucherType: 'BOGO',
        description: 'Half off everything on the menu, Mondays from 5pm.',
        merchant: { id: 'cov', businessName: 'Covelum' },
      },
    })})
    const { getByTestId, getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail-description')).toBeTruthy()
    expect(getByText('Half off everything on the menu, Mondays from 5pm.')).toBeTruthy()
  })

  it('HIDES description row entirely when voucher.description is null', () => {
    setMock({ data: makeDetail({
      voucher: {
        id: 'v-1', title: 'Coffee', voucherType: 'FREEBIE',
        description: null,
        merchant: { id: 'm', businessName: 'M' },
      },
    })})
    const { queryByTestId } = wrap(<RedemptionDetailScreen />)
    expect(queryByTestId('redemption-detail-description')).toBeNull()
  })

  it('renders terms row when terms is present', () => {
    setMock({ data: makeDetail({
      voucher: {
        id: 'v-1', title: 'X', voucherType: 'BOGO',
        terms: 'One per customer per cycle.',
        merchant: { id: 'm', businessName: 'M' },
      },
    })})
    const { getByTestId, getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByTestId('redemption-detail-terms')).toBeTruthy()
    expect(getByText('One per customer per cycle.')).toBeTruthy()
  })

  it('HIDES terms row entirely when voucher.terms is null (no empty row)', () => {
    setMock({ data: makeDetail({
      voucher: {
        id: 'v-1', title: 'X', voucherType: 'BOGO',
        terms: null,
        merchant: { id: 'm', businessName: 'M' },
      },
    })})
    const { queryByTestId, queryByText } = wrap(<RedemptionDetailScreen />)
    expect(queryByTestId('redemption-detail-terms')).toBeNull()
    expect(queryByText('TERMS')).toBeNull()
  })
})

describe('RedemptionDetailScreen — status copy (locked owner direction)', () => {
  it('active state: "Receipt only. To present this code, open Show to Staff on your voucher."', () => {
    setMock({ data: makeDetail({
      redeemedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      isValidated: false,
    })})
    const { getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByText('Receipt only. To present this code, open Show to Staff on your voucher.')).toBeTruthy()
  })

  it('ended state: "Receipt only. The Show to Staff window has ended."', () => {
    setMock({ data: makeDetail({
      redeemedAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
      isValidated: false,
    })})
    const { getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByText('Receipt only. The Show to Staff window has ended.')).toBeTruthy()
  })

  it('validated state: chip "Validated by staff" + secondary date · method line', () => {
    setMock({ data: makeDetail({
      isValidated: true,
      validatedAt: new Date('2026-05-15T09:30:00.000Z').toISOString(),
      validationMethod: 'QR_SCAN',
    })})
    const { getByText } = wrap(<RedemptionDetailScreen />)
    expect(getByText('Validated by staff')).toBeTruthy()
    expect(getByText(/QR scan/)).toBeTruthy()
  })
})

describe('RedemptionDetailScreen — receipt facts', () => {
  it('shows merchant + branch + voucher title + saving + redeemed time + where', () => {
    setMock({ data: makeDetail({
      voucher: {
        id: 'v-1', title: 'Half-price pizza Monday', voucherType: 'BOGO',
        merchant: { id: 'cov', businessName: 'Covelum' },
      },
      branch: {
        id: 'br-1', name: 'Brightlingsea', addressLine1: '12 High Street',
        city: 'Brightlingsea', postcode: 'CO7 0AB',
      },
      estimatedSaving: 12.5,
    })})
    const { getByText, getByTestId } = wrap(<RedemptionDetailScreen />)
    // Merchant + branch combined on a single caption line.
    expect(getByText('Covelum · Brightlingsea')).toBeTruthy()
    expect(getByText('Half-price pizza Monday')).toBeTruthy()
    const saving = getByTestId('redemption-detail-saving')
    // Template literal children render as `['£', '12.50']` — assert
    // both fragments rather than the concatenated string.
    const savingChildren = JSON.stringify(saving.props.children)
    expect(savingChildren).toContain('£')
    expect(savingChildren).toContain('12.50')
    // "Where" fact uses the joined address line — assert as text
    // rather than inspecting the deep React-element children (which
    // include circular Provider refs).
    expect(getByText('12 High Street, Brightlingsea, CO7 0AB')).toBeTruthy()
  })
})

describe('RedemptionDetailScreen — actions', () => {
  it('"See merchant" routes to /(app)/merchant/{merchantId} with from param flowing through', () => {
    mockParams.from = 'savings'
    setMock({ data: makeDetail() })
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    fireEvent.press(getByTestId('redemption-detail-see-merchant'))
    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/merchant/cov?from=savings')
  })

  it('"Review this visit" routes to verified-review URL with redemptionId attribution', () => {
    // §Savings device-QA round-5 fixup 2026-05-18 — Review this
    // visit reuses the verified-review contract locked in PR-C
    // (merge a80f427).  URL shape:
    //   /(app)/merchant/[id]?branch=...&tab=reviews
    //     &openWriteReview=1&fromRedemption=<redemptionId>
    // MerchantProfileScreen reads these params (via
    // `deriveInitialOpenWriteFor`), auto-opens WriteReviewSheet
    // tied to this redemption, and `Review.redemptionId !== null`
    // ⇒ `isVerified: true` on the resulting review.
    setMock({ data: makeDetail({
      id:        'red-xyz',
      branchId:  'br-1',
      voucher: {
        id: 'v-1', title: 'X', voucherType: 'BOGO',
        merchant: { id: 'cov-merchant', businessName: 'Covelum' },
      },
    })})
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    fireEvent.press(getByTestId('redemption-detail-review-this-visit'))

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(app)/merchant/[id]',
      params: {
        id:              'cov-merchant',
        branch:          'br-1',
        tab:             'reviews',
        openWriteReview: '1',
        fromRedemption:  'red-xyz',
      },
    })
  })

  it('REGRESSION: Review this visit passes the REDEMPTION id (not the voucher id) as fromRedemption', () => {
    // Critical attribution: fromRedemption must be the redemption.id
    // so the backend's PR-C Path A maps Review.redemptionId to this
    // specific event.  Pinning to a fixture where redemption.id and
    // voucher.id are distinct strings catches any future swap.
    setMock({ data: makeDetail({
      id: 'red-distinct',
      voucher: {
        id: 'v-distinct', title: 'X', voucherType: 'BOGO',
        merchant: { id: 'm', businessName: 'M' },
      },
    })})
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    fireEvent.press(getByTestId('redemption-detail-review-this-visit'))

    const call = mockRouterPush.mock.calls[0][0] as { params: { fromRedemption: string } }
    expect(call.params.fromRedemption).toBe('red-distinct')
    expect(call.params.fromRedemption).not.toBe('v-distinct')
  })
})

describe('RedemptionDetailScreen — back navigation', () => {
  it('back button routes home to /(app)/savings when ?from=savings', () => {
    mockParams.from = 'savings'
    setMock({ data: makeDetail() })
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    fireEvent.press(getByTestId('redemption-detail-back'))
    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/savings')
    expect(mockRouterBack).not.toHaveBeenCalled()
  })

  it('back button falls back to router.back() when from param is absent', () => {
    delete mockParams.from
    setMock({ data: makeDetail() })
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    fireEvent.press(getByTestId('redemption-detail-back'))
    expect(mockRouterBack).toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})
