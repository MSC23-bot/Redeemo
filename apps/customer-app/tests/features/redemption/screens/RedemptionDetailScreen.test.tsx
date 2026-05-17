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
  it('renders REUSABLE redemption as "Reusable voucher" eyebrow', () => {
    setMock({ data: makeDetail({
      voucher: {
        id: 'v-r', title: 'Coffee club', voucherType: 'REUSABLE',
        merchant: { id: 'cov', businessName: 'Covelum' },
      },
    })})
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    const eyebrow = getByTestId('redemption-detail-type-eyebrow')
    expect(JSON.stringify(eyebrow.props.children)).toContain('Reusable voucher')
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
    const eyebrow = getByTestId('redemption-detail-type-eyebrow')
    expect(JSON.stringify(eyebrow.props.children)).toContain('Time limited voucher')
    expect(getByText('Lunch deal 12-2pm')).toBeTruthy()
  })

  it('renders FREEBIE redemption with full receipt', () => {
    setMock({ data: makeDetail({
      voucher: {
        id: 'v-f', title: 'Free coffee Friday', voucherType: 'FREEBIE',
        merchant: { id: 'm', businessName: 'Coffee Co' },
      },
    })})
    const { getByTestId, getByText } = wrap(<RedemptionDetailScreen />)
    const eyebrow = getByTestId('redemption-detail-type-eyebrow')
    expect(JSON.stringify(eyebrow.props.children)).toContain('Freebie voucher')
    expect(getByText('Free coffee Friday')).toBeTruthy()
  })

  it('renders BOGO redemption as "Buy one, get one free voucher" eyebrow', () => {
    setMock({ data: makeDetail() })  // default BOGO
    const { getByTestId } = wrap(<RedemptionDetailScreen />)
    const eyebrow = getByTestId('redemption-detail-type-eyebrow')
    expect(JSON.stringify(eyebrow.props.children)).toContain('Buy one, get one free voucher')
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
    expect(getByText('Covelum')).toBeTruthy()
    expect(getByText('Brightlingsea')).toBeTruthy()
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
