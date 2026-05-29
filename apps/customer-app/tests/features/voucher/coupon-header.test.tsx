import React from 'react'
import { Text, View } from 'react-native'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CouponHeader } from '@/features/voucher/components/CouponHeader'

// Phase 3C.1g M2.10 — CouponHeader embeds `<FavouriteHeart>` which
// needs a `<QueryClientProvider>` in scope.  Wrap render here so
// existing test bodies stay untouched.
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return rtlRender(node, { wrapper: Wrapper })
}

const BASE_PROPS = {
  type: 'BOGO' as const,
  title: 'Sample voucher',
  description: 'A sample voucher description',
  estimatedSaving: 5,
  insetTop: 0,
  onBack: jest.fn(),
  onShare: jest.fn(),
  // Phase 3C.1g M2.10 — branch-keyed contract; props renamed from
  // `onFav` / `isFavourited` to the FavouriteHeart-driven shape.
  voucherId:           'v-1',
  voucherIsFavourited: false,
  isRedeemedThisCycle: false,
}

describe('CouponHeader — statusBlock slot + TL description suppression (M4d Task C.1)', () => {
  it('renders description for non-TL voucher types (unchanged behaviour)', () => {
    const { getByText } = render(<CouponHeader {...BASE_PROPS} />)
    expect(getByText('A sample voucher description')).toBeTruthy()
  })

  it('suppresses description when type is TIME_LIMITED', () => {
    const { queryByText } = render(
      <CouponHeader {...BASE_PROPS} type="TIME_LIMITED" />,
    )
    expect(queryByText('A sample voucher description')).toBeNull()
  })

  it('mounts the statusBlock slot when type is TIME_LIMITED and statusBlock is provided', () => {
    const { getByTestId } = render(
      <CouponHeader
        {...BASE_PROPS}
        type="TIME_LIMITED"
        statusBlock={<View testID="status-slot-content"><Text>STATUS</Text></View>}
      />,
    )
    expect(getByTestId('status-slot-content')).toBeTruthy()
  })

  it('does NOT render the statusBlock slot when type is non-TL (defensive scope fence)', () => {
    const { queryByTestId, getByText } = render(
      <CouponHeader
        {...BASE_PROPS}
        type="BOGO"
        statusBlock={<View testID="status-slot-content"><Text>STATUS</Text></View>}
      />,
    )
    // The slot prop is ignored for non-TL types — description renders, statusBlock does not.
    expect(getByText('A sample voucher description')).toBeTruthy()
    expect(queryByTestId('status-slot-content')).toBeNull()
  })

  it('suppresses description when type is TIME_LIMITED even if no statusBlock is provided (defensive)', () => {
    // During dev (Phase G not yet wired) the TL voucher detail screen may
    // mount CouponHeader without a statusBlock. The hero shouldn't fall
    // back to showing description copy in that interim — it stays empty,
    // and the HeroStatusBlock takes the slot once Phase G ships.
    const { queryByText } = render(
      <CouponHeader {...BASE_PROPS} type="TIME_LIMITED" />,
    )
    expect(queryByText('A sample voucher description')).toBeNull()
  })

  it('renders title for all voucher types (sanity)', () => {
    const TL = render(<CouponHeader {...BASE_PROPS} type="TIME_LIMITED" />)
    const BOGO = render(<CouponHeader {...BASE_PROPS} type="BOGO" />)
    expect(TL.getByText('Sample voucher')).toBeTruthy()
    expect(BOGO.getByText('Sample voucher')).toBeTruthy()
  })
})
