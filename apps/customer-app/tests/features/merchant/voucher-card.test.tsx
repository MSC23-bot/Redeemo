import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { VoucherCard } from '@/features/merchant/components/VoucherCard'
import type { MerchantVoucher } from '@/lib/api/merchant'

// Round 5 §2: voucher card aligned to the customer-web brand —
// pastel TYPE_STYLES + sentence-case TYPE_LABELS, smart £ formatting
// (£5 for whole pounds, £5.50 for pennies).
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

describe('VoucherCard — round 5 §2 pastel ticket', () => {
  it('renders the sentence-case vertical label + hero value + title + description', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    // Vertical sidebar uses the website's sentence-case label
    // (FREEBIE → 'Freebie').
    expect(getByText('Freebie')).toBeTruthy()
    // Hero £value with OFF suffix (2.5 → "£2.50" — has pennies).
    expect(getByText('£2.50')).toBeTruthy()
    expect(getByText('OFF')).toBeTruthy()
    expect(getByText('Free Filter Coffee with Any Thali')).toBeTruthy()
    expect(getByText(/complimentary coffee/)).toBeTruthy()
  })

  it('formats whole-pound savings without decimals (£5 not £5.00)', () => {
    const { getByText, queryByText } = render(
      <VoucherCard
        voucher={mk({ estimatedSaving: 5 })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText('£5')).toBeTruthy()
    expect(queryByText('£5.00')).toBeNull()
  })

  it('formats penny-bearing savings with two decimals (2.5 → £2.50)', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk({ estimatedSaving: 2.5 })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText('£2.50')).toBeTruthy()
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
    // a11y label uses the sentence-case label.
    fireEvent.press(getByLabelText(/Freebie voucher/))
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

  it('renders the correct sentence-case label per voucher type', () => {
    const types: Array<{ type: MerchantVoucher['type']; label: string }> = [
      { type: 'FREEBIE',          label: 'Freebie' },
      { type: 'BOGO',             label: 'Buy One Get One' },
      { type: 'DISCOUNT_FIXED',   label: 'Discount' },
      { type: 'DISCOUNT_PERCENT', label: 'Discount' },
      { type: 'SPEND_AND_SAVE',   label: 'Spend & Save' },
      { type: 'PACKAGE_DEAL',     label: 'Package Deal' },
      { type: 'TIME_LIMITED',     label: 'Time Limited' },
      { type: 'REUSABLE',         label: 'Reusable' },
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
