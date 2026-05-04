import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { VoucherCard } from '@/features/merchant/components/VoucherCard'
import type { MerchantVoucher } from '@/lib/api/merchant'

// Round 5 §1: voucher card rebuilt as a gradient ticket per user
// direction. The visible layout is now:
//   • Vertical short label in the sidebar (BOGO / FREE / SAVE
//     / DEAL / % OFF / £ OFF / LIMITED / REUSE)
//   • Hero £value + OFF suffix
//   • Title (1–2 lines)
//   • Single-line description
//   • Bottom row: expiry/redeemed-status + Redeem CTA / REDEEMED stamp
const mk = (overrides?: Partial<MerchantVoucher>): MerchantVoucher => ({
  id: 'v1',
  type: 'FREEBIE',
  title: 'Free Filter Coffee with Any Thali',
  description: 'Order any thali plate and get a complimentary coffee.',
  estimatedSaving: 2.5,
  expiryDate: null,
  terms: 'T&Cs apply',
  imageUrl: null,
  ...overrides,
})

describe('VoucherCard — round 5 §1 gradient ticket', () => {
  it('renders the short vertical label + hero value + title + description', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    // Vertical sidebar label is the SHORT version (FREEBIE → 'FREE').
    expect(getByText('FREE')).toBeTruthy()
    // Hero £value with the OFF suffix split into two text nodes.
    expect(getByText('£2.5')).toBeTruthy()
    expect(getByText('OFF')).toBeTruthy()
    expect(getByText('Free Filter Coffee with Any Thali')).toBeTruthy()
    expect(getByText(/complimentary coffee/)).toBeTruthy()
  })

  it('renders the Redeem CTA on non-redeemed vouchers', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText('Redeem')).toBeTruthy()
  })

  it('replaces the Redeem CTA with REDEEMED stamp when isRedeemed', () => {
    const { queryByText, getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(queryByText('Redeem')).toBeNull()
    expect(getByText('REDEEMED')).toBeTruthy()
    expect(getByText('Redeemed this cycle')).toBeTruthy()
  })

  it('fires onPress when card body tapped', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={onPress}
        onToggleFavourite={() => {}}
      />,
    )
    fireEvent.press(getByLabelText(/FREE ITEM voucher/))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('fires onToggleFavourite when heart tapped (not card onPress)', () => {
    const onPress = jest.fn()
    const onToggleFavourite = jest.fn()
    const { getByLabelText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={onPress}
        onToggleFavourite={onToggleFavourite}
      />,
    )
    fireEvent.press(getByLabelText('Add to favourites'))
    expect(onToggleFavourite).toHaveBeenCalledTimes(1)
  })

  it('renders the correct vertical short label per voucher type', () => {
    const types: Array<{ type: MerchantVoucher['type']; label: string }> = [
      { type: 'FREEBIE',          label: 'FREE' },
      { type: 'BOGO',             label: 'BOGO' },
      { type: 'DISCOUNT_FIXED',   label: '£ OFF' },
      { type: 'DISCOUNT_PERCENT', label: '% OFF' },
      { type: 'SPEND_AND_SAVE',   label: 'SAVE' },
      { type: 'PACKAGE_DEAL',     label: 'DEAL' },
      { type: 'TIME_LIMITED',     label: 'LIMITED' },
      { type: 'REUSABLE',         label: 'REUSE' },
    ]
    for (const t of types) {
      const { getByText } = render(
        <VoucherCard
          voucher={mk({ type: t.type })}
          isRedeemed={false}
          isFavourited={false}
          onPress={() => {}}
          onToggleFavourite={() => {}}
        />,
      )
      expect(getByText(t.label)).toBeTruthy()
    }
  })

  it('shows expiry text when expiryDate is set', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk({ expiryDate: '2026-12-28T00:00:00.000Z' })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText(/Expires 28 Dec/)).toBeTruthy()
  })

  it('shows "No expiry" placeholder when expiryDate is null', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk({ expiryDate: null })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText('No expiry')).toBeTruthy()
  })
})
