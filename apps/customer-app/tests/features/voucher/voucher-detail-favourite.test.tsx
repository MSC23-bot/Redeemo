/**
 * Phase 3C.1g M2.10 — §O4 closure pin.
 *
 * Before M2.10, Voucher Detail's CouponHeader heart was wired to a
 * `handleFav` stub that fired `Alert.alert('Coming next milestone',
 * ...)` — visible UX regression vs every other surface where the
 * heart actually worked.  After M2.10, CouponHeader embeds
 * `<FavouriteHeart entity="voucher" id={voucher.id}
 *   initialIsFavourited={voucher.isFavourited} tone="on-dark"
 *   contextualQueryKey={['voucher', voucherId]}
 *   disabled={isRedeemedThisCycle} />` and pressing it fires the
 * real POST to `/api/v1/customer/favourites/vouchers/:id`.
 *
 * This pin asserts the closure: the heart is rendered as a child of
 * CouponHeader (`testID="voucher-detail-favourite"`) AND pressing it
 * fires `api.post` (not `Alert.alert`).
 */

import React from 'react'
import { render, fireEvent, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useSharedValue } from 'react-native-reanimated'
import { api } from '@/lib/api'
import { CouponHeader } from '@/features/voucher/components/CouponHeader'

jest.spyOn(api, 'post')
jest.spyOn(api, 'del')

const initialMetrics = {
  frame:  { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function renderCouponHeader(props: {
  voucherId?:           string
  voucherIsFavourited?: boolean
  isRedeemedThisCycle?: boolean
}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    )
  }
  function Harness() {
    const scrollY = useSharedValue(0)
    return (
      <CouponHeader
        type="BOGO"
        title="BOGO Coffee"
        description={null}
        estimatedSaving={5}
        insetTop={59}
        onBack={() => {}}
        onShare={() => {}}
        voucherId={props.voucherId ?? 'v-1'}
        voucherIsFavourited={props.voucherIsFavourited ?? false}
        isRedeemedThisCycle={props.isRedeemedThisCycle ?? false}
        scrollY={scrollY}
      />
    )
  }
  return render(<Harness />, { wrapper: Wrapper })
}

beforeEach(() => {
  ;(api.post as jest.Mock).mockReset()
  ;(api.del  as jest.Mock).mockReset()
})

describe('CouponHeader — §O4 heart closure (Phase 3C.1g M2.10)', () => {
  it('renders <FavouriteHeart> with testID="voucher-detail-favourite" inside the nav row', () => {
    const { getByTestId } = renderCouponHeader({})
    expect(getByTestId('voucher-detail-favourite')).toBeTruthy()
  })

  it('press fires api.post to /favourites/vouchers/:id — NOT an Alert stub', async () => {
    ;(api.post as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { getByTestId } = renderCouponHeader({ voucherId: 'v-1' })
    await act(async () => { fireEvent.press(getByTestId('voucher-detail-favourite')) })

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/customer/favourites/vouchers/v-1', undefined)
    })
  })

  it('disabled=true (isRedeemedThisCycle) suppresses press', async () => {
    const { getByTestId } = renderCouponHeader({
      voucherId:           'v-1',
      isRedeemedThisCycle: true,
    })
    await act(async () => { fireEvent.press(getByTestId('voucher-detail-favourite')) })

    expect(api.post).not.toHaveBeenCalled()
    expect(api.del).not.toHaveBeenCalled()
  })

  it('a11y label flips on initial state', () => {
    const { getByLabelText, rerender } = renderCouponHeader({ voucherIsFavourited: false })
    expect(getByLabelText('Add to favourites')).toBeTruthy()

    // Re-render with the flipped flag.  FavouriteHeart's useEffect
    // resyncs to the new initialIsFavourited.
    rerender(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <QueryClientProvider client={new QueryClient()}>
          {/* eslint-disable-next-line react-hooks/rules-of-hooks */}
          {(() => {
            const scrollY = useSharedValue(0)
            return (
              <CouponHeader
                type="BOGO"
                title="BOGO Coffee"
                description={null}
                estimatedSaving={5}
                insetTop={59}
                onBack={() => {}}
                onShare={() => {}}
                voucherId="v-1"
                voucherIsFavourited={true}
                isRedeemedThisCycle={false}
                scrollY={scrollY}
              />
            )
          })()}
        </QueryClientProvider>
      </SafeAreaProvider>,
    )
    expect(getByLabelText('Remove from favourites')).toBeTruthy()
  })
})
